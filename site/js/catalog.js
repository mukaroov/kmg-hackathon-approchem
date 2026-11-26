/* STRATA · каталог курсов.
   Единая модель курса (расширение формата window.COURSES; подробно — STRATA_ANALYSIS/06 §5.2):
   course = {id, title, subtitle, author, book, pages, source, cover, types[], parts[{id,title,steps[]}],
             steps[step], tasks[task], cards[{id,stepId,front,back}], links[{from,to,type}], coverage?, generatedBy}
   step   = {id, title, bookTitle, minutes, pages[], blocks{…}, illustrations[], sourceImage?, hints[], media[]}
   task   = {id, stepId, type: single|multiple|order|gap|calc, prompt, options[{id,text}], answer, tolerance?, unit?,
             explanation, page, quote, kind}
   Встроенные курсы собираются из data/content.js и data/media.js; загруженные — из IndexedDB. */
(() => {
  'use strict';
  const TYPES = {logs: ['И', 'Пр', 'Н'], flow: ['Ф', 'М'], reefs: ['Р', 'В', 'П']};
  const DOMAINS = {logs: 'Геофизика скважин', flow: 'Гидромеханика', reefs: 'Литология'};
  let builtin = [], user = [], ready = null;

  function convertTask(q, l) {
    const opts = (q.options || []).map((t, i) => ({id: 'o' + i, text: t}));
    const base = {id: q.id, stepId: l.id, prompt: q.prompt, explanation: q.explanation, page: l.page, quote: l.quote, kind: 'recall'};
    if (q.type === 'single') return {...base, type: 'single', options: opts, answer: 'o' + q.answer};
    if (q.type === 'multi') return {...base, type: 'multiple', options: opts, answer: q.answer.map(i => 'o' + i)};
    if (q.type === 'order') return {...base, type: 'order', options: opts, answer: q.answer.map(i => 'o' + i)};
    if (q.type === 'number') {
      const a = Number(q.answer);
      return {...base, type: 'calc', answer: a, tolerance: Math.max(0.001, Math.abs(a) * 0.005), unit: q.unit || null};
    }
    const prompt = /_{2,}/.test(q.prompt) ? q.prompt.replace(/«?_{2,}»?/, '{{1}}') : q.prompt + ' {{1}}';
    return {...base, type: 'gap', prompt, answer: [String(q.answer)], accepted: q.accepted || []};
  }

  function fromLegacy(c, i) {
    const shorts = window.MEDIA?.shorts || [], long = window.MEDIA?.long;
    const steps = c.lessons.map(l => {
      const media = [];
      if (c.id === 'logs' && shorts.length && l.page === shorts[0].sourcePage) media.push({kind: 'shorts', id: shorts[0].id, title: 'Серия шортсов по примеру 50'});
      if (c.id === 'flow' && l.id === 'flow-zones' && long) media.push({kind: 'long', id: long.id, title: long.title});
      return {
        id: l.id, title: l.title, bookTitle: '', minutes: l.minutes, pages: [l.page],
        blocks: {
          essence: [{text: l.intro, page: l.page}],
          how: l.body.map(t => ({text: t, page: l.page})),
          quotes: [{text: l.quote, page: l.page}],
          mistake: l.misconception ? {text: l.misconception} : null
        },
        illustrations: l.diagram ? [{src: l.diagram, alt: l.diagramCaption || l.title, caption: l.diagramCaption, label: 'схема', frameClass: 'B', origin: 'code_from_model'}] : [],
        sourceImage: l.sourceImage, sourceCaption: l.figureCaption,
        hints: l.hints || [], media
      };
    });
    const tasks = c.lessons.flatMap(l => l.questions.map(q => convertTask(q, l)));
    const cards = c.lessons.map(l => ({id: 'card-' + l.id, stepId: l.id, front: l.flashcard?.front || l.title, back: l.flashcard?.back || l.intro}));
    const links = steps.slice(1).map((s, j) => ({from: steps[j].id, to: s.id, type: 'prerequisite'}));
    return {
      id: c.id, title: c.title, subtitle: c.subtitle, author: c.author, book: c.book, pages: c.pages,
      source: 'builtin', cover: 'assets/field-' + (i % 3) + '.webp', domain: DOMAINS[c.id] || 'Курс', types: TYPES[c.id] || [],
      parts: [{id: c.id + '-p1', title: c.title, steps: steps.map(s => s.id)}], steps, tasks, cards, links,
      generatedBy: 'вручную (демонстрационное наполнение)'
    };
  }

  /* Режим сервера: курсы из базы (задания без ответов — проверяет сервер). Курс из документа помечается source='upload'. */
  async function loadServer() {
    const lite = await Api.get('/api/courses');
    const full = await Promise.all(lite.map(c => Api.get('/api/courses/' + encodeURIComponent(c.id)).catch(() => null)));
    const cs = full.filter(Boolean).map(c => ({...c, server: true, domain: c.domain || 'Ваша книга', types: c.types || []}));
    builtin = cs.filter(c => c.source === 'builtin'); user = cs.filter(c => c.source === 'upload');
    return list();
  }
  async function load() {
    if (window.Api?.enabled()) {
      try { return await loadServer(); } catch (err) { console.error(err); U.toast('Не удалось загрузить курсы с сервера: ' + err.message); builtin = []; user = []; return list(); }
    }
    // курсы, собранные конвейером (data/pipeline.js); демонстрационное наполнение — только если их нет
    builtin = window.PIPELINE?.courses?.length ? window.PIPELINE.courses.map(c => ({...c})) : (window.COURSES || []).map(fromLegacy);
    try { user = (await Store.DB.all('courses')) || []; } catch { user = []; }
    user.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return list();
  }
  const init = () => (ready ||= load());
  const reload = () => { ready = null; return init(); };
  const list = () => [...user, ...builtin];
  const get = id => list().find(c => c.id === id);
  const step = (c, id) => c?.steps.find(s => s.id === id);
  const tasksOf = (c, sid) => c.tasks.filter(t => t.stepId === sid);
  const totalSteps = () => list().reduce((n, c) => n + c.steps.length, 0);
  const key = (c, s) => c.id + '/' + s.id;

  async function saveUser(course, book) {
    await Store.DB.put('courses', course);
    if (book) await Store.DB.put('books', book);
    user = user.filter(c => c.id !== course.id); user.unshift(course);
  }
  async function remove(id) {
    await Store.DB.del('courses', id); await Store.DB.del('books', id);
    user = user.filter(c => c.id !== id);
  }

  /* Прогресс по событиям: последняя и первая попытка по каждому заданию. */
  function answers(c, sid) { return Store.state.events.filter(e => e.type === 'answer' && e.courseId === c.id && e.lessonId === sid); }
  function stepStats(c, s) {
    const ts = tasksOf(c, s.id), ev = answers(c, s.id);
    const last = id => ev.filter(e => e.questionId === id).at(-1);
    const first = id => ev.find(e => e.questionId === id);
    const answered = ts.filter(t => last(t.id)).length;
    return {
      total: ts.length, answered, right: ts.filter(t => last(t.id)?.correct).length,
      allAnswered: ts.length > 0 && answered === ts.length,
      allFirstTryCorrect: ts.length > 0 && ts.every(t => first(t.id)?.correct)
    };
  }
  const isDone = (c, s) => Store.state.completed.includes(key(c, s));
  function progress(c) {
    const done = c.steps.filter(s => isDone(c, s)).length;
    return {done, total: c.steps.length, pct: c.steps.length ? Math.round(100 * done / c.steps.length) : 0};
  }
  function resumeStep(c) {
    const [cid, sid] = (Store.state.last || '').split('/');
    return (cid === c.id && c.steps.find(s => s.id === sid && !isDone(c, s))) || c.steps.find(s => !isDone(c, s)) || c.steps[0];
  }
  const minutes = c => c.steps.reduce((n, s) => n + (Number(s.minutes) || 0), 0);

  window.Catalog = {init, reload, list, get, step, tasksOf, totalSteps, key, saveUser, remove, stepStats, isDone, progress, resumeStep, minutes, answers};
})();
