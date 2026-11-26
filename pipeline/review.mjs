#!/usr/bin/env node
// Модуль проверки: чужой черновик по главе (schemas/review_package.schema.json) → замечания (schemas/review_output.schema.json).
//   node pipeline/review.mjs <package.json> [--chapter <md главы>] [--out <ответ.json>] [--team <имя>]
// 1) автоматическая сверка: цитата на указанной странице, «всегда/любой» и числа, которых нет в цитате, переворот знака;
// 2) суждение модели по группам элементов (страницы главы + сигналы сверки), кадры — вместе со спецификацией сцены;
// 3) замечания проверяются: цель из пакета, страница в главе, цитата дословно на этой странице; одно замечание на цель.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig, providerOverrides } from './lib/config.mjs';
import { createLLM } from './lib/llm.mjs';
import { tpl } from './lib/stages.mjs';
import { loadDomain } from './lib/jobs.mjs';
import { validate } from '../build/lib/jsonschema.mjs';
import { readSource, quoteOnPage, locateQuote, numbers, plain } from '../build/lib/source.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const pkgArg = args.find((a, i) => !a.startsWith('--') && !String(args[i - 1] || '').startsWith('--'));
if (!pkgArg) { console.log('Использование: node pipeline/review.mjs <package.json> [--chapter <md>] [--out <ответ.json>] [--team <имя>]'); process.exit(2); }

const pkgFile = path.resolve(pkgArg), pkgDir = path.dirname(pkgFile);
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const schema = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', n), 'utf8'));
const inErr = validate(pkg, schema('review_package.schema.json'));
if (inErr.length) { console.error('✗ пакет не соответствует review_package.schema.json:\n  - ' + inErr.slice(0, 10).join('\n  - ')); process.exit(2); }
const chapterFile = path.resolve(opt('chapter') || path.join(pkgDir, pkg.chapter_file));
if (!fs.existsSync(chapterFile)) { console.error(`нет md главы: ${chapterFile} (укажите --chapter)`); process.exit(2); }
const S = readSource(chapterFile);
const PAGES = Object.keys(S.pages).map(Number).sort((a, b) => a - b);
const outFile = path.resolve(opt('out') || path.join(ROOT, 'work', 'review', pkg.package_id, 'answer.json'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
// --provider agent|cli:claude|openai-compatible|… и --cli-model sonnet|opus — как у pipeline/run.mjs; без них — модель из .env
const cfg = (a => { const o = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; }; return loadConfig(providerOverrides(o('provider'), o('cli-model'), loadConfig().model)); })(process.argv.slice(2));
const log = m => console.log('  ' + m);
const meter = {};
const llm = createLLM(cfg, { log, meter });
const domain = loadDomain('geo');

const items = pkg.items || [], frames = pkg.frames || [];
const byId = new Map(items.map(i => [i.id, i]));
const spec = (pkg.scenes || [])[0]?.spec || null;
const specOne = p => String(p || '').trim().split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? +k : k]), spec);
// spec_path может перечислять несколько мест через «;»
const specAt = p => {
  const ps = String(p || '').split(';').map(s => s.trim()).filter(Boolean);
  if (ps.length <= 1) return specOne(ps[0]);
  const o = {}; for (const x of ps) o[x] = specOne(x) ?? null;
  return Object.values(o).every(v => v === null) ? undefined : o;
};

