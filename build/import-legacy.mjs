#!/usr/bin/env node
// Разовый перенос глав из старого фронтенда (original/dist/content.js, media.js) в схему учебного слоя strata.layer/1.
// Слой получается НЕПОЛНЫМ: в старой версии было по 3 коротких шага на главу. Сборщик честно покажет пробелы в отчёте.
//   node build/import-legacy.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'original', 'dist');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(SRC, 'content.js'), 'utf8') + '\n' + fs.readFileSync(path.join(SRC, 'media.js'), 'utf8'), sandbox);
const { COURSES, MEDIA } = sandbox.window;

const MAP = {
  flow: {
    id: 'basniev-xxiii', title: 'Как давление расходится по упругому пласту', subtitle: 'Басниев и др., гл. XXIII–XXIV',
    book: { author: 'К. С. Басниев, Н. М. Дмитриев, Р. Д. Каневская, В. М. Максимов', authorShort: 'Басниев и др.', title: 'Нефтегазовая гидромеханика', publisher: 'Институт компьютерных исследований', year: 2005, chapter: 'Главы XXIII и XXIV, § 1', chapterTitle: 'Неустановившееся движение упругой жидкости в упругом пласте; метод ПССС', pages: '474–500' },
    parts: [
      { id: 'p23', title: 'Глава XXIII. Упругий режим пласта', short: 'Гл. XXIII · Упругий режим', sub: 'Откуда энергия притока и как со временем меняется дебит. С. 474–485.', nodes: ['flow-elastic', 'flow-rate'] },
      { id: 'p24', title: 'Глава XXIV, § 1. Метод последовательной смены стационарных состояний', short: 'Гл. XXIV · Метод ПССС', sub: 'Как приближённо описать движение границы возмущения. С. 494–500.', nodes: ['flow-zones'] }
    ],
    ids: { 'flow-elastic': 'hm.23.elastic.01', 'flow-rate': 'hm.23.rate.02', 'flow-zones': 'hm.24.psss.03' },
    titles: { 'flow-elastic': 'Откуда берётся энергия притока', 'flow-rate': 'Дебит падает, добыча растёт', 'flow-zones': 'Где проходит граница возмущения' },
    right: {
      'flow-elastic': 'После пуска в движение вовлекаются сначала ближние к забою области, затем всё более удалённые.',
      'flow-rate': 'При постоянном давлении на галерее дебит падает как 1/√t, а накопленная добыча продолжает расти как √t.',
      'flow-zones': 'Граница возмущённой области в методе ПССС движется; закон её движения находят из материального баланса.'
    },
    difficulty: { 'flow-elastic': ['М', 'В'], 'flow-rate': ['Ф', 'М'], 'flow-zones': ['Ф', 'П'] },
    calcTypes: ['flow-rate-q2', 'flow-rate-q3']
  },
  reefs: {
    id: 'kuznetsov-10', title: 'Как устроены рифовые резервуары', subtitle: 'Кузнецов, гл. 10',
    book: { author: 'В. Г. Кузнецов', authorShort: 'Кузнецов', title: 'Литология природных резервуаров нефти и газа', publisher: '', year: 2012, chapter: 'Глава 10, § 10.1–10.4', chapterTitle: 'Природные резервуары рифов', pages: '200–222' },
    parts: [
      { id: 'p101', title: '§ 10.1–10.3. Типы рифов и их строение', short: '§ 10.1–10.3 · Типы рифов', sub: 'Биостромы, биогермы, одиночные рифы и рифовые системы. С. 200–202.', nodes: ['reefs-shape', 'reefs-position'] },
      { id: 'p104', title: '§ 10.4. Рифовые ловушки и разведка', short: '§ 10.4 · Разведка', sub: 'Как расставить разведочные скважины. С. 222.', nodes: ['reefs-survey'] }
    ],
    ids: { 'reefs-shape': 'lit.10.shape.01', 'reefs-position': 'lit.10.position.02', 'reefs-survey': 'lit.10.survey.03' },
    titles: { 'reefs-shape': 'Как выглядит органогенная постройка', 'reefs-position': 'Где развивается рифовая система', 'reefs-survey': 'Куда поставить разведочные скважины' },
    right: {
      'reefs-shape': 'Биостром похож на пласт или уплощённую линзу и в рельефе дна не выделялся; холмовидная форма характерна для биогерма.',
      'reefs-position': 'В большинстве рифовых комплексов широко распространены обломочные известняки, а на крутых склонах — предрифовые шлейфы.',
      'reefs-survey': 'Если мощность максимальна в своде, равномерная по площади сетка неравномерно освещает объём; скважины сгущают в своде.'
    },
    difficulty: { 'reefs-shape': ['Р', 'П'], 'reefs-position': ['П', 'В'], 'reefs-survey': ['П', 'Н'] },
    calcTypes: []
  }
};

