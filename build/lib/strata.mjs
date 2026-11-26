// Учебный слой → модель курса сайта STRATA (site/js/catalog.js: course, step, task, cards, links, coverage)
// и список роликов для раздела «Видео». Результат — site/data/pipeline.js (window.PIPELINE), его читает сайт
// и офлайн (index.html открыт файлом), и с сервера конвейера. Ролики не копируются: сайт ссылается на dist/<глава>/assets/media.
import fs from 'node:fs';
import path from 'node:path';

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const EDGE = { base: 'prerequisite', example: 'example_of', data: 'to_data', myth: 'refutes_misconception' };
const DOMAIN_NAMES = { geo: 'Геология и геофизика' };

// Разметка слоя → разметка сайта: [[термин|текст]] → текст; индексы x_{i}, 10^{−3} → $…$ (U.richText рисует sub/sup)
export function rt(s) {
  return String(s ?? '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
    .replace(/[^\s$«»()]*[_^]\{[^}]*\}[^\s$«»(),.;:!?]*/g, m => '$' + m + '$');
}
const words = s => (String(s).match(/[A-Za-zА-Яа-яЁё0-9]+/g) || []).length;

function mdTable(head, rows) {
  const line = r => '| ' + r.map(c => rt(c).replace(/\|/g, '/')).join(' | ') + ' |';
  return [line(head), '| ' + head.map(() => '---').join(' | ') + ' |', ...rows.map(line)].join('\n');
}