// ---------- 1. автоматическая сверка ----------
const low = s => plain(s).toLowerCase().replace(/ё/g, 'е');
const ABS = ['всегда', 'никогда', 'любой', 'любая', 'любое', 'любые', 'любых', 'любом', 'всех', 'все', 'только', 'единственн', 'обязательно', 'невозможн', 'полностью', 'исключительно', 'однозначно', 'всюду', 'везде', 'независимо'];
const EXACT = new Set(['все', 'всех', 'только', 'над', 'под', 'верх', 'низ', 'рост']);
const hasWord = (t, w) => new RegExp(`(^|[^а-яa-z])${w}${EXACT.has(w) ? '(?![а-яa-z])' : ''}`, 'i').test(t);
const PAIRS = [['выше', 'ниже'], ['больше', 'меньше'], ['увелич', 'уменьш'], ['возраста', 'убыва'], ['рост', 'паден'], ['повыш', 'пониж'], ['высок', 'низк'], ['прям', 'обратн'], ['усили', 'ослаб'], ['положител', 'отрицател'], ['над', 'под'], ['сверху', 'снизу'], ['верх', 'низ'], ['пресн', 'солен'], ['завыш', 'заниж'], ['низк', 'умеренн'], ['мал', 'умеренн'], ['незначительн', 'значительн']];
function compare(text, quote, page) {
  const s = [], t = low(text), q = low(quote || ''), pg = low(S.pages[page] || '');
  for (const w of ABS) if (hasWord(t, w) && !hasWord(q, w)) s.push(`«${w}…» есть в тексте, но не в цитате — проверить сверхобобщение`);
  for (const [a, b] of PAIRS) {
    if (hasWord(t, a) && !hasWord(t, b) && hasWord(q, b) && !hasWord(q, a)) s.push(`в тексте «${a}…», в цитате «${b}…» — проверить переворот`);
    if (hasWord(t, b) && !hasWord(t, a) && hasWord(q, a) && !hasWord(q, b)) s.push(`в тексте «${b}…», в цитате «${a}…» — проверить переворот`);
  }
  // лишняя фраза: в тексте больше предложений, чем в цитате, — модель могла дописать вывод шире главы
  const sent = x => plain(x).split(/[.!?](?:\s|$)/).filter(y => y.trim().split(/\s+/).length >= 3).length;
  // ослабленное или подменённое условие: качественное уточнение есть в тексте, но не в цитате
  for (const w of ['умеренн', 'незначительн', 'значительн', 'сильн', 'слаб']) if (hasWord(t, w) && !hasWord(q, w)) s.push(`уточнения «${w}…» нет в цитате — проверить, не ослаблено ли условие`);
  if (quote && sent(text) > sent(quote)) s.push('в тексте фраз больше, чем в цитате — проверить, не шире ли добавленная фраза главы');
  const qn = new Set(numbers(quote || '')), pn = new Set(numbers(pg));
  const miss = numbers(text).filter(n => !qn.has(n) && !pn.has(n));
  if (miss.length) s.push(`чисел ${miss.join(', ')} нет ни в цитате, ни на с. ${page}`);
  return s;
}
function quoteSignal(it) {
  if (!it.quote) return [];
  if (quoteOnPage(it.quote, S, it.page_pdf)) return [];
  const other = PAGES.find(p => quoteOnPage(it.quote, S, p));
  if (other) return [`цитата дословно лежит на с. ${other}, а указана с. ${it.page_pdf}`];
  const L = locateQuote(it.quote, S, it.page_pdf);
  if (L && L.score >= 0.9) return L.page === it.page_pdf ? [] : [`цитата найдена на с. ${L.page}, а указана с. ${it.page_pdf}`];
  return [L ? `цитата не дословна: ближайшее совпадение ${L.score} на с. ${L.page}: «${L.text.slice(0, 160)}»` : 'цитата не найдена в главе'];
}
const signals = new Map();
const add = (id, xs) => xs.length && signals.set(id, [...(signals.get(id) || []), ...xs]);
for (const it of items) {
  if (it.type === 'claim') { add(it.id, quoteSignal(it)); add(it.id, compare(it.text, it.quote, it.page_pdf)); }
  if (it.type === 'analogy' && !String(it.breaks_where || '').trim()) add(it.id, ['не указано, где аналогия перестаёт работать']);
  if (it.type === 'script_line') {
    const c = byId.get(it.claim_ref);
    if (!c) add(it.id, [`claim_ref ${it.claim_ref} нет в пакете`]);
    else add(it.id, compare(it.text, c.quote, c.page_pdf).map(x => x + ` (утверждение ${c.id})`));
  }
  if (it.type === 'scene_fact' && spec && specAt(it.spec_path) === undefined) add(it.id, [`в спецификации нет пути ${it.spec_path}`]);
}
const sigCount = [...signals.values()].reduce((a, x) => a + x.length, 0);
log(`сверка: ${items.length} элементов и ${frames.length} кадров, сигналов ${sigCount} у ${signals.size} целей`);

