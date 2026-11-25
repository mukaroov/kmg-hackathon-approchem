// Этапы конвейера до записи слоя: план шагов → узлы → проверки и исправление → смысловая проверка → добор заданий.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { splitUnits, numbers } from '../../build/lib/source.mjs';
import { outlineSchema, nodeSchema, verifySchema, tasksSchema } from './schemas.mjs';
import { checkNode } from './checks.mjs';

const PROMPTS = path.join(ROOT, 'pipeline', 'prompts');
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
export function tpl(name, vars) {
  return fs.readFileSync(path.join(PROMPTS, name + '.md'), 'utf8').replace(/\{\{([\w.]+)\}\}/g, (m, k) => { const v = get(vars, k); return v == null ? '' : Array.isArray(v) ? v.join('\n') : String(v); });
}

const pageText = (S, a, b) => { let t = ''; for (let p = a; p <= b; p++) if (S.pages[p] != null) t += `<!-- page ${p} -->\n${S.pages[p].trim()}\n\n`; return t; };
const unitLine = u => `${u.unit_id} · с. ${u.page_pdf} · ${u.kind}${u.figNo ? ' (рис. ' + u.figNo + ')' : ''} · ${u.excerpt}`;
// для плана без полного текста: начало единицы подлиннее (до 30 слов), чтобы модель видела, о чём она
const unitLineLong = u => `${u.unit_id} · с. ${u.page_pdf} · ${u.kind}${u.figNo ? ' (рис. ' + u.figNo + ')' : ''} · ${u.text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/[#*|$\\━]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 30).join(' ')}`;
const TYPES = ['single', 'multi', 'order', 'blank', 'calc'];

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// --- план шагов и проверка, что каждая единица главы попала в шаг ---
function fixOutline(o, units, warnings) {
  const order = new Map(units.map((u, i) => [u.unit_id, i]));
  const seen = new Set();
  const flat = [];
  for (const p of o.parts || []) for (const nd of p.nodes || []) {
    nd.units = (nd.units || []).filter(id => { if (!order.has(id)) { warnings.push(`план: шаг «${nd.title}» ссылается на несуществующую единицу ${id} — убрана`); return false; } if (seen.has(id)) return false; seen.add(id); return true; });
    flat.push({ p, nd });
  }
  // пропущенные единицы — в шаг, где лежит ближайшая предыдущая единица
  const missing = units.filter(u => !seen.has(u.unit_id));
  for (const u of missing) {
    const i = order.get(u.unit_id);
    let best = null;
    for (const { nd } of flat) for (const id of nd.units) { const j = order.get(id); if (j < i && (!best || j > best.j)) best = { nd, j }; }
    const target = best ? best.nd : flat[0]?.nd;
    if (target) target.units.push(u.unit_id);
  }
  if (missing.length) warnings.push(`план: ${missing.length} единиц главы модель не назначила ни одному шагу; конвейер добавил их в шаг с ближайшей предыдущей единицей: ${missing.slice(0, 15).map(u => u.unit_id).join(', ')}${missing.length > 15 ? '…' : ''}`);
  // пустые шаги и части убираем, номера и связи пересчитываем
  const renum = new Map(); let k = 0;
  for (const p of o.parts) p.nodes = p.nodes.filter(nd => nd.units.length);
  o.parts = o.parts.filter(p => p.nodes.length);
  for (const p of o.parts) for (const nd of p.nodes) { renum.set(nd.n, ++k); nd.n = k; nd.units.sort((a, b) => order.get(a) - order.get(b)); }
  for (const p of o.parts) for (const nd of p.nodes) nd.after = [...new Set((nd.after || []).map(x => renum.get(x)).filter(x => x && x < nd.n))];
  return { missing: missing.length };
}

function outlineErrors(o, units) {
  const all = new Set(units.map(u => u.unit_id)), seen = new Set(), errs = [];
  for (const p of o.parts || []) for (const nd of p.nodes || []) for (const id of nd.units || []) { if (!all.has(id)) errs.push(`единицы ${id} нет в главе`); seen.add(id); }
  const miss = [...all].filter(id => !seen.has(id));
  if (miss.length) errs.push(`не назначены шагам единицы: ${miss.join(', ')}`);
  if (!(o.parts || []).some(p => (p.nodes || []).length)) errs.push('нет ни одного шага');
  return errs;
}

