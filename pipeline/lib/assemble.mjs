// Ответы модели → учебный слой layer/<глава>/ (chapter.json, nodes/*.json, source.md) → сборка курса build/build.mjs.
// Ручные правки защищены: если слой правили после прогона, конвейер не перезапишет его без --force (правки идут в журнал).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT } from './config.mjs';

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = s => String(s).toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[а-яё]/g, c => TR[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chapter';

export function layerHashes(dir) {
  const h = {};
  const add = f => { const p = path.join(dir, f); if (fs.existsSync(p)) h[f] = sha(fs.readFileSync(p)); };
  add('chapter.json');
  if (fs.existsSync(path.join(dir, 'nodes'))) for (const f of fs.readdirSync(path.join(dir, 'nodes')).sort()) add('nodes/' + f);
  return h;
}

// Куда писать слой и какой это прогон по счёту
export function prepareTarget(id, { force } = {}) {
  let dir = path.join(ROOT, 'layer', id);
  const runFile = () => path.join(dir, 'pipeline-run.json');
  if (fs.existsSync(path.join(dir, 'chapter.json')) && !fs.existsSync(runFile())) { id = id + '-auto'; dir = path.join(ROOT, 'layer', id); }
  let run = 1;
  if (fs.existsSync(runFile())) {
    const prev = JSON.parse(fs.readFileSync(runFile(), 'utf8'));
    run = (prev.run || 0) + 1;
    const now = layerHashes(dir);
    const changed = Object.keys({ ...now, ...prev.hashes }).filter(f => now[f] !== prev.hashes?.[f]);
    if (changed.length && !force) {
      const e = new Error(`слой layer/${id} правили вручную после прогона ${prev.run} (${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''}). Запишите правки в logs/manual_edits.csv и запустите с force, чтобы перезаписать, или задайте другой id`);
      e.code = 'MANUAL_EDITS'; throw e;
    }
  }
  return { id, dir, run };
}

const MARKS = new Set(['best', 'yes', 'low', 'no']);
const firstWords = (s, n) => { const w = String(s || '').replace(/\s+/g, ' ').trim().split(' '); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
const nz = s => (s && String(s).trim() ? String(s).trim() : null);

function mapTask(t) {
  const base = { id: t.id, type: t.type, q: t.q, explain: t.explain, claim: t.claim };
  if (t.type === 'single') return { ...base, options: t.options, answer: t.answerIndex };
  if (t.type === 'multi') return { ...base, options: t.options, answer: t.answerIndexes };
  if (t.type === 'order') return { ...base, items: t.items };
  if (t.type === 'blank') return { ...base, text: t.text, answer: t.answerText };
  if (t.type === 'calc') return { ...base, answer: t.answerNumber, tol: t.tol > 0 && t.tol < 1 ? t.tol : 0.02, unit: t.unit || '' };
  return null;
}
const taskOk = t => t && (
  t.type === 'single' ? Array.isArray(t.options) && t.options[t.answer] != null :
  t.type === 'multi' ? Array.isArray(t.options) && Array.isArray(t.answer) && t.answer.length && t.answer.every(i => t.options[i] != null) :
  t.type === 'order' ? Array.isArray(t.items) && t.items.length >= 3 :
  t.type === 'blank' ? String(t.text || '').includes('___') && Array.isArray(t.answer) && t.answer.length :
  t.type === 'calc' ? Number.isFinite(t.answer) : false);

function mapFigure(f, d, pages) {
  const origin = `Схема построена кодом по тексту с. ${pages[0]}${pages[1] !== pages[0] ? '–' + pages[1] : ''} (конвейер)`;
  if (f?.type === 'matrix' && (f.cols || []).length && (f.rows || []).length && f.rows.every(r => r.length === f.cols.length + 1 && r.slice(1).every(v => MARKS.has(String(v).replace('*', ''))))) {
    return { id: 'fig1', kind: 'widget', widget: 'matrix', class: 'A', place: 'top', cols: f.cols, rows: f.rows, legend: { best: 'да, ярко выражено', yes: 'да', low: 'частично', no: 'нет' }, caption: f.caption, origin, alt: f.alt || f.caption };
  }
  let items = f?.type === 'chain' ? (f.items || []).filter(Boolean) : [];
  let caption = f?.caption, alt = f?.alt;
  if (items.length < 2) { items = (d.procedure?.items?.length ? d.procedure.items.map(x => x.text) : d.claims.map(c => c.text)).slice(0, 5).map(x => firstWords(x, 8)); caption = 'Главные утверждения шага по порядку.'; alt = 'Цепочка: ' + items.join(' → '); }
  return { id: 'fig1', kind: 'widget', widget: 'chain', class: 'A', place: 'top', items: items.slice(0, 6), caption: caption || 'Схема шага.', origin, alt: alt || caption || 'Схема шага.' };
}

function mapNode(r, id, warnings) {
  const d = r.data, nd = r.plan;
  const tasks = (d.tasks || []).map(mapTask).filter(t => { const ok = taskOk(t); if (!ok && t) warnings.push(`шаг ${nd.n}: задание ${t.id} отброшено — ответ не сходится с вариантами`); return ok; });
  const pages = r.pages;
  const node = {
    id, title: d.title, bookTitle: d.bookTitle || nd.bookTitle, bookShort: d.bookShort || null, pages,
    units: nd.units, // единицы главы, которые план назначил шагу: по ним строится таблица покрытия
    difficulty: [nd.difficulty.primary, nd.difficulty.secondary].filter(Boolean),
    threshold: !!nd.threshold,
    dataDecision: !!(nd.dataDecision || d.decision?.applies),
    route: { format: d.route?.format || 'текст', why: d.route?.why || '', video_scores: d.route?.video_scores, template: nz(d.route?.template) },
    whyHere: d.whyHere,
    essence: d.essence,
    how: d.how,
    layers: { mechanism: d.layers?.mechanism || '', practice: d.layers?.practice || '', nuances: d.layers?.nuances || '', deeper: (d.layers?.deeper || []).filter(Boolean) },
  };
  if ((d.procedure?.items || []).length) node.procedure = d.procedure;
  if ((d.examples || []).length) node.examples = d.examples.map((e, i) => ({ ...e, id: e.id || 'ex' + (i + 1), note: nz(e.note) || undefined }));
  if ((d.numbers || []).length) node.numbers = d.numbers;
  if ((d.formulas || []).length) node.formulas = d.formulas.map(f => ({ ...f, no: nz(f.no) || undefined, note: nz(f.note) || undefined }));
  if ((d.tables || []).length) node.tables = d.tables.map((t, i) => ({ id: 'tb' + (i + 1), title: t.title, page: t.page, head: [t.head], rows: t.rows, notes: nz(t.notes) ? [t.notes] : undefined, big: t.rows.length > 8 || t.head.length > 5 }));
  if ((d.bookTasks || []).length) node.bookTasks = d.bookTasks.map(t => ({ ...t, need: nz(t.need) || undefined }));
  Object.assign(node, {
    glossary: d.glossary || [],
    mistake: d.mistake?.wrong ? { wrong: d.mistake.wrong, right: d.mistake.right, page: d.mistake.page, ref: nz(d.mistake.ref) } : undefined,
    data: { input: d.data?.input || [], output: d.data?.output || [], breaks: d.data?.breaks || [] },
    decision: d.decision?.applies ? { features: d.decision.features, rule: d.decision.rule, conclusion: d.decision.conclusion, counterexample: nz(d.decision.counterexample) } : null,
    analogy: d.analogy?.text ? { text: d.analogy.text, limit: d.analogy.limit } : undefined,
    itAnalogy: d.itAnalogy?.text ? { text: d.itAnalogy.text, limit: d.itAnalogy.limit } : undefined,
    nowPractice: nz(d.nowPractice),
    inefficiency: d.inefficiency?.applies ? { inputs: d.inefficiency.inputs, manualSteps: d.inefficiency.manualSteps, judgment: d.inefficiency.judgment, time: d.inefficiency.time, errors: d.inefficiency.errors } : null,
    figures: [mapFigure(d.figure, d, pages)],
    claims: d.claims,
    tasks,
    card: d.card,
  });
  return JSON.parse(JSON.stringify(node)); // убирает undefined
}

// «К. С. Басниев, Н. М. Дмитриев, …» → «Басниев и др.»; «В. Г. Кузнецов» → «Кузнецов»
export function shortAuthor(a) {
  const list = String(a || '').split(/,|;| и /).map(s => s.trim()).filter(Boolean);
  const sur = s => (s.split(/\s+/).find(w => !/\.$/.test(w)) || s.split(/\s+/).pop());
  if (!list.length) return a;
  return sur(list[0]) + (list.length > 1 ? ' и др.' : '');
}

export function writeLayer({ target, layer, source, ingestInfo, name, domain, jobId, cfg, images, jobDir, warnings, meta = {} }) {
  const { id, dir, run } = target;
  const o = layer.outline;
  fs.rmSync(path.join(dir, 'nodes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'nodes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'source.md'), source);
  if (images?.length) { const to = path.join(dir, 'source-images'); fs.mkdirSync(to, { recursive: true }); for (const f of images) fs.copyFileSync(path.join(jobDir, 'images', f), path.join(to, f)); }
  const ids = new Map(layer.results.map(r => [r.plan.n, `${id}.n${String(r.plan.n).padStart(2, '0')}`]));
  for (const r of layer.results) fs.writeFileSync(path.join(dir, 'nodes', ids.get(r.plan.n) + '.json'), JSON.stringify(mapNode(r, ids.get(r.plan.n), warnings), null, 2) + '\n');
  // выходные данные книги: из параметров запуска (--author, --book, --year) важнее, чем то, что модель нашла в тексте главы
  const b = { ...(o.chapter.book || {}), ...Object.fromEntries(Object.entries({ author: meta.author, title: meta.book, year: meta.year, chapter: meta.chapter }).filter(([, v]) => nz(v))) };
  const author = nz(b.author) || 'автор не указан';
  const chapter = {
    schema: 'strata.layer/1', id, version: `${id}@run${run}`, domain: domain.id,
    source: { md: 'source.md', origin: name, key: id, from: ingestInfo.from, to: ingestInfo.to, start: meta.start || null, end: meta.end || null },
    complete: layer.results.every(r => !r.hard.length),
    title: o.chapter.title, subtitle: o.chapter.subtitle, description: o.chapter.description, intro: o.chapter.intro,
    book: { author, authorShort: author.split(/\s+/).pop(), title: nz(b.title) || 'название книги не указано', year: nz(b.year) || '', chapter: nz(b.chapter) || '', chapterTitle: nz(b.chapterTitle) || '', pages: ingestInfo.from === ingestInfo.to ? String(ingestInfo.from) : `${ingestInfo.from}–${ingestInfo.to}` },
    difficulty: domain.difficulty,
    parts: o.parts.map((p, i) => ({ id: 'p' + (i + 1), title: p.title, short: p.short, sub: p.sub, nodes: p.nodes.map(nd => ids.get(nd.n)) })),
    edges: layer.results.flatMap(r => (r.plan.after || []).filter(a => ids.has(a)).map(a => ({ from: ids.get(a), to: ids.get(r.plan.n), type: 'base' }))),
    errata: [],
  };
  fs.writeFileSync(path.join(dir, 'chapter.json'), JSON.stringify(chapter, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'pipeline-run.json'), JSON.stringify({ run, job: jobId, date: new Date().toISOString(), provider: cfg.provider, model: cfg.modelLabel || cfg.model, extractor: ingestInfo.extractor, hashes: layerHashes(dir) }, null, 2) + '\n');
  return { id, dir, run, nodes: layer.results.length };
}

export function runBuild(id) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(ROOT, 'build', 'build.mjs'), path.join('layer', id)], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => {
      const rep = path.join(ROOT, 'dist', id, 'build-report.json');
      resolve({ ok: code === 0, code, log: out, report: fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : null });
    });
  });
}