// ---------- 2. группы для модели ----------
const claimsOf = ids => ids.map(id => byId.get(id)).filter(Boolean);
const lineAt = t => items.find(i => i.type === 'script_line' && i.t_start <= t && t < i.t_end) || null;
const videoNodes = new Set([...items.filter(i => i.type === 'script_line' || i.type === 'scene_fact').map(i => i.node_id), spec?.node_id].filter(Boolean));
const groups = [];
// утверждения и аналогии — по страницам: до 12 элементов и до 3 страниц в группе
const claims = items.filter(i => i.type === 'claim').sort((a, b) => a.page_pdf - b.page_pdf || a.id.localeCompare(b.id));
let cur = null;
for (const c of claims) {
  if (!cur || cur.ids.length >= 12 || (!cur.pages.has(c.page_pdf) && cur.pages.size >= 3)) groups.push(cur = { kind: 'claims', ids: [], pages: new Set() });
  cur.ids.push(c.id); cur.pages.add(c.page_pdf);
}
for (const a of items.filter(i => i.type === 'analogy')) {
  const g = groups.find(g => g.ids.some(id => byId.get(id)?.node_id === a.node_id)) || groups[groups.length - 1];
  g.ids.push(a.id);
}
// ролик: фразы закадра и факты сцены, отдельно кадры
const vItems = items.filter(i => i.type === 'script_line' || i.type === 'scene_fact');
const vPages = new Set([...claimsOf(vItems.map(i => i.claim_ref)).map(c => c.page_pdf), ...claims.filter(c => videoNodes.has(c.node_id)).map(c => c.page_pdf)]);
if (vItems.length) groups.push({ kind: 'video', ids: vItems.map(i => i.id), pages: vPages });
for (let k = 0; k < frames.length; k += 5) groups.push({ kind: 'frames', ids: frames.slice(k, k + 5).map(f => f.id), pages: vPages });

const pagesText = ps => [...ps].sort((a, b) => a - b).map(p => `<!-- page ${p} -->\n${(S.pages[p] || '').trim()}`).join('\n\n');
function describe(id) {
  const it = byId.get(id), fr = frames.find(f => f.id === id);
  if (fr) {
    const line = lineAt(fr.t);
    return { id, type: 'frame', file: path.resolve(pkgDir, fr.file), t: fr.t, frame_class: fr.frame_class, label: fr.label, shows: fr.shows, plaque: fr.plaque, script_line_at_t: line ? { id: line.id, text: line.text, on_screen: line.on_screen, claim_ref: line.claim_ref } : null };
  }
  if (it.type === 'script_line') { const c = byId.get(it.claim_ref); return { ...it, claim_ref_text: c ? { id: c.id, text: c.text, quote: c.quote, page_pdf: c.page_pdf } : null }; }
  if (it.type === 'scene_fact') return { ...it, spec_value: specAt(it.spec_path) ?? null };
  return it;
}
const CATS = ['overgeneralization', 'sign_flip', 'measured_vs_inferred', 'lost_condition', 'missing_caveat', 'wrong_scaling', 'wrong_mechanism', 'outdated_as_current', 'analogy_without_limit', 'frame_error', 'other'];
const verdictSchema = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['target', 'has_error', 'category', 'severity', 'problem', 'fix', 'page_pdf'], properties: {
  target: { type: 'string' }, has_error: { type: 'boolean' }, category: { enum: [...CATS, 'none'] }, severity: { enum: ['critical', 'significant', 'minor', 'none'] },
  problem: { type: 'string' }, fix: { type: 'string' }, page_pdf: { type: ['integer', 'null'] }, quote: { type: ['string', 'null'] } } } } } };
const sys = tpl('system', { domain: { ...domain, hints: (domain.hints || []).map(h => '- ' + h) } });

