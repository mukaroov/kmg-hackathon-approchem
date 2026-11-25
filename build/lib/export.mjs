// Экспорт учебного слоя в общие форматы организаторов (schemas/*.schema.json) и проверки по выданному md главы.
import fs from 'node:fs';
import path from 'node:path';
import { validate } from './jsonschema.mjs';
import { readSource, strictNorm, quoteOnPage, locateQuote, numbers, pageNumbers, splitUnits, plain } from './source.mjs';

const EDGE = { base: 'prerequisite', example: 'example_of', data: 'to_data', myth: 'refutes_misconception' };
const field = (text, extra) => ({ text: plain(text), by_model: true, ...extra });
const listText = xs => (xs || []).map(x => plain(typeof x === 'string' ? x : x.text));

// Весь текст узла, который видит читатель (для чисел и покрытия)
function nodeTexts(s, withTasks) {
  const out = [];
  const walk = (v, k) => {
    if (['id', 'src', 'poster', 'widget', 'kind', 'class', 'place', 'claim', 'claims', 'type', 'page', 'pages', 'no', 'r', 'c', 'num', 'big', 'origin', 'caption', 'alt', 'figures', 'media', 'answer', 'tol', 'at', 'ref', 'sourceKind', 'quoteMd', 'quote', 'legacy', 'route', 'difficulty', 'bookShort', 'bookTitle', 'part', 'n', 'minutes', 'words', 'threshold', 'dataDecision', 'units'].includes(k)) return;
    if (!withTasks && (k === 'tasks' || k === 'card')) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x));
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk);
  };
  walk(s);
  return out.join('\n');
}
const stripRefs = t => plain(t).replace(/(с\.|стр\.|рис\.|табл\.|пример|задач[аи]|формул[аы]|уравнени[ея]|шаг[аеиу]?|шагов|§)\s*\d+[\d,\s–-]*/gi, ' ').replace(/\(\d{1,3}(?:\.\d{1,3})?\.?\)/g, ' ');