for (const c of COURSES) {
  const m = MAP[c.id]; if (!m) continue;
  const dir = path.join(ROOT, 'layer', m.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'nodes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const copy = rel => { const to = path.join(dir, 'assets', path.basename(rel)); fs.copyFileSync(path.join(SRC, rel), to); return 'assets/' + path.basename(rel); };
  const order = m.parts.flatMap(p => p.nodes);
  for (const l of c.lessons) {
    const id = m.ids[l.id];
    const tasks = l.questions.map((q, i) => {
      const t = { id: 't' + (i + 1), claim: 'c1', explain: q.explanation };
      if (q.type === 'single' || q.type === 'multi') Object.assign(t, { type: q.type, q: q.prompt, options: q.options, answer: q.answer });
      else if (q.type === 'number') Object.assign(t, { type: 'calc', q: q.prompt, answer: Number(q.answer), tol: 0.01, unit: '' });
      else if (q.type === 'blank') Object.assign(t, q.prompt.includes('___') ? { type: 'blank', q: 'Впишите пропущенное слово.', text: q.prompt.replace(/^Дополните:\s*/, ''), answer: [q.answer] } : { type: 'blank', q: q.prompt, text: 'Ответ: ___', answer: [q.answer] });
      return t;
    });
    const media = [];
    if (c.id === 'flow' && l.id === 'flow-zones' && MEDIA.long) media.push({ kind: 'long', src: copy(MEDIA.long.src), poster: copy(MEDIA.long.poster), title: MEDIA.long.title, format: 'разбор 16:9', duration: MEDIA.long.duration, page: MEDIA.long.sourcePage, hook: MEDIA.long.hook });
    const node = {
      id, legacy: l.id,
      title: m.titles[l.id], bookTitle: `${c.book}, с. ${l.page}`, bookShort: `с. ${l.page}`,
      pages: [l.page], difficulty: m.difficulty[l.id],
      route: { format: media.length ? 'ролик и схема' : 'схема', why: 'перенесено из старой версии без маршрутизации' },
      essence: [l.intro],
      how: l.body.map(t => ({ text: t, page: l.page, claims: ['c1'] })),
      mistake: { wrong: l.misconception, right: m.right[l.id], page: l.page },
      figures: [
        { id: 'diagram', kind: 'image', src: copy(l.diagram), class: 'A', place: 'top', caption: l.diagramCaption, origin: 'Схема из старой версии курса (SVG со своими цветами, не по единой легенде).', alt: l.diagramCaption },
        { id: 'page', kind: 'scan', src: copy(l.sourceImage), class: 'C', caption: l.figureCaption, origin: 'Скан страницы из PDF.', alt: 'Скан страницы ' + l.page + ' книги' }
      ],
      media,
      claims: [{ id: 'c1', kind: 'цитата', text: l.intro.split('. ')[0] + '.', quote: l.quote, page: l.page }],
      tasks,
      card: l.flashcard
    };
    fs.writeFileSync(path.join(dir, 'nodes', id + '.json'), JSON.stringify(node, null, 2) + '\n');
  }
  const parts = m.parts.map(p => ({ ...p, nodes: p.nodes.map(x => m.ids[x]) }));
  const ids = order.map(x => m.ids[x]);
  const chapter = {
    schema: 'strata.layer/1', id: m.id, version: m.id + '@0.1-legacy', domain: 'geo', complete: false,
    title: m.title, subtitle: m.subtitle,
    description: `Демо-курс по главе: ${m.book.author}, «${m.book.title}». Слой перенесён из старой версии и неполон.`,
    intro: [
      c.subtitle,
      'Этот слой **перенесён из старой версии курса и неполон**: в нём по три коротких шага, без разборов всех примеров, таблиц и формул главы. Пересоберите его конвейером по образцу главы Латышовой — шаблон курса уже готов принять полный слой.'
    ],
    book: m.book,
    difficulty: { 'М': 'механизм', 'В': 'геологическое время', 'И': 'косвенное измерение', 'Ф': 'формализм', 'П': 'пространство', 'Пр': 'процедура', 'Н': 'неопределённость и решение', 'Р': 'распознавание' },
    parts,
    edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id, type: 'base' })),
    errata: []
  };
  fs.writeFileSync(path.join(dir, 'chapter.json'), JSON.stringify(chapter, null, 2) + '\n');
  console.log('✓ ' + m.id + ': ' + ids.length + ' узлов');
}