// ---------- 3. запросы и сбор замечаний ----------
const remarks = [], warnings = [], seen = new Set();
let gi = 0;
for (const g of groups) {
  gi++;
  const user = tpl('review', {
    chapter: `${pkg.chapter} (${path.basename(chapterFile)})`,
    items: JSON.stringify(g.ids.map(describe), null, 1),
    signals: g.ids.filter(id => signals.has(id)).map(id => `- ${id}: ${signals.get(id).join('; ')}`).join('\n') || '- нет',
    context: g.kind === 'claims' ? '' : `Спецификация сцены ролика (контекст):\n${JSON.stringify(spec)}\n\nФразы закадра по времени:\n${items.filter(i => i.type === 'script_line').map(l => `${l.id} ${l.t_start}–${l.t_end} с: ${l.text} [${l.on_screen}] → ${l.claim_ref}`).join('\n')}`,
    pages: pagesText(g.pages)
  });
  log(`группа ${gi}/${groups.length} (${g.kind}): ${g.ids.join(', ')}`);
  const r = await llm.json({ stage: 'review', name: 'review', system: sys, user, schema: verdictSchema, task: { stage: 'review', ids: g.ids } });
  const got = new Set();
  for (const v of r.data.verdicts || []) {
    if (!g.ids.includes(v.target)) { warnings.push(`группа ${gi}: вердикт к чужой цели ${v.target} — пропущен`); continue; }
    got.add(v.target);
    if (!v.has_error || seen.has(v.target)) continue;
    seen.add(v.target);
    const rem = { target: v.target, category: CATS.includes(v.category) ? v.category : 'other', severity: ['critical', 'significant', 'minor'].includes(v.severity) ? v.severity : 'minor', problem: String(v.problem || '').trim(), fix: String(v.fix || '').trim(), page_pdf: Number.isInteger(v.page_pdf) ? v.page_pdf : null, quote: v.quote || null };
    if (rem.page_pdf != null && !PAGES.includes(rem.page_pdf)) { warnings.push(`${rem.target}: страница ${rem.page_pdf} вне главы — убрана`); rem.page_pdf = null; }
    if (rem.quote && rem.page_pdf != null && !quoteOnPage(rem.quote, S, rem.page_pdf)) {
      const L = locateQuote(rem.quote, S, rem.page_pdf);
      if (L && L.page === rem.page_pdf && L.score >= 0.9) rem.quote = L.text; else { warnings.push(`${rem.target}: цитата не найдена дословно на с. ${rem.page_pdf} — убрана`); rem.quote = null; }
    }
    if (!rem.fix) warnings.push(`${rem.target}: нет исправления — замечание засчитают наполовину`);
    remarks.push(rem);
  }
  const lost = g.ids.filter(id => !got.has(id));
  if (lost.length) warnings.push(`группа ${gi}: нет вердикта для ${lost.join(', ')}`);
}

const order = new Map([...items.map(i => i.id), ...frames.map(f => f.id)].map((id, i) => [id, i]));
remarks.sort((a, b) => order.get(a.target) - order.get(b.target));
const out = { package_id: pkg.package_id, team: opt('team') || 'kmg_hackathon', remarks };
const outErr = validate(out, schema('review_output.schema.json'));
if (outErr.length) { console.error('✗ ответ не соответствует review_output.schema.json:\n  - ' + outErr.slice(0, 10).join('\n  - ')); process.exit(1); }
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
const report = { package_id: pkg.package_id, chapter: chapterFile, targets: items.length + frames.length, groups: groups.length, signals: Object.fromEntries(signals), remarks: remarks.length, by_category: remarks.reduce((a, r) => (a[r.category] = (a[r.category] || 0) + 1, a), {}), warnings, provider: cfg.provider, model: cfg.modelLabel || cfg.model, tokens: meter };
fs.writeFileSync(path.join(path.dirname(outFile), 'report.json'), JSON.stringify(report, null, 1) + '\n');
warnings.forEach(w => log('! ' + w));
console.log(`\n✓ замечаний: ${remarks.length} из ${items.length + frames.length} целей → ${path.relative(ROOT, outFile)}`);
console.log(`  по категориям: ${Object.entries(report.by_category).map(([k, v]) => `${k} ${v}`).join(', ') || 'нет'}`);
