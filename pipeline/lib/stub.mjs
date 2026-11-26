// Заглушка вместо модели (LLM_PROVIDER=stub): отвечает по тем же схемам, собирая узлы из кусков текста главы.
// Нужна, чтобы проверить каркас конвейера и API без ключа (например, фронтенду). Это не учебный слой: смысла глава не получает.
import { plain } from '../../build/lib/source.mjs';

const clean = s => plain(s).replace(/<!--[\s\S]*?-->/g, ' ').replace(/[#*|$\\━]/g, ' ').replace(/\s+/g, ' ').trim();
const firstWords = (s, n) => { const w = clean(s).split(' '); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
// дословный префикс исходного текста до n-го слова (для цитаты)
function verbatimPrefix(text, n) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const re = /\S+/g; let m, k = 0, end = 0;
  while ((m = re.exec(t)) && k < n) { end = m.index + m[0].length; k++; }
  return t.slice(0, end);
}
const title3 = s => { const w = clean(s).replace(/^[\d.§\s]+/, '').split(' ').filter(Boolean).slice(0, 6); while (w.length < 3) w.unshift(['Раздел', 'главы', 'о'][w.length] || 'тема'); return w.join(' '); };

function outline({ units }) {
  const nodes = [];
  let cur = null;
  for (const u of units) {
    if (!cur || (u.kind === 'heading' && cur.units.length >= 3) || cur.units.length >= 8) { cur = { title: u.kind === 'heading' ? u.excerpt : `Фрагмент со с. ${u.page_pdf}: ${u.excerpt}`, units: [] }; nodes.push(cur); }
    cur.units.push(u.unit_id);
  }
  const parts = [];
  nodes.forEach((nd, i) => {
    if (i % 3 === 0) parts.push({ title: `Часть ${parts.length + 1}`, short: `Часть ${parts.length + 1}`, sub: 'Части собраны заглушкой по порядку текста.', nodes: [] });
    parts[parts.length - 1].nodes.push({ n: i + 1, title: title3(nd.title), bookTitle: firstWords(nd.title, 10), units: nd.units, difficulty: { primary: 'Пр', secondary: '' }, threshold: false, dataDecision: i === 0, after: i ? [i] : [] });
  });
  const head = units.find(u => u.kind === 'heading');
  return { chapter: { title: head ? firstWords(head.excerpt, 8) : 'Глава без заголовка', subtitle: 'Проверка каркаса конвейера без модели', description: 'Курс собран заглушкой без языковой модели: текст шагов — куски главы.', intro: ['Это проверочная сборка: конвейер прошёл все этапы, но вместо модели работала заглушка.', 'Чтобы получить настоящий курс, задайте ключ модели в .env и запустите конвейер снова.'], language: '', book: { author: '', title: '', year: '', chapter: '', chapterTitle: '' } }, parts };
}

function node({ node: nd }) {
  const paras = nd.units.filter(u => u.kind === 'paragraph' || u.kind === 'worked_example' || u.kind === 'task');
  const src = (paras.length ? paras : nd.units).slice(0, 6);
  const claims = src.map((u, i) => ({ id: 'c' + (i + 1), kind: 'observation', sourceKind: 'text', text: firstWords(u.text, 16), quote: verbatimPrefix(u.text.split('\n')[0], 25), page: u.page_pdf }));
  const how = claims.map(c => ({ text: firstWords(c.quote, 18), page: c.page, claims: [c.id] }));
  const c1 = claims[0] || { id: 'c1', quote: '', page: nd.units[0].page_pdf };
  const long = (c1.quote.match(/[A-Za-zА-Яа-яЁё]{6,}/g) || [])[0];
  const tasks = [];
  if (long) tasks.push({ id: 't1', type: 'blank', q: 'Впишите пропущенное слово из текста автора.', text: c1.quote.replace(long, '___'), answerText: [long], explain: 'Слово взято из цитаты автора.', claim: c1.id });
  tasks.push({ id: 't2', type: 'single', q: `На какой странице сказано: «${firstWords(c1.quote, 8)}»?`, options: [String(c1.page), String(c1.page + 1), String(c1.page - 1)], answerIndex: 0, explain: `Цитата стоит на с. ${c1.page}.`, claim: c1.id });
  if (claims.length >= 3) tasks.push({ id: 't3', type: 'order', q: 'Расставьте фразы в порядке текста.', items: claims.slice(0, 4).map(c => firstWords(c.quote, 6)), explain: 'Порядок — как в книге.', claim: c1.id });
  return {
    title: nd.title, bookTitle: nd.bookTitle, bookShort: firstWords(nd.bookTitle, 5),
    essence: [`Шаг о теме «${nd.title}».`, 'Текст шага собран заглушкой без модели.'],
    how, claims, procedure: { intro: '', page: c1.page, items: [] }, examples: [], numbers: [], formulas: [], tables: [], bookTasks: [], glossary: [],
    mistake: { wrong: '', right: '', page: c1.page, ref: '' }, data: { input: [], output: [], breaks: [] },
    decision: { applies: false, features: [], rule: '', conclusion: '', counterexample: '' },
    analogy: { text: '', limit: '' }, itAnalogy: { text: '', limit: '' }, nowPractice: '',
    inefficiency: { applies: false, inputs: '', manualSteps: '', judgment: '', time: '', errors: '' },
    layers: { mechanism: '', practice: '', nuances: '', deeper: [] }, whyHere: 'Порядок шагов — как в книге.',
    route: { format: 'текст', why: 'заглушка без модели', template: '', video_scores: { time: 0, invisible: 0, scale: 0, counterintuitive: 0, cause_effect: 0 } },
    figure: { type: 'chain', caption: 'Фразы шага по порядку текста.', alt: 'Цепочка из начальных слов фраз шага.', items: claims.slice(0, 5).map(c => firstWords(c.quote, 6)), cols: [], rows: [] },
    tasks, card: { front: `О чём шаг «${nd.title}»?`, back: firstWords(c1.quote, 20) },
  };
}

function tasks({ node: n, ids }) {
  const c = (n.claims || [])[0];
  if (!c) return { tasks: [] };
  return { tasks: [{ id: ids[0], type: 'multi', q: 'Какие фразы взяты из текста шага?', options: [firstWords(c.quote, 6), 'Этой фразы в главе нет', ...(n.claims || []).slice(1, 3).map(x => firstWords(x.quote, 6))], answerIndexes: [0, ...(n.claims || []).slice(1, 3).map((_, i) => i + 2)], explain: 'Верные варианты — начала цитат автора.', claim: c.id }] };
}

export function stubJSON(task) {
  switch (task?.stage) {
    case 'outline': return outline(task);
    case 'node': return node(task);
    case 'repair': return task.previous;
    case 'verify': return { issues: [] };
    case 'tasks': return tasks(task);
    case 'links': return { links: [] };
    case 'domain': {
      const K = ['М', 'В', 'И', 'Ф', 'П', 'Пр', 'Н', 'Р'], pg = (task.pages || [])[0] ?? null;
      return {
        name: 'область по главе (заглушка)', audience: 'новичок-цифровик без профильного образования', notation: 'Индексы разметкой: x_{i}. Единицы — как у автора.',
        hints: ['Заглушка без модели: подсказки не собраны.'],
        difficulty: Object.fromEntries(K.map(k => [k, k])),
        misconceptions: Array.from({ length: 5 }, (_, i) => ({ id: `misc.stub_${i + 1}`, text: `Заблуждение-заглушка ${i + 1}.`, page: null })),
        physicsChecklist: Array.from({ length: 8 }, (_, i) => ({ id: `pc.stub_${i + 1}`, group: 'Заглушка', item: `Пункт-заглушка ${i + 1}.` })),
        pronunciation: [], stress: [],
        glossary: Array.from({ length: 10 }, (_, i) => ({ term: `термин ${i + 1}`, en: `term ${i + 1}`, def: 'Определение-заглушка.', page: pg })),
        sceneTemplates: Object.fromEntries(K.map(k => [k, []])), newTemplates: [], dataSources: ['заглушка'],
      };
    }
    case 'review': return { verdicts: (task.ids || []).map(id => ({ target: id, has_error: false, category: 'none', severity: 'none', problem: 'заглушка: ошибки не ищет', fix: '', page_pdf: null, quote: null })) };
    default: throw new Error(`заглушка не знает этап ${task?.stage}`);
  }
}