export function strataCourse(root, id, index = 0) {
  const ldir = path.join(root, 'layer', id), edir = path.join(root, 'export', id);
  const ch = readJSON(path.join(ldir, 'chapter.json'));
  const run = fs.existsSync(path.join(ldir, 'pipeline-run.json')) ? readJSON(path.join(ldir, 'pipeline-run.json')) : null;
  const base = `../dist/${id}/`;
  const book = ch.book || {};
  const nodeIds = (ch.parts || []).flatMap(p => p.nodes || p.steps || []);
  const nodes = nodeIds.map(n => readJSON(path.join(ldir, 'nodes', n + '.json')));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const claimOf = new Map(nodes.flatMap(n => (n.claims || []).map(c => [`${n.id}#${c.id}`, c])));
  const who = book.authorShort || book.author || '';
  const videos = [];

  const steps = nodes.map(n => {
    const page0 = (n.pages || [])[0];
    const b = {};
    b.essence = (n.essence || []).map(t => ({ text: rt(t), page: page0 }));
    b.how = (n.how || []).map(h => ({ text: rt(h.text), page: h.page ?? page0, byModel: true }));
    if (n.layers?.nuances) b.how.push({ text: rt('Тонкости: ' + n.layers.nuances), page: page0, byModel: true });
    if (n.procedure?.items?.length) b.procedure = n.procedure.items.map(x => ({ text: rt(x.text), page: x.page ?? n.procedure.page ?? page0 }));
    if (n.examples?.length) b.examples = n.examples.map((e, i) => ({ title: e.title || `Пример ${i + 1}`, page: e.page ?? page0, text: rt([e.given ? 'Дано: ' + e.given + '.' : '', ...(e.steps || []).map((s, k) => `${k + 1}) ${s}`), e.answer ? 'Ответ: ' + e.answer : ''].filter(Boolean).join(' ')) }));
    if (n.numbers?.length) b.numbers = n.numbers.map(x => ({ text: rt(`${x.name}: ${x.value}${x.cond ? ' — ' + x.cond : ''}`), page: x.page ?? page0 }));
    if (n.glossary?.length) b.terms = n.glossary.map(g => ({ term: g.en ? `${g.term} (${g.en})` : g.term, def: rt(g.def), page: g.page ?? page0 }));
    if (n.formulas?.length) b.formulas = n.formulas.map(f => ({ tex: f.expr, page: f.page ?? page0, no: f.no || '', vars: (f.vars || []).map(v => ({ s: v.s, m: v.m, u: v.u })), note: f.note || '' }));
    if (n.tables?.length) b.tables = n.tables.map(t => ({ caption: t.title, page: t.page ?? page0, md: mdTable((t.head || [])[0] || [], t.rows || []) }));
    if (n.mistake?.wrong) b.mistake = { text: rt(`Ошибка: «${n.mistake.wrong}» Верно: ${n.mistake.right}`) };
    const data = [];
    if (n.data?.input?.length) data.push({ text: rt('На входе: ' + n.data.input.join('; ') + '.'), page: page0, byModel: true });
    if (n.data?.output?.length) data.push({ text: rt('На выходе: ' + n.data.output.join('; ') + '.'), page: page0, byModel: true });
    if (n.data?.breaks?.length) data.push({ text: rt('Где ломается: ' + n.data.breaks.join(' ')), page: page0, byModel: true });
    if (n.itAnalogy?.text) data.push({ text: rt(`ИТ-аналогия: ${n.itAnalogy.text}${n.itAnalogy.limit ? ' Где ломается: ' + n.itAnalogy.limit : ''}`), page: page0, byModel: true });
    if (n.nowPractice) data.push({ text: rt('Как сейчас: ' + n.nowPractice), page: page0, byModel: true });
    if (data.length) b.data = data;
    if (n.analogy?.text) b.analogy = { text: rt(n.analogy.text), limit: rt(n.analogy.limit || '') };
    if (n.bookTasks?.length) b.bookTasks = n.bookTasks.map(t => ({ number: t.no, text: rt(t.text), page: t.page ?? page0, figures: t.need ? [t.need] : [] }));
    b.quotes = (n.claims || []).filter(c => c.quote).map(c => ({ text: c.quote, page: c.page ?? page0 }));
    const own = (n.media || []).filter(m => m.src && fs.existsSync(path.join(root, 'dist', id, m.src)));
    const media = own.map((m, k) => {
      const v = {
        id: n.id.startsWith(id + '.') ? n.id + (own.length > 1 ? '-' + (k + 1) : '') : `${id}.${n.id}${own.length > 1 ? '-' + (k + 1) : ''}`, kind: 'video',
        remedialSrc: m.remedial ? base + m.remedial : '', title: m.title, hook: m.hook || '', vertical: !!m.vertical, format: m.vertical ? '9:16' : '16:9',
        src: base + m.src, poster: m.poster ? base + m.poster : '', subtitles: m.subtitles ? base + m.subtitles : '', passport: m.passport ? base + m.passport : '',
        duration: m.duration, courseId: id, stepId: n.id, stepTitle: n.title, courseTitle: ch.title,
        source: `${who}, с. ${m.page ?? page0}`, sourcePage: m.page ?? page0,
        question: m.ask?.q, options: m.ask?.options, correct: m.ask?.answer, feedback: m.ask?.feedback, checkpoint: m.ask?.at,
      };
      videos.push(v);
      return v;
    });
    const minutes = Math.max(3, Math.round(words([...(n.essence || []), ...(n.how || []).map(h => h.text)].join(' ')) / 110 + (n.tasks || []).length));
    return { id: n.id, title: n.title, bookTitle: n.bookTitle || '', minutes, pages: n.pages || [], difficulty: n.difficulty || [], whyHere: rt(n.whyHere || ''), blocks: b, illustrations: [], hints: [], media };
  });

  // задания: выгрузка по task.schema организаторов — та же модель, что у сайта
  let tasks = [];
  const tf = path.join(edir, 'tasks.json');
  if (fs.existsSync(tf)) {
    const raw = readJSON(tf);
    tasks = (Array.isArray(raw) ? raw : raw.tasks || []).filter(t => byId.has(t.step_id)).map(t => {
      const c = claimOf.get((t.claim_ids || [])[0]);
      const { step_id, claim_ids, ...rest } = t;
      return { ...rest, stepId: step_id, page: c?.page ?? (byId.get(step_id).pages || [])[0], quote: c?.quote || '' };
    });
  }
  const cards = [
    ...nodes.filter(n => n.card?.front).map(n => ({ id: 'card-' + n.id, stepId: n.id, front: rt(n.card.front), back: rt(n.card.back) })),
    ...nodes.flatMap(n => (n.glossary || []).map((g, i) => ({ id: `term-${n.id}-${i}`, stepId: n.id, front: g.term + (g.en ? ` (${g.en})` : ''), back: rt(g.def) }))),
  ];
  const links = (ch.edges || []).filter(e => byId.has(e.from) && byId.has(e.to)).map(e => ({ from: e.from, to: e.to, type: EDGE[e.type] || e.type }));
  let coverage = null;
  const cf = path.join(edir, 'coverage.json');
  if (fs.existsSync(cf)) { const cv = readJSON(cf); const rows = cv.rows || []; coverage = { units: rows.length, covered: rows.filter(r => (r.node_ids || []).length).length, rows }; }
  const types = [...new Set(nodes.flatMap(n => Array.isArray(n.difficulty) ? n.difficulty : Object.values(n.difficulty || {})).filter(Boolean))].slice(0, 4);
  return {
    course: {
      id, title: ch.title, subtitle: ch.subtitle || ch.description || '', description: ch.description || '', intro: ch.intro || [],
      author: book.author || '', book: [book.title, book.year].filter(Boolean).join(', '), pages: book.pages || '',
      source: 'pipeline', cover: `assets/field-${index % 3}.webp`, domain: DOMAIN_NAMES[ch.domain] || ch.domain || 'Курс', types,
      parts: (ch.parts || []).map(p => ({ id: p.id, title: p.title, steps: p.nodes || p.steps || [] })),
      steps, tasks, cards, links, coverage,
      courseUrl: base + 'index.html',
      generatedBy: run ? `конвейер, прогон ${run.run} (${run.model})` : 'слой собран вручную, курс — сборщиком',
    },
    videos,
  };
}

// Все главы, у которых собран курс в dist/ (или только перечисленные) → site/data/pipeline.js
export function writeSiteData(root, ids) {
  const list = ids && ids.length ? ids : fs.readdirSync(path.join(root, 'layer')).filter(id => fs.existsSync(path.join(root, 'layer', id, 'chapter.json')) && fs.existsSync(path.join(root, 'dist', id, 'index.html')));
  const courses = [], videos = [];
  list.sort().forEach((id, i) => { const r = strataCourse(root, id, i); courses.push(r.course); videos.push(...r.videos); });
  const out = path.join(root, 'site', 'data', 'pipeline.js');
  if (!fs.existsSync(path.dirname(out))) return null;
  fs.writeFileSync(out, `/* Курсы и ролики конвейера «Глава → курс». Файл пишет node build/build.mjs (build/lib/strata.mjs) — не править руками. */\nwindow.PIPELINE = ${JSON.stringify({ generated: new Date().toISOString(), courses, videos })};\n`);
  return { file: out, courses: courses.length, videos: videos.length };
}