export async function buildLayer({ S, from, to, name, domain, llm, cfg, log, progress, start, end }) {
  const warnings = [];
  // границы главы внутри страниц: регулярные выражения начала и конца (--start, --end)
  const units = splitUnits(S, from, to, start ? new RegExp(start, 'm') : null, end ? new RegExp(end, 'm') : null);
  if (!units.length) throw new Error('в главе не найдено ни одной единицы текста');
  const chapterNums = new Set(); for (let p = from; p <= to; p++) for (const x of numbers(S.pages[p] || '')) chapterNums.add(x);
  const sys = tpl('system', { domain: { ...domain, hints: (domain.hints || []).map(h => '- ' + h) } });
  const misc = domain.misconceptionsList?.length ? domain.misconceptionsList.map(m => `${m.id} — ${m.text}`) : ['(списка нет — ставь "")'];
  const diffText = Object.entries(domain.difficulty).map(([k, v]) => `${k} — ${v}`).join(', ');
  const target = Math.max(3, Math.min(30, Math.round(units.length / 9)));

  // 1. план
  progress('outline', 0, 1, `план шагов: ${units.length} единиц главы`);
  let full = pageText(S, from, to), lines = units.map(unitLine);
  if (full.length > cfg.outlineTextLimit) { log(`план: глава ${full.length} знаков — в запрос идёт список единиц с началами, без полного текста (OUTLINE_TEXT_LIMIT)`); full = '(полный текст не прислан из-за размера: опирайся на список единиц и их начала)'; lines = units.map(unitLineLong); }
  const oUser = tpl('outline', { units: lines, text: full, targetNodes: target, difficulty: diffText });
  let o = (await llm.json({ stage: 'layer', name: 'outline', system: sys, user: oUser, schema: outlineSchema, task: { stage: 'outline', units } })).data;
  for (let r = 0; r < cfg.repairRounds; r++) {
    const errs = outlineErrors(o, units);
    if (!errs.length) break;
    log(`план: ${errs.length} замечаний, модель исправляет (круг ${r + 1})`);
    o = (await llm.json({ stage: 'layer', name: 'outline', system: sys, user: oUser + `\n\nТвой прошлый ответ:\n${JSON.stringify(o)}\n\nОшибки в нём:\n- ${errs.join('\n- ')}\nВерни разбиение целиком заново, исправив ошибки.`, schema: outlineSchema, task: { stage: 'outline', units } })).data;
  }
  const fixedOutline = fixOutline(o, units, warnings);
  const plan = o.parts.flatMap((p, pi) => p.nodes.map(nd => ({ ...nd, part: pi })));
  progress('outline', 1, 1, `план: ${o.parts.length} частей, ${plan.length} шагов`);
  const byId = new Map(units.map(u => [u.unit_id, u]));
  const outlineText = plan.map(nd => `${nd.n}. ${nd.title} (${nd.bookTitle})`);

  // 2. узлы
  let done = 0;
  const results = await pool(plan, cfg.concurrency, async nd => {
    const us = nd.units.map(id => byId.get(id));
    const pa = Math.min(...us.map(u => u.page_pdf)), pb = Math.max(...us.map(u => u.page_pdf));
    const text = pageText(S, pa, pb);
    const ctx = { S, from, to, chapterNums };
    const user = tpl('node', { n: nd.n, total: plan.length, title: nd.title, bookTitle: nd.bookTitle, part: o.parts[nd.part].title, difficulty: `${nd.difficulty.primary}${nd.difficulty.secondary ? ', ' + nd.difficulty.secondary : ''} (${diffText})`, threshold: nd.threshold ? 'да' : 'нет', dataDecision: nd.dataDecision ? 'да' : 'нет', after: nd.after.length ? nd.after.join(', ') : 'нет', outline: outlineText, units: us.map(unitLine), pages: `${pa}–${pb}`, text, misconceptions: misc });
    const task = { stage: 'node', node: { ...nd, units: us, pages: [pa, pb] } };
    let data = (await llm.json({ stage: 'layer', name: 'node', system: sys, user, schema: nodeSchema, task })).data;
    let ck = checkNode(data, ctx);
    const allFixes = [...ck.fixes];
    for (let r = 0; r < cfg.repairRounds && (ck.hard.length || (r === 0 && ck.soft.length)); r++) {
      const errs = r === 0 ? [...ck.hard, ...ck.soft] : ck.hard;
      const fixed = (await llm.json({ stage: 'layer', name: 'node', system: sys, user: user + '\n\n' + tpl('repair', { errors: errs.map(e => '- ' + e), previous: JSON.stringify(data), pages: `${pa}–${pb}`, text }), schema: nodeSchema, task: { stage: 'repair', previous: data } })).data;
      const ck2 = checkNode(fixed, ctx);
      if (ck2.hard.length <= ck.hard.length) { data = fixed; ck = ck2; allFixes.push(...ck2.fixes); } else break;
    }
    // 3. смысловая проверка (модуль проверки) и одно исправление по найденным ошибкам
    let issues = [];
    if (cfg.verify) {
      issues = (await llm.json({ stage: 'review', name: 'verify', system: sys, user: tpl('verify', { node: JSON.stringify({ title: data.title, essence: data.essence, how: data.how, claims: data.claims, tasks: data.tasks, card: data.card, mistake: data.mistake, analogy: data.analogy, itAnalogy: data.itAnalogy, data: data.data }), pages: `${pa}–${pb}`, text }), schema: verifySchema, task: { stage: 'verify' } })).data.issues || [];
      const serious = issues.filter(x => x.severity >= 2);
      if (serious.length) {
        const fixed = (await llm.json({ stage: 'review', name: 'node', system: sys, user: user + '\n\n' + tpl('repair', { errors: serious.map(x => `- ${x.where}: ${x.problem} Должно быть: ${x.fix} (с. ${x.page}; автор: «${x.quote}»)`), previous: JSON.stringify(data), pages: `${pa}–${pb}`, text }), schema: nodeSchema, task: { stage: 'repair', previous: data } })).data;
        const ck2 = checkNode(fixed, ctx);
        if (ck2.hard.length <= ck.hard.length) { data = fixed; ck = ck2; allFixes.push(...ck2.fixes); issues.forEach(x => { if (x.severity >= 2) x.applied = true; }); }
      }
    }
    progress('nodes', ++done, plan.length, `шаг ${nd.n}: ${data.title}`);
    return { plan: nd, data, pages: [pa, pb], hard: ck.hard, soft: ck.soft, fixes: allFixes, issues };
  });

  // 4. добор заданий до 15 и 4 типов
  const count = () => results.reduce((a, r) => a + (r.data.tasks || []).length, 0);
  const types = () => new Set(results.flatMap(r => (r.data.tasks || []).map(t => t.type)));
  for (let round = 0; round < 3 && (count() < 15 || types().size < 4); round++) {
    const missing = TYPES.filter(t => !types().has(t) && t !== 'calc');
    const need = Math.max(1, Math.ceil((15 - count()) / Math.max(1, Math.min(results.length, 5))));
    const targets = results.slice().sort((a, b) => (a.data.tasks || []).length - (b.data.tasks || []).length).slice(0, Math.min(results.length, 5));
    log(`заданий ${count()}, типов ${types().size}: добор заданий в ${targets.length} шагах`);
    for (const r of targets) {
      const have = (r.data.tasks || []).length;
      const ids = Array.from({ length: need + 1 }, (_, i) => 't' + (have + i + 1));
      const out = (await llm.json({ stage: 'layer', name: 'tasks', system: sys, user: tpl('tasks', { count: count(), types: [...types()].join(', ') || 'нет', need, title: r.data.title, missing: missing.join(', ') || 'любых', ids: ids.join(', '), claims: (r.data.claims || []).map(c => `${c.id}: ${c.text} (цитата: «${c.quote}», с. ${c.page})`), how: (r.data.how || []).map(h => h.text) }), schema: tasksSchema, task: { stage: 'tasks', node: r.data, ids } })).data.tasks || [];
      const used = new Set((r.data.tasks || []).map(t => t.id));
      const fresh = out.filter(t => !used.has(t.id));
      const trial = { ...r.data, tasks: fresh };
      const bad = new Set(checkNode(trial, { S, from, to, chapterNums }).hard.map(e => (e.match(/^задание (\S+)/) || [])[1]).filter(Boolean));
      r.data.tasks = [...(r.data.tasks || []), ...fresh.filter(t => !bad.has(t.id))];
    }
  }
  return { outline: o, units, results, warnings, missingUnits: fixedOutline.missing };
}