export function exportChapter({ root, dir, ch, steps, schemas }) {
  const src = ch.source;
  const out = { checks: [], warnings: [], layer: null, coverage: null };
  if (!src || !src.md || !fs.existsSync(path.join(dir, src.md))) { out.warnings.push('нет выданного md главы (chapter.json → source.md): экспорт и сверка с источником пропущены'); return out; }
  const S = readSource(path.join(dir, src.md));
  const rel = path.relative(root, path.join(dir, src.md)).replace(/\\/g, '/');

  // ---------- цитаты ----------
  let total = 0, strictAsIs = 0, bound = 0;
  const lowScore = [], notFound = [], pageMoved = [];
  const located = {};
  for (const s of steps) for (const c of s.claims || []) {
    total++;
    if (quoteOnPage(c.quote, S, c.page)) strictAsIs++;
    let L = null;
    if (c.quoteMd) L = quoteOnPage(c.quoteMd, S, c.page) ? { page: c.page, text: c.quoteMd, score: 1 } : null;
    else L = quoteOnPage(c.quote, S, c.page) ? { page: c.page, text: c.quote, score: 1 } : locateQuote(c.quote, S, c.page);
    if (L) {
      located[s.id + '#' + c.id] = L; bound++;
      if (L.page !== c.page) pageMoved.push(`шаг ${s.n}, ${c.id}: цитата на с. ${L.page}, а указана с. ${c.page}`);
      if (L.score < 0.9) lowScore.push(`шаг ${s.n}, ${c.id} (совпадение ${L.score}): «${L.text.slice(0, 90)}…»`);
    } else notFound.push(`шаг ${s.n}, ${c.id}, с. ${c.page}: «${plain(c.quote).slice(0, 90)}…»`);
  }
  out.checks.push({ ok: !notFound.length && !pageMoved.length, msg: `Цитаты в md главы на указанной странице (правило организаторов: дословно, без учёта пробелов, переносов и регистра): после привязки к md ${bound - pageMoved.length} из ${total}; в курсе дословно как в md — ${strictAsIs} из ${total} (остальные с исправленными индексами)` });
  notFound.forEach(x => out.warnings.push('цитата не найдена в md: ' + x));
  pageMoved.forEach(x => out.warnings.push('страница цитаты: ' + x));
  lowScore.forEach(x => out.warnings.push('цитата привязана к md с неполным совпадением, проверить глазами: ' + x));

  // ---------- числа ----------
  let checkedN = 0, elsewhere = 0, teachTasks = 0, derived = 0, distractors = 0;
  // задания с пометкой «Числа учебные» не сверяются с главой; ответ и пояснение расчётного задания — производные числа
  const teach = q => /^s*числа учебные/i.test(plain(q || ''));
  const taskText = ts => (ts || []).flatMap(x => { if (teach(x.q)) { teachTasks++; return []; } if (x.type === 'calc') { derived++; const { answerNumber, explain, ...rest } = x; return [rest]; } if (Array.isArray(x.options)) { const ok = [x.answer, x.answerIndex, x.answerIndexes, x.answers].flat().filter(i => Number.isInteger(i)); if (ok.length) { distractors += x.options.length - ok.length; return [{ ...x, options: x.options.filter((_, i) => ok.includes(i)) }]; } } return [x]; });
  const missing = [];
  const pagesOf = v => String(v == null ? '' : v).match(/\d+/g) || [];
  const chapterNums = pageNumbers(S, Array.from({ length: src.to - src.from + 1 }, (_, i) => src.from + i));
  for (const s of steps) {
    const pages = new Set([s.pages, (s.claims || []).map(c => c.page), (s.examples || []).map(e => e.page), (s.numbers || []).map(n => n.page), (s.formulas || []).map(f => f.page), (s.tables || []).map(t => t.page), (s.bookTasks || []).map(t => t.page), (s.procedure || {}).page].flat(2).flatMap(pagesOf).map(Number));
    const have = pageNumbers(S, pages);
    for (const [what, withTasks] of [['текст шага', false], ['задания и карточка', true]]) {
      const text = withTasks ? nodeTexts({ tasks: taskText(s.tasks), card: s.card }, true) : nodeTexts(s, false);
      const ns = numbers(stripRefs(text));
      checkedN += ns.length;
      const miss = ns.filter(n => !have.has(n));
      elsewhere += miss.filter(n => chapterNums.has(n)).length;
      const absent = miss.filter(n => !chapterNums.has(n));
      if (absent.length) missing.push({ s, what, miss: absent });
    }
  }
  const missCount = missing.reduce((a, m) => a + m.miss.length, 0);
  out.checks.push({ ok: missCount === 0, msg: `Числа шагов, заданий и карточек найдены в источнике: ${checkedN - missCount} из ${checkedN} (из них ${elsewhere} — на других страницах главы, не на страницах шага); нет в главе вовсе — ${missCount}; не сверялись: ${teachTasks} заданий с пометкой «Числа учебные», ответы ${derived} расчётных заданий и ${distractors} неверных вариантов ответа` });
  missing.forEach(m => out.warnings.push(`шаг ${m.s.n} (${m.what}): чисел нет в главе: ${m.miss.join(', ')} — расчёт по числам автора, учебное число или ошибка`));

  // ---------- экспорт слоя ----------
  const nodes = steps.map(s => {
    const glossary = (s.glossary || []).map(g => plain(g.term));
    const used = [...new Set([...nodeTexts(s, false).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim()))].filter(t => !glossary.some(g => g.toLowerCase() === t.toLowerCase()));
    const links = (ch.edges || []).flatMap(e => {
      if (e.type === 'data') return e.from === s.id ? [{ type: 'to_data', target: e.to }] : [];
      return e.to === s.id ? [{ type: EDGE[e.type] || 'prerequisite', target: e.from }] : [];
    });
    if (s.mistake && s.mistake.ref) links.push({ type: 'refutes_misconception', target: s.mistake.ref });
    const d = s.data || {};
    const all = [...(d.input || []), ...(d.output || []), ...(d.breaks || [])];
    const needsScan = [
      ...(s.figures || []).filter(f => f.kind === 'scan').map(f => ({ page: +((plain(f.origin).match(/с\.\s*(\d+)/) || [])[1] || s.pages[0]), what: plain(f.caption) })),
      ...(s.bookTasks || []).filter(t => /рис/i.test(t.need || '')).map(t => ({ page: t.page, what: `Задача ${t.no}: нужен ${plain(t.need)}` }))
    ];
    return {
      id: s.id,
      order: s.n,
      title: plain(s.title),
      why_here: field(s.whyHere || ''),
      difficulty: { primary: (s.difficulty || [])[0], secondary: (s.difficulty || [])[1] || null },
      threshold: !!s.threshold,
      pages: s.pages || [],
      layers: {
        topic: field(s.bookTitle || s.title),
        main: field((s.essence || []).join(' ')),
        mechanism: field((s.layers || {}).mechanism || ''),
        practice: field((s.layers || {}).practice || ''),
        nuances: field((s.layers || {}).nuances || ''),
        deeper: ((s.layers || {}).deeper || []).map(x => field(x))
      },
      claims: (s.claims || []).map(c => {
        const L = located[s.id + '#' + c.id];
        return { id: `${s.id}#${c.id}`, text: plain(c.text), kind: c.kind, page_pdf: L ? L.page : c.page, page_print: null, quote: L ? L.text : plain(c.quote), source_kind: c.sourceKind || 'text', by_model: true };
      }),
      links,
      misconception: s.mistake ? { ref: s.mistake.ref || null, text: `${plain(s.mistake.wrong)} На самом деле: ${plain(s.mistake.right)}`, by_model: true } : null,
      data_meaning: {
        from_chapter: field(['На входе: ' + listText((d.input || []).filter(x => !x.hyp)).join('; '), 'На выходе: ' + listText((d.output || []).filter(x => !x.hyp)).join('; ')].filter(x => !/: $/.test(x)).join('. ')),
        breaks: field(listText((d.breaks || []).filter(x => !x.hyp)).join('; ')),
        hypotheses: all.filter(x => x && x.hyp).map(x => field(x.text, { hypothesis: true }))
      },
      it_analogy: { text: plain((s.itAnalogy || {}).text || ''), breaks_where: plain((s.itAnalogy || {}).limit || ''), by_model: true },
      now_practice: s.nowPractice ? field(s.nowPractice, { hypothesis: true }) : null,
      inefficiency_lens: s.inefficiency ? { inputs: plain(s.inefficiency.inputs), manual_steps: plain(s.inefficiency.manualSteps), judgment_points: plain(s.inefficiency.judgment), time: plain(s.inefficiency.time), typical_errors: plain(s.inefficiency.errors), by_model: true } : null,
      terms_introduced: glossary,
      terms_used: used,
      needs_scan: needsScan,
      decision_on_data: s.decision ? { features: s.decision.features.map(plain), rule: plain(s.decision.rule), conclusion: plain(s.decision.conclusion), ...(s.decision.counterexample ? { counterexample: plain(s.decision.counterexample) } : {}) } : null,
      worked_examples: (s.examples || []).map(e => ({ page_pdf: e.page, condition: `${plain(e.title)}. ${plain(e.given)}`, steps: (e.steps || []).map(plain), result: plain(e.result), figure: null })),
      book_tasks: (s.bookTasks || []).map(t => ({ number: String(t.no), page_pdf: t.page, text: plain(t.text), figure: t.need ? plain(t.need) : null }))
    };
  });
  out.layer = { chapter: src.key || ch.id, source: rel, pdf_pages: [String(src.from) + '–' + String(src.to)], generated_by: `учебный слой ${ch.schema} (${ch.version}); экспорт node build/build.mjs; все тексты, кроме цитат, написаны моделью (by_model)`, nodes };

  // ---------- таблица покрытия ----------
  const units = splitUnits(S, src.from, src.to, src.start ? new RegExp(src.start, 'm') : null, src.end ? new RegExp(src.end, 'm') : null);
  const stem = w => w.toLowerCase().replace(/ё/g, 'е').slice(0, 6);
  const words = t => (plain(t).match(/[А-Яа-яЁё]{5,}/g) || []).map(stem);
  // словарь узла: его текст плюс слова автора из цитат (пересказ и оригинал вместе)
  const nodeStems = steps.map(s => new Set(words(nodeTexts(s, false) + '\n' + (s.claims || []).map(c => c.quote + ' ' + ((located[s.id + '#' + c.id] || {}).text || '')).join('\n'))));
  const nodeNums = steps.map(s => new Set(numbers(nodeTexts(s, false) + ' ' + (s.figures || []).map(f => f.caption + ' ' + f.origin).join(' '))));
  const pageNums = p => String(p).match(/\d+/g) ? String(p).match(/\d+/g).map(Number) : [];
  const quoteNorm = steps.map(s => (s.claims || []).map(c => strictNorm((located[s.id + '#' + c.id] || {}).text || '')).filter(q => q.length > 20));
  const onPage = (s, p) => (s.pages || []).includes(p) || (s.claims || []).some(c => c.page === p);
  // единицы, которые план конвейера назначил узлу (поле units узла); сверка текста ниже проверяет это независимо
  const planned = new Map();
  steps.forEach(s => (s.units || []).forEach(id => { if (!planned.has(id)) planned.set(id, new Set()); planned.get(id).add(s.id); }));
  const unconfirmedIds = [];
  let confirmed = 0, plannedOnly = 0, service = 0;
  // служебные единицы: колонтитулы (строка без строчных букв) и короткие связки перед формулой («Проинтегрировав (23.46), получим»)
  const isService = u => {
    if (u.kind !== 'paragraph') return false;
    const t = plain(u.text).trim();
    if (/[А-ЯЁA-Z]/.test(t) && !/[а-яёa-z]/.test(t) && t.length < 90) return true;
    return t.split(/s+/).length <= 10 && /(:|получим|найд[её]м|имеем|виду|виде|вид|откуда|или|окончательно|выражения|да[её]т|следует|подстановкой|по частям|при)s*[.:]?$/i.test(t);
  };
  // след безномерной формулы: у назначенного узла есть формула без номера на той же странице
  const unnumberedTrace = (u, id) => u.kind === 'formula' && !/(d{1,3}(?:.d+)?)/.test(u.text) && steps.some(s => s.id === id && (s.formulas || []).some(f => !f.no && pageNums(f.page).includes(u.page_pdf)));
  const rows = units.map(u => {
    const un = strictNorm(u.text), ids = new Set();
    steps.forEach((s, i) => { if (quoteNorm[i].some(q => un.includes(q.slice(0, 40)) || q.includes(un.slice(0, 40)))) ids.add(s.id); });
    const ex = u.text.match(/^(?:Пример|Example)\s+(\d+)/i);
    if (ex) steps.forEach(s => (s.examples || []).some(e => new RegExp(`(Пример|Example)\\s+${ex[1]}\\b`, 'i').test(e.title)) && ids.add(s.id));
    const tk = u.kind === 'task' && u.text.match(/^(\d{2,3})\./);
    if (tk) steps.forEach(s => (s.bookTasks || []).some(t => String(t.no) === tk[1]) && ids.add(s.id));
    const tb = u.text.match(/(?:Таблица|Table)\s+(\d+)/i);
    if (tb) steps.forEach(s => (s.tables || []).some(t => new RegExp(`(Таблица|Table)\\s+${tb[1]}\\b`, 'i').test(t.title)) && ids.add(s.id));
    if (u.kind === 'table' && !tb) steps.forEach(s => (s.tables || []).some(t => pageNums(t.page).some(p => Math.abs(p - u.page_pdf) <= 1)) && ids.add(s.id));
    const fgNo = u.kind === 'figure' && (u.figNo || (u.text.match(/(?:Рис\.|Fig\.|Figure)\s*(\d+(?:\.\d+)?)/i) || [])[1]);
    if (fgNo) { const re = new RegExp(`(рис\\.|fig\\.|figure)\\s*${fgNo.replace('.', '\\.')}(?!\\d)`, 'i'); steps.forEach(s => ((s.figures || []).some(f => re.test(plain(f.caption) + ' ' + plain(f.origin))) || (s.bookTasks || []).some(t => re.test(t.need || '')) || re.test(nodeTexts(s, false))) && ids.add(s.id)); }
    const fm = u.kind === 'formula' && u.text.match(/\((\d{1,3}(?:\.\d+)?)\)/);
    if (fm) steps.forEach(s => (s.formulas || []).some(f => String(f.no || '').includes(`(${fm[1]})`)) && ids.add(s.id));
    if (!ids.size && u.kind === 'formula') { const withF = steps.filter(s => onPage(s, u.page_pdf) && (s.formulas || []).length); if (withF.length === 1) ids.add(withF[0].id); }
    // числа единицы (не меньше двух разных, не номера страниц) все есть в тексте узла этой страницы
    if (!ids.size) {
      const un = numbers(stripRefs(u.text)).filter(n => !(+n >= src.from - 2 && +n <= src.to + 2));
      if (un.length >= 2) steps.forEach((s, i) => onPage(s, u.page_pdf) && un.filter(n => nodeNums[i].has(n)).length >= 0.75 * un.length && ids.add(s.id));
    }
    if (!ids.size && (u.kind === 'paragraph' || u.kind === 'formula' || u.kind === 'heading')) {
      const w = words(u.text);
      if (u.kind === 'heading' || w.length >= 3) {
        let best = null;
        steps.forEach((s, i) => {
          if (!onPage(s, u.page_pdf)) return;
          const share = w.length ? w.filter(x => nodeStems[i].has(x)).length / w.length : 1;
          if (!best || share > best.share) best = { id: s.id, share };
        });
        if (best && (u.kind === 'heading' || best.share >= 0.5)) ids.add(best.id);
      }
    }
    if (planned.has(u.unit_id)) { if ([...planned.get(u.unit_id)].some(id => ids.has(id) || unnumberedTrace(u, id))) confirmed++; else if (isService(u)) service++; else { plannedOnly++; unconfirmedIds.push(`${u.unit_id} (${u.kind})`); } planned.get(u.unit_id).forEach(id => ids.add(id)); }
    const node_ids = [...ids];
    return { unit_id: u.unit_id, kind: u.kind, page_pdf: u.page_pdf, excerpt: u.excerpt, node_ids, reason: node_ids.length ? null : 'соответствие в слое не найдено: единица не перенесена в узлы (пробел полноты слоя)' };
  });
  out.coverage = { chapter: src.key || ch.id, rows };
  const byKind = {};
  rows.forEach(r => { const k = byKind[r.kind] = byKind[r.kind] || [0, 0]; k[1]++; if (r.node_ids.length) k[0]++; });
  const cov = rows.filter(r => r.node_ids.length).length;
  const KN = { paragraph: 'абзацы', figure: 'рисунки', formula: 'формулы', table: 'таблицы', worked_example: 'примеры', task: 'задачи', heading: 'заголовки' };
  if (planned.size) out.checks.push({ ok: !plannedOnly, msg: `Единицы, назначенные узлам планом конвейера: сверкой текста подтверждено ${confirmed}, служебных (колонтитулы и связки перед формулами) ${service}, не подтверждено ${plannedOnly} (у таких единиц нет следа в тексте узла — проверить, не пересказаны ли они слишком общо)` });
  if (unconfirmedIds.length) out.warnings.push(`единицы плана без следа в тексте узла: ${unconfirmedIds.join(', ')}`);
  out.checks.push({ ok: cov === rows.length, msg: `Покрытие единиц главы (${planned.size ? 'план конвейера и сверка слоя с md' : 'автоматическая сверка слоя с md'}): ${cov} из ${rows.length} (${Math.round(100 * cov / Math.max(1, rows.length))} %) — ${Object.entries(byKind).map(([k, v]) => `${KN[k] || k} ${v[0]}/${v[1]}`).join(', ')}` });

  // ---------- маршрутизация (если у шагов есть баллы видеоёмкости — их ставит конвейер) ----------
  const FORMATS = ['шортс', 'длинное видео', 'интерактив', 'практикум на данных', 'карточки', 'текст'];
  const scored = steps.filter(s => s.route && s.route.video_scores);
  if (scored.length) {
    const zero = { time: 0, invisible: 0, scale: 0, counterintuitive: 0, cause_effect: 0 };
    out.routing = { chapter: src.key || ch.id, routes: steps.map(s => ({ node_id: s.id, format: FORMATS.includes(s.route?.format) ? s.route.format : 'текст', secondary_format: null, video_scores: s.route?.video_scores || zero, hook_short: false, template: s.route?.template || null, why: plain(s.route?.why || '') || 'обоснование не записано' })) };
    if (scored.length < steps.length) out.warnings.push(`маршрутизация: у ${steps.length - scored.length} шагов нет баллов видеоёмкости, в экспорте стоят нули`);
  }

  // ---------- задания (task.schema.json) ----------
  const TT = { single: 'single', multi: 'multiple', order: 'order', blank: 'gap', calc: 'calc' };
  const letter = i => String.fromCharCode(97 + i);
  out.tasks = { chapter: src.key || ch.id, tasks: steps.flatMap(s => (s.tasks || []).filter(t => TT[t.type]).map(t => {
    const base = { id: `${s.id}#${t.id}`, type: TT[t.type], step_id: s.id, claim_ids: [`${s.id}#${t.claim}`], prompt: plain(t.q), explanation: plain(t.explain) };
    // вид задания: учебные числа — перенос, шаг «решение на данных» — данные, пропуск — узнавание, остальное — понимание
    base.kind = /^\s*числа учебные/i.test(plain(t.q)) ? 'transfer' : (s.dataDecision || s.decision?.applies) ? 'data' : t.type === 'blank' ? 'recall' : 'understanding';
    if (t.type === 'single' || t.type === 'multi') {
      base.options = (t.options || []).map((o, i) => ({ id: letter(i), text: plain(o), misconception: null }));
      base.answer = t.type === 'single' ? letter(t.answer) : (t.answer || []).map(letter);
    } else if (t.type === 'order') {
      base.options = (t.items || []).map((o, i) => ({ id: letter(i), text: plain(o), misconception: null }));
      base.answer = (t.items || []).map((_, i) => letter(i)); // в слое пункты записаны в верном порядке, курс их перемешивает
    } else if (t.type === 'blank') {
      base.prompt = `${plain(t.q)} ${plain(t.text).replace(/_{2,}/, '{{1}}')}`.trim();
      const acc = [].concat(t.answer || t.answerText || []).map(plain);
      base.answer = acc.slice(0, 1);
      base.accepted = [acc]; // все принимаемые написания пропуска
    } else {
      base.answer = Number(t.answer); base.tolerance = t.tol ?? null; base.unit = t.unit || null;
    }
    return base;
  })) };

  // ---------- иллюстрации (illustration.schema.json) ----------
  const ill = [], skipped = [];
  for (const s of steps) {
    for (const f of s.figures || []) {
      if (f.kind === 'widget') ill.push({ id: `${s.id}#${f.id}`, step_id: s.id, node_id: s.id, file: `dist/${ch.id}/index.html#/step/${s.id}`, frame_class: f.class || 'A', origin: 'code_from_model', label: 'схема', caption: plain(f.caption), alt: plain(f.alt || f.caption), source: plain(f.origin) || null, claim_ids: [] });
      else if (f.kind === 'redraw' || /перерисован/i.test(plain(f.origin))) ill.push({ id: `${s.id}#${f.id}`, step_id: s.id, node_id: s.id, file: f.src ? `layer/${ch.id}/${f.src}` : `dist/${ch.id}/index.html#/step/${s.id}`, frame_class: f.class || 'A', origin: 'redrawn_from_book', label: 'схема', caption: plain(f.caption), alt: plain(f.alt || f.caption), source: plain(f.origin) || null });
      else skipped.push(`${s.id}#${f.id} (${f.kind})`);
    }
    for (const [k, m] of (s.media || []).entries()) {
      let label = 'схема', cls = 'B';
      try { const p = JSON.parse(fs.readFileSync(path.join(dir, m.passport), 'utf8')); label = p.frames?.[0]?.label || label; cls = p.frames?.[0]?.class || cls; } catch { /* паспорта нет — метка по умолчанию */ }
      ill.push({ id: `${s.id}#video${k + 1}`, step_id: s.id, node_id: s.id, file: `layer/${ch.id}/${m.src}`, frame_class: cls, origin: 'code_from_model', label, caption: plain(m.title), alt: `Ролик «${plain(m.title)}», ${Math.round(m.duration || 0)} с, к шагу «${plain(s.title)}».`, source: `спецификация сцены и паспорт: layer/${ch.id}/${m.passport}`, claim_ids: [] });
    }
  }
  out.illustrations = { chapter: src.key || ch.id, illustrations: ill };
  if (skipped.length) out.warnings.push(`иллюстрации: ${skipped.length} рисунков не выгружены — происхождение не из списка схемы (сканы книги): ${skipped.slice(0, 8).join(', ')}`);

  // ---------- схемы организаторов ----------
  for (const [name, data] of [['node', out.layer], ['coverage', out.coverage], ...(out.routing && schemas.routing ? [['routing', out.routing]] : []), ...(schemas.task ? [['task', out.tasks]] : []), ...(schemas.illustration ? [['illustration', out.illustrations]] : [])]) {
    const errs = validate(data, schemas[name]);
    out.checks.push({ ok: !errs.length, msg: `Экспорт ${{ node: 'слоя', coverage: 'таблицы покрытия', routing: 'маршрутизации', task: 'заданий', illustration: 'иллюстраций' }[name]} соответствует schemas/${name}.schema.json${errs.length ? `: ошибок ${errs.length}` : ''}` });
    errs.slice(0, 30).forEach(e => out.warnings.push(`схема ${name}: ${e}`));
  }
  // пустые обязательные по смыслу поля (схема их не ловит: пустая строка — тоже строка)
  const empty = [];
  for (const n of nodes) {
    const miss = [['why_here', n.why_here.text], ['layers.mechanism', n.layers.mechanism.text], ['data_meaning.from_chapter', n.data_meaning.from_chapter.text], ['it_analogy', n.it_analogy.text], ['terms_introduced', n.terms_introduced.length]].filter(([, v]) => !v).map(([k]) => k);
    if (miss.length) empty.push(`шаг ${n.order}: ${miss.join(', ')}`);
  }
  out.checks.push({ ok: !empty.length, msg: empty.length ? `Пустые поля узлов в экспорте — ${empty.join('; ')}` : 'В экспорте у всех узлов заполнены why_here, слои, «что это значит для данных», ИТ-аналогия и новые термины' });
  return out;
}
