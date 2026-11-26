/* Движок демо-курса. Всё содержимое берётся из window.COURSE (собирается build/build.mjs из учебного слоя).
   Работает с file:// без сервера: классические скрипты, хранение — localStorage. */
(function () {
  'use strict';
  var C = window.COURSE;
  if (!C) { document.getElementById('main').textContent = 'Нет данных курса (course-data.js).'; return; }

  // ---------- утилиты ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Мини-разметка учебного слоя: _{низ} ^{верх} [[термин]] [[термин|как показать]] **жирный**
  function md(s) {
    var t = esc(s);
    t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, term, shown) {
      return '<dfn class="term" tabindex="0" data-term="' + term.replace(/"/g, '&quot;') + '">' + (shown || term) + '</dfn>';
    });
    t = t.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return t;
  }
  function plain(s) { return String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, a, b) { return b || a; }).replace(/[_^]\{([^}]*)\}/g, '$1').replace(/\*\*/g, ''); }
  function plural(n, f) { var a = n % 10, b = n % 100; return n + ' ' + (b >= 11 && b <= 14 ? f[2] : a === 1 ? f[0] : a >= 2 && a <= 4 ? f[1] : f[2]); }
  function pages(p) { if (!p || !p.length) return ''; return 'с. ' + (p.length > 1 && p[p.length - 1] !== p[0] ? p[0] + '–' + p[p.length - 1] : p[0]); }
  function mins(n) { if (n < 60) return n + ' мин'; var h = Math.floor(n / 60), m = n % 60; return h + ' ч' + (m ? ' ' + m + ' мин' : ''); }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 2600); }

  var steps = C.steps, byId = {}, partById = {};
  steps.forEach(function (s) { byId[s.id] = s; });
  C.parts.forEach(function (p) { partById[p.id] = p; });
  var allTasks = []; steps.forEach(function (s) { (s.tasks || []).forEach(function (t) { allTasks.push({ step: s, task: t }); }); });
  var glossary = {}; steps.forEach(function (s) { (s.glossary || []).forEach(function (g) { if (!glossary[g.term.toLowerCase()]) glossary[g.term.toLowerCase()] = { g: g, step: s }; }); });

  // ---------- состояние (только в этом браузере) ----------
  var KEY = 'strata:' + C.id + ':v1';
  var S = { visited: {}, done: {}, answers: {}, cards: {}, last: null };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) for (var k in S) if (raw[k] != null) S[k] = raw[k]; } catch (e) {}
  var warned = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!warned) { warned = true; toast('Браузер не даёт сохранить прогресс на этом устройстве.'); } } }

  function stepDone(s) { return !!S.done[s.id]; }
  function doneCount() { return steps.filter(stepDone).length; }
  function taskResult(s, t) { return S.answers[s.id + '/' + t.id]; }
  function checkDone(s) {
    if (S.done[s.id]) return;
    var tasksOk = (s.tasks || []).every(function (t) { return taskResult(s, t); });
    if (S.visited[s.id] === 'end' && tasksOk) { S.done[s.id] = Date.now(); save(); updateProgress(); }
  }
  function updateProgress() {
    var pct = steps.length ? Math.round(100 * doneCount() / steps.length) : 0;
    $('#progress-bar').style.width = pct + '%';
  }

  // ---------- шапка ----------
  var NAV = [['', 'Путь'], ['map', 'Карта связей'], ['cards', 'Карточки'], ['notes', 'Конспект'], ['source', 'Источник']];
  function setNav(cur) {
    $('#nav').innerHTML = NAV.map(function (n) { return '<a href="#/' + n[0] + '"' + (cur === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</a>'; }).join('');
    $('#nav').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
  }
  $('#menu-btn').onclick = function () { var o = $('#nav').classList.toggle('open'); this.setAttribute('aria-expanded', String(o)); };
  function themeLabel() { $('#theme-btn').textContent = document.documentElement.dataset.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'; }
  $('#theme-btn').onclick = function () {
    var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; try { localStorage.setItem('strata-theme', t); } catch (e) {}
    themeLabel(); if (window.WIDGETS && WIDGETS.redrawAll) WIDGETS.redrawAll();
  };
  themeLabel();
  $('#foot').innerHTML = esc(C.book.author) + '. ' + esc(C.book.title) + ' (' + esc(C.book.year) + '). ' + esc(C.book.chapter) + ', с. ' + esc(C.book.pages) + '. Страницы — по PDF.<br>Курс собран конвейером из учебного слоя ' + esc(C.layerVersion || '') + ' · ' + esc(C.report && C.report.built ? C.report.built.slice(0, 10) : '') + '. Прогресс хранится только в этом браузере.';

  // ---------- общие куски ----------
  function stepLink(s, cls) { return '<a href="#/step/' + s.id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(s.title) + '</a>'; }
  function resumeTarget() {
    var l = S.last && byId[S.last.step] ? S.last : null;
    if (l && !stepDone(byId[l.step])) return l;
    var next = steps.filter(function (s) { return !stepDone(s); })[0];
    return next ? { step: next.id, block: null } : (l || { step: steps[0].id });
  }
  var BLOCK_NAMES = { essence: 'Суть', how: 'Как это работает', procedure: 'По шагам', examples: 'Разбор примеров', numbers: 'Цифры и условия', formulas: 'Формулы', tables: 'Таблицы книги', glossary: 'Новые понятия', mistake: 'Частая ошибка', data: 'Что это значит для данных', decision: 'Решение на данных', manual: 'Где здесь ручной труд', analogy: 'Аналогия', now: 'Как это делается сейчас', figures: 'Иллюстрации', media: 'Ролик', booktasks: 'Задачи из книги', tasks: 'Проверь себя', source: 'Источник', links: 'Связи шага' };
  var CLAIM_KIND = { observation: 'наблюдение', inference: 'вывод', assumption: 'допущение' };

  // ---------- Путь ----------
  function viewHome() {
    setNav('');
    var total = steps.reduce(function (a, s) { return a + s.minutes; }, 0);
    var left = steps.filter(function (s) { return !stepDone(s); }).reduce(function (a, s) { return a + s.minutes; }, 0);
    var answered = allTasks.filter(function (x) { return taskResult(x.step, x.task); });
    var right = answered.filter(function (x) { return taskResult(x.step, x.task).first; }).length;
    var r = resumeTarget(), rs = byId[r.step], started = doneCount() > 0 || Object.keys(S.visited).length > 0;
    var h = '<div class="home-head"><p class="kicker">' + esc(C.book.chapter) + ' · демо-курс для новичка</p><h1>' + esc(C.title) + '</h1>' +
      '<p class="book-line">По книге: ' + esc(C.book.author) + ', «' + esc(C.book.title) + '», ' + esc(C.book.year) + '. ' + esc(C.book.chapterTitle) + ', с. ' + esc(C.book.pages) + '.</p>' +
      '<div class="intro">' + (C.intro || []).map(function (p) { return '<p>' + md(p) + '</p>'; }).join('') + '</div>' +
      '<div class="resume"><div class="where">' + (started ? 'Вы остановились на шаге ' + rs.n + ': <b>' + esc(rs.title) + '</b>' + (r.block && BLOCK_NAMES[r.block] ? ', раздел «' + BLOCK_NAMES[r.block] + '»' : '') : 'Начните с шага 1: <b>' + esc(steps[0].title) + '</b>') + '</div>' +
      '<a class="btn" href="#/step/' + rs.id + (r.block ? '/' + r.block : '') + '">' + (started ? 'Продолжить' : 'Начать') + ' →</a></div>' +
      '<p class="stats"><span>Пройдено <b>' + doneCount() + ' из ' + steps.length + '</b> шагов</span><span>Осталось около <b>' + mins(left) + '</b> из ' + mins(total) + '</span><span>Заданий решено <b>' + answered.length + ' из ' + allTasks.length + '</b>' + (answered.length ? ', с первой попытки ' + right : '') + '</span></p></div>';
    h += '<div class="toc">';
    var cur = r.step;
    C.parts.forEach(function (p) {
      h += '<section class="part"><h2>' + esc(p.title) + '</h2>' + (p.sub ? '<p class="part-sub">' + esc(p.sub) + '</p>' : '') + '<ol>';
      p.steps.forEach(function (id) {
        var s = byId[id], d = stepDone(s), nt = (s.tasks || []).length;
        var st = d ? 'пройден' : S.visited[s.id] ? 'начат' : '';
        h += '<li><a class="row' + (d ? ' done' : '') + (id === cur && !d ? ' now' : '') + '" href="#/step/' + s.id + '"><span class="num">' + (d ? '✓' : s.n) + '</span><span class="t">' + esc(s.title) + '</span><span class="min">' + s.minutes + ' мин' + (st ? '<span class="st">' + st + '</span>' : '') + '</span><span class="bt">' + esc(plain(s.bookShort || s.bookTitle)) + ' · ' + pages(s.pages) + (nt ? ' · ' + plural(nt, ['задание', 'задания', 'заданий']) : '') + '</span></a></li>';
      });
      h += '</ol></section>';
    });
    h += '</div>';
    $('#main').innerHTML = h;
  }

  // ---------- Страница шага ----------
  // отслеживание места — см. track() ниже
  function figureHTML(f) {
    var cls = C.legend.frameClasses[f.class] ? C.legend.frameClasses[f.class].label : '';
    var body = '';
    if (f.kind === 'scan' || f.kind === 'image') body = '<img class="scan" src="' + esc(f.src) + '" alt="' + esc(f.alt) + '" loading="lazy">';
    else if (f.kind === 'widget') body = '<div class="widget" data-widget="' + esc(f.widget) + '" data-fig="' + esc(f.id) + '" role="group" aria-label="' + esc(f.alt) + '"></div>';
    return '<figure class="fig" id="fig-' + esc(f.id) + '"><div class="canvas">' + body + '</div><figcaption>' + md(f.caption) + (cls ? ' <span class="cls">· ' + esc(cls) + '</span>' : '') + (f.origin ? '<span class="origin">' + md(f.origin) + '</span>' : '') + '</figcaption></figure>';
  }
  function parHTML(p, s) {
    var claims = (p.claims || []).map(function (id) { return (s.claims || []).filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
    var btn = p.page ? '<button type="button" class="pg" aria-expanded="false" data-q="' + esc((p.claims || []).join(',')) + '" title="Показать слова автора">с. ' + esc(p.page) + '</button>' : '';
    return '<p class="par">' + md(p.text) + (p.hyp ? ' <span class="tag hyp">гипотеза модели</span>' : '') + btn + '</p>' + (claims.length ? '<div class="qbox" hidden>' + claims.map(function (c) { return '<span class="src-quote">«' + md(c.quote) + '»<cite>' + esc(C.book.authorShort || C.book.author) + ', с. ' + esc(c.page) + '</cite></span>'; }).join('') + '</div>' : '');
  }
  function listItem(x) { return typeof x === 'string' ? '<li>' + md(x) + '</li>' : '<li>' + md(x.text) + (x.hyp ? ' <span class="tag hyp">гипотеза модели</span>' : '') + (x.page ? ' <span class="muted ui">с. ' + esc(x.page) + '</span>' : '') + '</li>'; }

  function viewStep(id, block) {
    var s = byId[id]; if (!s) { location.hash = '#/'; return; }
    setNav('');
    if (!S.visited[s.id]) { S.visited[s.id] = 'open'; }
    S.last = { step: s.id, block: block || null }; save();
    var i = steps.indexOf(s), prev = steps[i - 1], next = steps[i + 1], part = partById[s.part];
    var B = [];  // [key, title, html, extraClass]
    var figs = s.figures || [], top = figs.filter(function (f) { return f.place === 'top'; }), rest = figs.filter(function (f) { return f.place !== 'top' && f.place !== 'examples'; }), exFigs = figs.filter(function (f) { return f.place === 'examples'; });

    if (s.essence && s.essence.length) B.push(['essence', 'Суть', '<div class="essence">' + s.essence.map(function (x) { return '<p>' + md(x) + '</p>'; }).join('') + '</div>' + top.map(figureHTML).join('')]);
    if (s.how && s.how.length) B.push(['how', 'Как это работает', s.how.map(function (p) { return parHTML(p, s); }).join('')]);
    if (s.procedure && s.procedure.items && s.procedure.items.length) B.push(['procedure', 'По шагам', (s.procedure.intro ? '<p>' + md(s.procedure.intro) + (s.procedure.page ? ' <span class="muted ui">с. ' + s.procedure.page + '</span>' : '') + '</p>' : '') + '<ol class="steps">' + s.procedure.items.map(function (x) { return '<li>' + md(x.text) + (x.page ? ' <span class="muted ui">с. ' + esc(x.page) + '</span>' : '') + '</li>'; }).join('') + '</ol>']);
    if ((s.examples && s.examples.length) || exFigs.length) B.push(['examples', 'Разбор примеров из главы', exFigs.map(figureHTML).join('') + (s.examples || []).map(function (e) {
      return '<div class="example" id="ex-' + esc(e.id) + '"><h3>' + esc(e.title) + '<small>с. ' + esc(e.page) + '</small></h3>' +
        '<div class="lbl">Условие</div><p>' + md(e.given) + '</p>' +
        (e.steps && e.steps.length ? '<div class="lbl">Как решает автор</div><ol>' + e.steps.map(function (x) { return '<li>' + md(x) + '</li>'; }).join('') + '</ol>' : '') +
        '<div class="result"><b class="ui">Итог: </b>' + md(e.result) + '</div>' + (e.note ? '<p class="tnote">' + md(e.note) + '</p>' : '') + '</div>';
    }).join('')]);
    if (s.numbers && s.numbers.length) B.push(['numbers', 'Цифры и условия', '<div class="tscroll"><table><thead><tr><th>Что</th><th>Значение</th><th>Когда верно</th><th>с.</th></tr></thead><tbody>' + s.numbers.map(function (n) { return '<tr><td>' + md(n.name) + '</td><td><b>' + md(n.value) + '</b></td><td>' + md(n.cond || '—') + '</td><td class="num">' + esc(n.page) + '</td></tr>'; }).join('') + '</tbody></table></div>']);
    if (s.formulas && s.formulas.length) B.push(['formulas', 'Формулы', s.formulas.map(function (f) {
      return '<div class="formula"><div class="f">' + md(f.expr) + (f.no ? '<span class="no">' + esc(f.no) + '</span>' : '') + '</div>' + (f.vars && f.vars.length ? '<dl>' + f.vars.map(function (v) { return '<dt>' + md(v.s) + '</dt><dd>' + md(v.m) + (v.u ? ', <i>' + md(v.u) + '</i>' : '') + '</dd>'; }).join('') + '</dl>' : '') + '<div class="fsrc">' + (f.note ? md(f.note) + ' ' : '') + 'Формула из главы, с. ' + esc(f.page) + '.</div></div>';
    }).join('')]);
    if (s.tables && s.tables.length) B.push(['tables', 'Таблицы книги', s.tables.map(tableHTML).join(''), 'blk-wide']);
    if (s.glossary && s.glossary.length) B.push(['glossary', 'Новые понятия', '<dl class="gloss">' + s.glossary.map(function (g) { return '<dt id="g-' + esc(slug(g.term)) + '">' + md(g.term) + (g.en ? '<span>' + md(g.en) + '</span>' : '') + '</dt><dd>' + md(g.def) + (g.page ? ' <span class="muted ui">с. ' + esc(g.page) + '</span>' : '') + '</dd>'; }).join('') + '</dl>']);
    if (s.mistake) B.push(['mistake', 'Частая ошибка', '<div class="mistake"><div class="wrong">' + md(s.mistake.wrong) + '</div><p class="right">' + md(s.mistake.right) + (s.mistake.page ? ' <span class="muted ui">с. ' + esc(s.mistake.page) + '</span>' : '') + '</p></div>']);
    if (s.data) B.push(['data', 'Что это значит для данных <span class="tag model">пишет модель</span>', '<div class="data-grid"><div><h3>На входе</h3><ul>' + (s.data.input || []).map(listItem).join('') + '</ul></div><div><h3>На выходе</h3><ul>' + (s.data.output || []).map(listItem).join('') + '</ul></div>' + (s.data.breaks && s.data.breaks.length ? '<div class="breaks"><h3>Где ломается</h3><ul>' + s.data.breaks.map(listItem).join('') + '</ul></div>' : '') + '</div>']);
    if (s.decision) B.push(['decision', 'Решение на данных <span class="tag model">пишет модель</span>', '<ol class="decision"><li><b class="ui">Признаки.</b> ' + s.decision.features.map(md).join('; ') + '</li><li><b class="ui">Правило.</b> ' + md(s.decision.rule) + '</li><li><b class="ui">Вывод.</b> ' + md(s.decision.conclusion) + '</li></ol>' + (s.decision.counterexample ? '<p class="limit"><b>Контрпример.</b> ' + md(s.decision.counterexample) + '</p>' : '')]);
    if (s.inefficiency) B.push(['manual', 'Где здесь ручной труд <span class="tag model">пишет модель</span>', '<dl class="gloss manual"><dt>Входные данные</dt><dd>' + md(s.inefficiency.inputs) + '</dd><dt>Ручные шаги</dt><dd>' + md(s.inefficiency.manualSteps) + '</dd><dt>Где нужно суждение специалиста</dt><dd>' + md(s.inefficiency.judgment) + '</dd><dt>Время</dt><dd>' + md(s.inefficiency.time) + '</dd><dt>Типичные ошибки</dt><dd>' + md(s.inefficiency.errors) + '</dd></dl>']);
    if (s.analogy || s.itAnalogy) B.push(['analogy', 'Аналогия <span class="tag model">пишет модель</span>', (s.analogy ? '<div class="analogy"><p>' + md(s.analogy.text) + '</p><p class="limit"><b>Где перестаёт работать.</b> ' + md(s.analogy.limit) + '</p></div>' : '') + (s.itAnalogy ? '<div class="analogy"><p><b class="ui">ИТ-аналогия.</b> ' + md(s.itAnalogy.text) + '</p><p class="limit"><b>Где перестаёт работать.</b> ' + md(s.itAnalogy.limit) + '</p></div>' : '')]);
    if (s.nowPractice) B.push(['now', 'Как это делается сейчас <span class="tag hyp">вне книги</span>', '<p>' + md(s.nowPractice) + '</p><p class="ui muted">Книга издана в ' + esc(C.book.year) + ' г. Этот блок пишет модель по современной практике; в главе его нет.</p>']);
    if (rest.length) B.push(['figures', 'Иллюстрации', rest.map(figureHTML).join(''), 'blk-wide']);
    if (s.media && s.media.length) B.push(['media', 'Ролик', s.media.map(mediaHTML).join('')]);
    if (s.bookTasks && s.bookTasks.length) B.push(['booktasks', 'Задачи из книги', '<p class="ui muted">Для самостоятельной работы с книгой: нужны рисунки, которых нет в курсе.</p><ol class="booktasks">' + s.bookTasks.map(function (t) { return '<li><b>Задача ' + esc(t.no) + '.</b> ' + md(t.text) + '<span class="need">Нужен рисунок: ' + esc(t.need || 'не требуется') + ' · с. ' + esc(t.page) + '</span></li>'; }).join('') + '</ol>']);
    if (s.tasks && s.tasks.length) B.push(['tasks', 'Проверь себя', '<p class="score" id="score"></p>' + s.tasks.map(function (t, k) { return taskHTML(s, t, k); }).join('')]);
    if (s.claims && s.claims.length) B.push(['source', 'Источник', '<p class="ui muted">Утверждения шага: пересказ модели и дословная цитата автора. По этим утверждениям проверяются задания.</p><ul class="claims">' + s.claims.map(function (c) { return '<li id="claim-' + esc(c.id) + '"><span class="k">' + esc(CLAIM_KIND[c.kind] || c.kind || 'утверждение') + ' · ' + esc(c.id) + '</span><div class="m">' + md(c.text) + '</div><q>' + md(c.quote) + '</q><span class="p">' + esc(C.book.authorShort || C.book.author) + ', с. ' + esc(c.page) + '</span></li>'; }).join('') + '</ul>']);
    var ins = C.edges.filter(function (e) { return e.to === s.id; }), outs = C.edges.filter(function (e) { return e.from === s.id; });
    if (ins.length || outs.length || s.whyHere) B.push(['links', 'Связи шага', (s.whyHere ? '<p><b class="ui">Почему этот шаг здесь.</b> ' + md(s.whyHere) + ' <span class="tag model">пишет модель</span></p>' : '') + '<div class="links-grid"><div><b>Опирается на</b><ul>' + (ins.length ? ins.map(function (e) { return '<li>' + stepLink(byId[e.from]) + ' <span class="muted">(' + esc(EDGE[e.type] || e.type) + ')</span></li>'; }).join('') : '<li class="muted">это начало пути</li>') + '</ul></div><div><b>Нужен дальше</b><ul>' + (outs.length ? outs.map(function (e) { return '<li>' + stepLink(byId[e.to]) + ' <span class="muted">(' + esc(EDGE[e.type] || e.type) + ')</span></li>'; }).join('') : '<li class="muted">конец главы</li>') + '</ul></div></div><p class="ui"><a href="#/map">Вся карта связей →</a></p>']);

    var tocItems = B.map(function (b) { return '<li><a href="#/step/' + s.id + '/' + b[0] + '" data-b="' + b[0] + '">' + BLOCK_NAMES[b[0]] + '</a></li>'; }).join('');
    var sidePath = '<nav class="side-path" aria-label="Путь по главе"><h2>Путь по главе</h2>' + C.parts.map(function (p) { return '<div class="pp">' + esc(p.short || p.title) + '</div><ol>' + p.steps.map(function (sid) { var x = byId[sid]; return '<li><a href="#/step/' + x.id + '"' + (x === s ? ' aria-current="page"' : '') + (stepDone(x) ? ' class="done"' : '') + '><span class="n">' + (stepDone(x) ? '✓' : x.n) + '</span><span>' + esc(x.title) + '</span></a></li>'; }).join('') + '</ol>'; }).join('') + '</nav>';
    var h = '<div class="step-grid">' + sidePath + '<article class="step-main">' +
      '<header class="step-head"><p class="kicker"><a href="#/">Путь</a> · ' + esc(part ? part.short || part.title : '') + ' · шаг ' + s.n + ' из ' + steps.length + '</p>' +
      '<h1 id="step-title">' + esc(s.title) + '</h1><p class="book-title"><span>В книге: </span>' + md(s.bookTitle) + '</p>' +
      '<p class="meta"><span>≈ ' + s.minutes + ' мин</span><span>' + pages(s.pages) + '</span>' + (s.difficulty ? '<span>трудность: ' + esc(s.difficulty.map(function (d) { return C.difficulty && C.difficulty[d] || d; }).join(', ')) + '</span>' : '') + (s.route ? '<span>формат: ' + esc(s.route.format) + '</span>' : '') + (s.threshold ? '<span title="Пороговая идея: после неё тема видится иначе, и без неё следующие шаги не понять">пороговая идея</span>' : '') + (stepDone(s) ? '<span style="color:var(--ok)">шаг пройден ✓</span>' : '') + '</p>' +
      '<p class="how-to-read">Обычный текст — пересказ главы моделью. Нажмите на «с. N» у абзаца, чтобы увидеть <q>слова автора</q>. Пометка «гипотеза модели» — вывод, которого нет в книге.</p>' +
      '<details class="inline-toc"><summary>На этой странице</summary><ol>' + tocItems + '</ol></details></header>' +
      B.map(function (b) { return '<section class="blk ' + (b[3] || '') + '" id="b-' + b[0] + '" data-block="' + b[0] + '"><h2>' + b[1] + '</h2>' + b[2] + '</section>'; }).join('') +
      '<div id="step-end" aria-hidden="true"></div>' +
      '<nav class="pager" aria-label="Назад и дальше">' + (prev ? '<a class="prev" href="#/step/' + prev.id + '"><small>← Назад · шаг ' + prev.n + '</small><b>' + esc(prev.title) + '</b></a>' : '<a class="prev" href="#/"><small>← К пути</small><b>Оглавление главы</b></a>') +
      (next ? '<a class="next" href="#/step/' + next.id + '"><small>Дальше · шаг ' + next.n + ' →</small><b>' + esc(next.title) + '</b></a>' : '<a class="next" href="#/notes"><small>Глава пройдена →</small><b>Конспект главы</b></a>') + '</nav>' +
      '</article><nav class="side-toc" aria-label="На этой странице"><h2>На этой странице</h2><ol>' + tocItems + '</ol></nav></div>';
    $('#main').innerHTML = h;
    document.title = s.title + ' · ' + C.title;

    // обработчики
    $$('.pg').forEach(function (b) {
      b.onclick = function () {
        var box = b.parentNode.nextElementSibling;
        if (box && box.classList.contains('qbox')) { box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); }
        else if (b.dataset.q) gotoClaim(b.dataset.q.split(',')[0]);
      };
    });
    bindTerms($('#main'));
    $$('.task').forEach(function (el) { bindTask(s, el); });
    updateScore(s);
    $$('.vid').forEach(function (box, k) { bindVideo(box, (s.media || [])[k]); });
    if (window.WIDGETS) WIDGETS.mountAll($('#main'), C, s);
    $$('[data-b]').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); scrollToBlock(a.dataset.b); history.replaceState(null, '', '#/step/' + s.id + '/' + a.dataset.b); }; });

    // где читатель: подсветка оглавления, сохранение места и отметка «дочитал до конца»
    tracking = s; lastBlock = undefined;
    if (block) setTimeout(function () { scrollToBlock(block); }, 30); else window.scrollTo(0, 0);
    setTimeout(track, 60);
  }
  var tracking = null, trackTimer = null, lastBlock = null;
  function track() {
    var s = tracking; if (!s || !byId[s.id] || !document.getElementById('step-end')) return;
    var line = window.innerHeight * 0.3, cur = null;
    $$('section.blk').forEach(function (x) { if (x.getBoundingClientRect().top <= line) cur = x.dataset.block; });
    if (cur !== lastBlock) {
      lastBlock = cur;
      $$('.side-toc a').forEach(function (a) { a.classList.toggle('on', a.dataset.b === cur); });
      S.last = { step: s.id, block: cur }; save();
    }
    if (document.getElementById('step-end').getBoundingClientRect().top <= window.innerHeight && S.visited[s.id] !== 'end') { S.visited[s.id] = 'end'; save(); checkDone(s); }
  }
  window.addEventListener('scroll', function () { clearTimeout(trackTimer); trackTimer = setTimeout(track, 120); }, { passive: true });
  function scrollToBlock(b) {
    var el = document.getElementById('b-' + b); if (!el) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    var h = el.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function gotoClaim(cid) {
    var el = document.getElementById('claim-' + cid); if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 2200);
  }
  function slug(t) { return String(t).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-'); }
  var EDGE = { base: 'предпосылка', example: 'пример к правилу', data: 'переход к данным', myth: 'снимает заблуждение' };

  function tableHTML(t) {
    var fixes = {}; (t.fixes || []).forEach(function (f) { fixes[f.r + ':' + f.c] = f; });
    var numCols = t.num || [];
    var head = (t.head || []).map(function (row) { return '<tr>' + row.map(function (c) { var o = typeof c === 'object' ? c : { t: c }; return '<th' + (o.cs ? ' colspan="' + o.cs + '"' : '') + (o.rs ? ' rowspan="' + o.rs + '"' : '') + '>' + md(o.t) + '</th>'; }).join('') + '</tr>'; }).join('');
    var body = (t.rows || []).map(function (row, r) {
      return '<tr>' + row.map(function (c, ci) {
        var o = typeof c === 'object' && c !== null ? c : { t: c }; var fx = fixes[r + ':' + ci];
        var cell = fx ? '<mark class="ocr" title="Исправлено: было «' + esc(fx.was) + '»">' + md(o.t) + '</mark><a class="fix" href="#/source" title="В листе опечаток">испр.</a>' : md(o.t);
        return '<td' + (numCols.indexOf(ci) >= 0 ? ' class="num"' : '') + (o.cs ? ' colspan="' + o.cs + '"' : '') + (o.rs ? ' rowspan="' + o.rs + '"' : '') + '>' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<p class="tcap">' + md(t.title) + ' <span class="muted ui">с. ' + esc(t.page) + '</span></p><div class="tscroll' + (t.big ? ' big' : '') + '" tabindex="0" role="region" aria-label="' + esc(plain(t.title)) + '"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + (t.notes || []).map(function (n) { return '<p class="tnote">' + md(n) + '</p>'; }).join('');
  }

  // ---------- термины ----------
  var tip = null;
  function bindTerms(root) {
    $$('dfn.term', root).forEach(function (d) {
      var show = function () {
        var g = glossary[(d.dataset.term || '').toLowerCase()];
        if (!g) return;
        closeTip(); tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip');
        tip.innerHTML = '<b>' + esc(g.g.term) + '.</b> ' + md(g.g.def);
        document.body.appendChild(tip);
        var r = d.getBoundingClientRect(); var w = Math.min(340, window.innerWidth - 24);
        tip.style.maxWidth = w + 'px';
        tip.style.left = Math.max(12, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - w - 12)) + 'px';
        tip.style.top = (window.scrollY + r.bottom + 6) + 'px';
      };
      d.onclick = function (e) { e.stopPropagation(); tip ? closeTip() : show(); };
      d.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tip ? closeTip() : show(); } if (e.key === 'Escape') closeTip(); };
      d.onblur = closeTip;
    });
  }
  function closeTip() { if (tip) { tip.remove(); tip = null; } }
  document.addEventListener('click', closeTip);

  // ---------- видео с вопросом ----------
  function mediaHTML(m) {
    var a = m.ask;
    return '<div class="vid' + (m.vertical ? ' vert' : '') + '" data-at="' + (a ? a.at : '') + '"><div class="player"><video controls playsinline preload="metadata" poster="' + esc(m.poster || '') + '" src="' + esc(m.src) + '" aria-label="' + esc(m.title) + '">' + (m.subtitles ? '<track kind="subtitles" srclang="ru" label="Русские субтитры" src="' + esc(m.subtitles) + '" default>' : '') + '</video>' + (a ? '<div class="ask" hidden><p>' + esc(a.q) + '</p>' + a.options.map(function (o, i) { return '<button type="button" data-i="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div>' : '') + '</div>' +
      '<div><h3 style="margin-top:0">' + esc(m.title) + '</h3><p class="ui muted">' + esc(m.format || '') + (m.duration ? ' · ' + m.duration + ' с' : '') + (m.page ? ' · по с. ' + esc(m.page) : '') + '</p>' + (m.hook ? '<p>' + md(m.hook) + '</p>' : '') + (a ? '<p class="ui">В середине ролик остановится и задаст вопрос — сначала попробуйте ответить сами.</p><div class="vfb" aria-live="polite"></div>' : '') + (m.remedial ? '<p class="ui"><button type="button" class="linklike" data-rem="' + esc(m.remedial) + '">Короткое пояснение к вопросу</button></p>' : '') + '</div></div>';
  }
  function bindVideo(box, m) {
    var v = $('video', box), ask = $('.ask', box), at = parseFloat(box.dataset.at), asked = false;
    if (ask && m && m.ask) {
      v.addEventListener('timeupdate', function () { if (!asked && v.currentTime >= at) { asked = true; v.pause(); ask.hidden = false; var b = $('button', ask); if (b) b.focus(); } });
      $$('button', ask).forEach(function (b) {
        b.onclick = function () {
          // отклик в слое задан для каждого варианта ответа
          var i = +b.dataset.i, ok = i === m.ask.answer, fbText = String((m.ask.feedback || [])[i] || '').replace(/^Верно\.\s*/, '');
          $('.vfb', box).innerHTML = '<div class="fb ' + (ok ? 'ok' : 'no') + '"><b class="v">' + (ok ? 'Верно.' : 'Не совсем.') + '</b> ' + md(fbText) + '</div>';
          ask.hidden = true; v.play();
        };
      });
    }
    var rem = $('[data-rem]', box);
    if (rem) rem.onclick = function () { v.src = rem.dataset.rem; asked = true; v.play(); rem.parentNode.innerHTML = '<span class="muted ui">Идёт пояснение. Чтобы вернуться к ролику, откройте шаг заново.</span>'; };
  }

  // ---------- задания ----------
  var TYPE = { single: 'Один ответ', multi: 'Несколько ответов', order: 'Порядок: перетащите или используйте стрелки', blank: 'Пропуск в тексте', calc: 'Расчёт' };
  function seededShuffle(arr, seed) { var a = arr.slice(), h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; for (var j = a.length - 1; j > 0; j--) { h = (h * 1103515245 + 12345) >>> 0; var k = h % (j + 1); var t = a[j]; a[j] = a[k]; a[k] = t; } if (a.every(function (x, i) { return x === arr[i]; }) && a.length > 1) a.push(a.shift()); return a; }
  function taskHTML(s, t, k) {
    var id = 't-' + s.id + '-' + t.id, q = '<p class="ttype">' + (k + 1) + '. ' + TYPE[t.type] + '</p>', body = '';
    if (t.type === 'single' || t.type === 'multi') {
      body = '<p class="tq" id="' + id + '-q">' + md(t.q) + '</p><div class="opts" role="' + (t.type === 'single' ? 'radiogroup' : 'group') + '" aria-labelledby="' + id + '-q">' + t.options.map(function (o, i) { return '<label class="opt"><input type="' + (t.type === 'single' ? 'radio' : 'checkbox') + '" name="' + id + '" value="' + i + '"><span>' + md(o) + '</span></label>'; }).join('') + '</div>';
    } else if (t.type === 'order') {
      var order = seededShuffle(t.items.map(function (x, i) { return i; }), s.id + t.id);
      body = '<p class="tq" id="' + id + '-q">' + md(t.q) + '</p><ol class="order" aria-labelledby="' + id + '-q">' + order.map(function (i) { return '<li data-i="' + i + '"><span class="grip" aria-hidden="true">⠿</span><span class="txt">' + md(t.items[i]) + '</span><span class="mv"><button type="button" data-mv="-1" aria-label="Выше">↑</button><button type="button" data-mv="1" aria-label="Ниже">↓</button></span></li>'; }).join('') + '</ol>';
    } else if (t.type === 'blank') {
      var parts = String(t.text).split('___');
      body = '<p class="tq">' + md(t.q || 'Заполните пропуск.') + '</p><p class="blank-line">' + md(parts[0]) + '<label class="sr" for="' + id + '-in">Пропущенное слово</label><input id="' + id + '-in" autocomplete="off" spellcheck="false">' + md(parts[1] || '') + '</p>';
    } else if (t.type === 'calc') {
      body = '<p class="tq" id="' + id + '-q">' + md(t.q) + '</p><div class="calc-in"><label class="sr" for="' + id + '-in">Ответ</label><input id="' + id + '-in" inputmode="decimal" autocomplete="off" aria-describedby="' + id + '-q"><span>' + md(t.unit || '') + '</span></div>';
    }
    return '<div class="task" data-t="' + esc(t.id) + '">' + q + body + '<div class="hintbox" aria-live="polite"></div><div class="acts" style="margin-top:12px"><button type="button" class="btn small check">Проверить</button><button type="button" class="btn line small hint">Подсказка</button><span class="ui muted val" role="status"></span></div><div class="fbbox" aria-live="polite"></div></div>';
  }
  function bindTask(s, el) {
    var t = (s.tasks || []).filter(function (x) { return x.id === el.dataset.t; })[0];
    if (t.type === 'order') bindOrder(el);
    $('.check', el).onclick = function () { checkTask(s, t, el); };
    var inp = $('input[id$="-in"]', el); if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') checkTask(s, t, el); };
    // Подсказки по шагам: свои из слоя (t.hints), затем «где искать» и опорное утверждение — ответ они не называют
    var claim = (s.claims || []).filter(function (c) { return c.id === t.claim; })[0];
    var hints = (t.hints || []).concat(claim ? ['Ответ есть в этом шаге: ищите абзац с пометкой «с. ' + claim.page + '» в разделе «Как это работает».', 'Опора: ' + claim.text] : []);
    var hb = $('.hint', el), level = 0;
    if (!hints.length) hb.remove();
    else hb.onclick = function () {
      level = Math.min(level + 1, hints.length); el.dataset.hints = level;
      $('.hintbox', el).innerHTML = '<ol class="hints">' + hints.slice(0, level).map(function (h) { return '<li>' + md(h) + '</li>'; }).join('') + '</ol>';
      hb.textContent = level < hints.length ? 'Ещё подсказка' : 'Подсказок больше нет'; hb.disabled = level >= hints.length;
    };
    var prev = taskResult(s, t);
    if (prev && prev.given != null) { restore(t, el, prev.given); showFeedback(s, t, el, prev.ok, true); }
  }
  function given(t, el) {
    if (t.type === 'single') { var c = $('input:checked', el); return c ? +c.value : null; }
    if (t.type === 'multi') { var a = $$('input:checked', el).map(function (x) { return +x.value; }); return a.length ? a : null; }
    if (t.type === 'order') return $$('.order li', el).map(function (li) { return +li.dataset.i; });
    var v = $('input[id$="-in"]', el).value.trim(); return v ? v : null;
  }
  function restore(t, el, g) {
    if (t.type === 'single') { var r = $('input[value="' + g + '"]', el); if (r) r.checked = true; }
    else if (t.type === 'multi') g.forEach(function (i) { var r = $('input[value="' + i + '"]', el); if (r) r.checked = true; });
    else if (t.type === 'order') { var ol = $('.order', el); g.forEach(function (i) { var li = $('li[data-i="' + i + '"]', ol); if (li) ol.appendChild(li); }); }
    else $('input[id$="-in"]', el).value = g;
  }
  function norm(x) { return String(x).toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim(); }
  function isRight(t, g) {
    if (t.type === 'single') return g === t.answer;
    if (t.type === 'multi') return g.slice().sort().join() === t.answer.slice().sort().join();
    if (t.type === 'order') return g.every(function (x, i) { return x === i; });
    if (t.type === 'blank') return [].concat(t.answer).some(function (a) { return norm(a) === norm(g); });
    if (t.type === 'calc') { var n = parseFloat(String(g).replace(',', '.').replace(/\s/g, '')); if (!isFinite(n)) return false; var tol = t.tol != null ? t.tol : 0.02; return Math.abs(n - t.answer) <= Math.abs(t.answer) * tol + 1e-9; }
  }
  function answerText(t) {
    if (t.type === 'single') return plain(t.options[t.answer]);
    if (t.type === 'multi') return t.answer.map(function (i) { return plain(t.options[i]); }).join('; ');
    if (t.type === 'order') return t.items.map(function (x, i) { return (i + 1) + ') ' + plain(x); }).join('  ');
    if (t.type === 'blank') return [].concat(t.answer)[0];
    return String(t.answer).replace('.', ',') + (t.unit ? ' ' + plain(t.unit) : '');
  }
  function checkTask(s, t, el) {
    var g = given(t, el);
    if (g == null) { $('.val', el).textContent = t.type === 'blank' || t.type === 'calc' ? 'Сначала впишите ответ.' : 'Сначала выберите ответ.'; return; }
    $('.val', el).textContent = '';
    var ok = isRight(t, g), key = s.id + '/' + t.id, prev = S.answers[key];
    S.answers[key] = { ok: ok, first: prev ? prev.first : ok, given: g, n: (prev ? prev.n : 0) + 1, hints: +(el.dataset.hints || 0), at: Date.now() };
    save(); showFeedback(s, t, el, ok, false); updateScore(s); checkDone(s);
  }
  function showFeedback(s, t, el, ok, quiet) {
    var claim = (s.claims || []).filter(function (c) { return c.id === t.claim; })[0];
    $('.fbbox', el).innerHTML = '<div class="fb ' + (ok ? 'ok' : 'no') + '"><b class="v">' + (ok ? 'Верно.' : 'Не совсем.') + '</b><p class="ans">Верный ответ: <b>' + esc(answerText(t)) + '</b></p><p class="why">' + md(t.explain) + '</p>' + (claim ? '<p class="why"><button type="button" class="linklike goclaim" data-c="' + esc(claim.id) + '">Где это в тексте шага</button> — утверждение ' + esc(claim.id) + ', с. ' + esc(claim.page) + '</p>' : '') + '</div>';
    var gc = $('.goclaim', el); if (gc) gc.onclick = function () { gotoClaim(gc.dataset.c); };
    // разметка вариантов
    if (t.type === 'single' || t.type === 'multi') {
      var right = [].concat(t.answer);
      $$('.opt', el).forEach(function (o) { var i = +$('input', o).value, sel = $('input', o).checked; o.classList.toggle('is-right', right.indexOf(i) >= 0); o.classList.toggle('is-wrong', sel && right.indexOf(i) < 0); });
    }
    if (t.type === 'order') $$('.order li', el).forEach(function (li, pos) { li.classList.toggle('is-right', +li.dataset.i === pos); li.classList.toggle('is-wrong', +li.dataset.i !== pos); });
    $('.check', el).textContent = 'Проверить ещё раз';
    if (!quiet) { var f = $('.fb', el); f.setAttribute('tabindex', '-1'); }
  }
  function updateScore(s) {
    var el = $('#score'); if (!el) return;
    var n = (s.tasks || []).length, done = (s.tasks || []).filter(function (t) { return taskResult(s, t); }), first = done.filter(function (t) { return taskResult(s, t).first; }).length;
    el.textContent = done.length ? 'Решено ' + done.length + ' из ' + n + ', с первой попытки ' + first + '. Ответ на каждое задание есть в тексте этого шага.' : 'Ответ на каждое задание есть в тексте этого шага. Проверка сразу, после неё виден верный ответ.';
  }
  // перетаскивание: Pointer Events работают и мышью, и пальцем
  function bindOrder(el) {
    var ol = $('.order', el);
    $$('[data-mv]', ol).forEach(function (b) {
      b.onclick = function () {
        var li = b.closest('li'), d = +b.dataset.mv;
        if (d < 0 && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
        if (d > 0 && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        b.focus(); clearMarks();
      };
    });
    function clearMarks() { $$('li', ol).forEach(function (x) { x.classList.remove('is-right', 'is-wrong'); }); }
    var drag = null;
    ol.addEventListener('pointerdown', function (e) {
      var li = e.target.closest('li'); if (!li || e.target.closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // пальцем тянем за «ручку», чтобы список не мешал прокрутке страницы
      if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
      e.preventDefault();
      drag = { li: li, y0: e.clientY, id: e.pointerId };
      li.classList.add('dragging'); li.setPointerCapture(e.pointerId); clearMarks();
    });
    ol.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var li = drag.li;
      // переставляем, пока центр перетаскиваемого пункта не окажется между соседями (быстрый жест — сразу на несколько позиций)
      for (var guard = 0; guard < 50; guard++) {
        li.style.transform = 'translateY(' + (e.clientY - drag.y0) + 'px)';
        var r = li.getBoundingClientRect(), center = r.top + r.height / 2;
        var prev = li.previousElementSibling, next = li.nextElementSibling, before = li.offsetTop, moved = false;
        if (prev) { var pr = prev.getBoundingClientRect(); if (center < pr.top + pr.height / 2) { ol.insertBefore(li, prev); moved = true; } }
        if (!moved && next) { var nr = next.getBoundingClientRect(); if (center > nr.top + nr.height / 2) { ol.insertBefore(next, li); moved = true; } }
        if (!moved) break;
        drag.y0 += li.offsetTop - before;
      }
    });
    function end(e) { if (!drag || e.pointerId !== drag.id) return; drag.li.style.transform = ''; drag.li.classList.remove('dragging'); drag = null; }
    ol.addEventListener('pointerup', end); ol.addEventListener('pointercancel', end);
  }

  // ---------- Карта связей (дуговая диаграмма: работает и на телефоне) ----------
  function viewMap() {
    setNav('map');
    var narrow = window.innerWidth <= 520, RH = narrow ? 64 : 52, W = narrow ? 84 : Math.min(180, 40 + steps.length * 9), idx = {};
    steps.forEach(function (s, i) { idx[s.id] = i; });
    var css = getComputedStyle(document.documentElement);
    var col = { base: css.getPropertyValue('--ink').trim(), example: css.getPropertyValue('--accent').trim(), data: css.getPropertyValue('--mark').trim() };
    var dash = { base: '', example: '6 4', data: '2 4' };
    var paths = C.edges.map(function (e, k) {
      var a = idx[e.from], b = idx[e.to]; if (a == null || b == null) return '';
      var y1 = a * RH + RH / 2, y2 = b * RH + RH / 2, r = Math.abs(y2 - y1) / 2, x = W - 6, bulge = Math.min(W - 12, 10 + r * 0.55);
      return '<path class="e" data-from="' + e.from + '" data-to="' + e.to + '" d="M' + x + ' ' + y1 + ' C ' + (x - bulge) + ' ' + y1 + ', ' + (x - bulge) + ' ' + y2 + ', ' + x + ' ' + y2 + '" stroke="' + col[e.type || 'base'] + '" stroke-dasharray="' + dash[e.type || 'base'] + '"><title>' + esc(byId[e.from].title + ' → ' + byId[e.to].title + ' (' + (EDGE[e.type] || e.type) + ')') + '</title></path>';
    }).join('');
    var dots = steps.map(function (s, i) { return '<circle cx="' + (W - 6) + '" cy="' + (i * RH + RH / 2) + '" r="4" fill="var(--ink)"/>'; }).join('');
    var lastPart = null;
    var rows = steps.map(function (s) { var p = partById[s.part], first = p !== lastPart; lastPart = p; return '<li data-id="' + s.id + '"' + (first ? ' class="part-start"' : '') + '><span class="n">' + s.n + '</span><a href="#/step/' + s.id + '">' + esc(s.title) + '</a><span class="pt">' + esc(p.short || '') + '</span></li>'; }).join('');
    var key = Object.keys(dash).map(function (k) { return '<span><svg width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke="' + col[k] + '" stroke-width="2" stroke-dasharray="' + dash[k] + '"/></svg>' + EDGE[k] + '</span>'; }).join('');
    var list = steps.map(function (s) { var ins = C.edges.filter(function (e) { return e.to === s.id; }); return '<li>' + stepLink(s) + (ins.length ? ' — опирается на: ' + ins.map(function (e) { return 'шаг ' + byId[e.from].n + ' (' + EDGE[e.type] + ')'; }).join(', ') : ' — начало пути') + '</li>'; }).join('');
    $('#main').innerHTML = '<div class="page-wide"><p class="kicker">Карта связей</p><h1>Какой шаг на какой опирается</h1><p class="intro">Шаги стоят в порядке пути. Дуга слева соединяет шаг с тем, на который он опирается. Наведите курсор или выберите шаг клавишей Tab, чтобы подсветить его связи.</p><div class="edge-key">' + key + '</div>' +
      '<div class="arc-wrap"><div class="arc" id="arc"><svg width="' + W + '" height="' + steps.length * RH + '" aria-hidden="true">' + paths + dots + '</svg><ol>' + rows + '</ol></div></div>' +
      '<h2>То же списком</h2><ol class="ui" style="font-size:17px">' + list + '</ol></div>';
    var arc = $('#arc');
    function hi(id) {
      arc.classList.toggle('dim', !!id);
      $$('path.e', arc).forEach(function (p) { p.classList.toggle('hi', !!id && (p.dataset.from === id || p.dataset.to === id)); });
      $$('li', arc).forEach(function (li) { var rel = id && (li.dataset.id === id || C.edges.some(function (e) { return (e.from === id && e.to === li.dataset.id) || (e.to === id && e.from === li.dataset.id); })); li.classList.toggle('hi', !!rel); });
    }
    $$('li', arc).forEach(function (li) { li.onmouseenter = function () { hi(li.dataset.id); }; li.onmouseleave = function () { hi(null); }; var a = $('a', li); a.onfocus = function () { hi(li.dataset.id); }; a.onblur = function () { hi(null); }; });
  }

  // ---------- Карточки ----------
  var cardFilter = 'all', cardIdx = 0, flipped = false;
  function viewCards() {
    setNav('cards');
    var all = steps.filter(function (s) { return s.card; });
    var list = all.filter(function (s) { var m = S.cards[s.id]; return cardFilter === 'all' || (cardFilter === 'new' ? !m : m === cardFilter); });
    if (cardIdx >= list.length) cardIdx = 0;
    var cnt = function (f) { return all.filter(function (s) { var m = S.cards[s.id]; return f === 'all' || (f === 'new' ? !m : m === f); }).length; };
    var s = list[cardIdx];
    var h = '<div class="page"><p class="kicker">Повторение</p><h1>Карточки по всем шагам</h1><p>Сначала вспомните ответ, потом переверните карточку. Отметка «знаю» или «повторить» сохраняется в браузере.</p>' +
      '<div class="cards-top"><div class="seg" role="group" aria-label="Какие карточки показывать">' + [['all', 'Все'], ['new', 'Новые'], ['repeat', 'Повторить'], ['know', 'Знаю']].map(function (f) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (cardFilter === f[0]) + '">' + f[1] + ' · ' + cnt(f[0]) + '</button>'; }).join('') + '</div></div>';
    if (!s) h += '<p>В этой стопке пока пусто. <button class="linklike" data-f="all">Показать все карточки</button></p>';
    else h += '<button type="button" class="card' + (flipped ? ' back' : '') + '" id="card" aria-live="polite"><span class="side"><span>' + (flipped ? 'Ответ' : 'Вопрос') + ' · шаг ' + s.n + '</span><span>' + (cardIdx + 1) + ' / ' + list.length + '</span></span><span class="face" style="display:block">' + md(flipped ? s.card.back : s.card.front) + '</span><span class="hint">' + (flipped ? 'Шаг: ' + esc(s.title) + ' · ' + pages(s.pages) : 'Нажмите, чтобы перевернуть (или пробел)') + '</span></button>' +
      '<div class="card-acts"><button type="button" class="btn line small" data-go="-1">← Предыдущая</button><span class="pair"><button type="button" class="btn again" data-mark="repeat">Повторить</button><button type="button" class="btn know" data-mark="know">Знаю</button></span><button type="button" class="btn line small" data-go="1">Следующая →</button></div>' +
      '<p class="ui muted" style="margin-top:14px">' + (S.cards[s.id] ? 'Сейчас отмечено: ' + (S.cards[s.id] === 'know' ? 'знаю' : 'повторить') + '. ' : '') + '<a href="#/step/' + s.id + '">Открыть шаг</a></p>';
    h += '</div>';
    $('#main').innerHTML = h;
    $$('[data-f]').forEach(function (b) { b.onclick = function () { cardFilter = b.dataset.f; cardIdx = 0; flipped = false; viewCards(); }; });
    var card = $('#card');
    if (card) {
      card.onclick = function () { flipped = !flipped; viewCards(); $('#card').focus(); };
      $$('[data-go]').forEach(function (b) { b.onclick = function () { cardIdx = (cardIdx + (+b.dataset.go) + list.length) % list.length; flipped = false; viewCards(); }; });
      $$('[data-mark]').forEach(function (b) { b.onclick = function () { S.cards[s.id] = b.dataset.mark; save(); flipped = false; if (cardFilter === 'all') cardIdx = (cardIdx + 1) % list.length; viewCards(); toast(b.dataset.mark === 'know' ? 'Отмечено: знаю' : 'Отмечено: повторить'); }; });
    }
  }

  // ---------- Конспект ----------
  function viewNotes() {
    setNav('notes');
    var h = '<div class="page"><p class="kicker">Конспект главы</p><h1>' + esc(C.title) + '</h1><p class="book-line">' + esc(C.book.author) + '. ' + esc(C.book.title) + '. ' + esc(C.book.chapterTitle) + ', с. ' + esc(C.book.pages) + '.</p><p class="no-print"><button type="button" class="btn" id="print">Печать или сохранить в PDF</button></p>';
    C.parts.forEach(function (p) {
      h += '<h2>' + esc(p.title) + '</h2>';
      p.steps.forEach(function (id) {
        var s = byId[id], n = s.notes || {};
        var gist = n.gist || (s.essence || []).join(' ');
        var data = n.data || (s.data && s.data.output ? plain(typeof s.data.output[0] === 'string' ? s.data.output[0] : s.data.output[0].text) : '');
        h += '<div class="notes-step"><h3>' + s.n + '. ' + esc(s.title) + ' <small>' + pages(s.pages) + '</small></h3><p>' + md(gist) + '</p>' + (s.numbers && s.numbers.length ? '<p class="ui">Главные числа: ' + s.numbers.slice(0, 4).map(function (x) { return plain(x.name) + ' — ' + plain(x.value); }).join('; ') + '.</p>' : '') + (data ? '<div class="data"><b>Вывод для данных</b>' + md(data) + '</div>' : '') + '</div>';
      });
    });
    h += '</div>';
    $('#main').innerHTML = h;
    $('#print').onclick = function () { window.print(); };
  }

  // ---------- Источник, опечатки, легенда, проверки сборки ----------
  function viewSource() {
    setNav('source');
    var L = C.legend, theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    var sw = function (grp) { return '<div class="swatches">' + Object.keys(L[grp]).map(function (k) { return '<span><i style="background:' + L[grp][k][theme] + '"></i>' + esc(L[grp][k].label) + '</span>'; }).join('') + '</div>'; };
    var rep = C.report || { checks: [] };
    var h = '<div class="page-wide"><p class="kicker">Источник и сборка</p><h1>Откуда текст и как его проверить</h1>' +
      '<h2>Книга</h2><p>' + esc(C.book.author) + '. <i>' + esc(C.book.title) + '</i>. ' + esc(C.book.publisher || '') + ', ' + esc(C.book.year) + '. ' + esc(C.book.chapter) + ': «' + esc(C.book.chapterTitle) + '», с. ' + esc(C.book.pages) + '. Номера страниц везде — по PDF.</p>' +
      '<h2>Как читать курс</h2><ul><li>Обычный текст шагов — пересказ главы моделью, у каждого абзаца стоит страница.</li><li>Слова автора даны дословно, в кавычках и курсивом, со страницей.</li><li>Блоки «Что это значит для данных» и «Аналогия» пишет модель; выводы, которых нет в книге, помечены «гипотеза модели».</li><li>Рисунки помечены классом кадра: ' + Object.keys(L.frameClasses).map(function (k) { return esc(L.frameClasses[k].label) + ' — ' + esc(L.frameClasses[k].note); }).join('; ') + '.</li></ul>';
    if (C.errata && C.errata.length) h += '<h2>Лист опечаток</h2><p>Расхождения, найденные при сверке текста с PDF. В таблицах исправленные ячейки помечены «испр.».</p><div class="tscroll"><table class="errata"><thead><tr><th>с.</th><th>Где</th><th>В источнике</th><th>В курсе</th><th>Почему</th></tr></thead><tbody>' + C.errata.map(function (e) { return '<tr><td class="num">' + esc(e.page) + '</td><td>' + md(e.where) + '</td><td>' + md(e.was) + '</td><td>' + md(e.now) + '</td><td>' + md(e.why) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<h2>Легенда цветов</h2><p>' + esc(L.note || '') + '</p><h3>Флюиды</h3>' + sw('fluids') + '<h3>Породы</h3>' + sw('rocks') + '<h3>Кривые ГИС</h3>' + sw('curves');
    h += '<h2>Проверки сборки</h2><p>Конвейер проверил учебный слой перед сборкой курса' + (rep.built ? ' (' + esc(rep.built.replace('T', ' ').slice(0, 16)) + ')' : '') + '.</p><ul class="checks">' + rep.checks.map(function (c) { return '<li class="' + (c.ok ? 'ok' : 'warn') + '">' + (c.ok ? '✓ ' : '! ') + esc(c.msg) + '</li>'; }).join('') + '</ul>' + (rep.warnings && rep.warnings.length ? '<details><summary class="ui">Замечания (' + rep.warnings.length + ')</summary><ul class="ui">' + rep.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></details>' : '');
    h += '<h2>Ваш прогресс</h2><p class="ui">Прогресс, ответы и отметки карточек хранятся только в этом браузере.</p><p><button type="button" class="btn line small" id="reset">Сбросить прогресс этой главы</button></p></div>';
    $('#main').innerHTML = h;
    $('#reset').onclick = function () { if (confirm('Сбросить прогресс, ответы и карточки этой главы?')) { S = { visited: {}, done: {}, answers: {}, cards: {}, last: null }; save(); updateProgress(); toast('Прогресс сброшен'); } };
  }

  // ---------- маршрутизация ----------
  function route() {
    closeTip();
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var v = parts[0] || '';
    if (v === 'step') viewStep(decodeURIComponent(parts[1] || ''), parts[2] || null);
    else {
      tracking = null; lastBlock = null;
      if (v === 'map') viewMap(); else if (v === 'cards') viewCards(); else if (v === 'notes') viewNotes(); else if (v === 'source') viewSource(); else viewHome();
      document.title = ({ map: 'Карта связей', cards: 'Карточки', notes: 'Конспект', source: 'Источник' }[v] || 'Путь') + ' · ' + C.title;
      window.scrollTo(0, 0);
    }
    if (v !== 'step') $('#main').focus({ preventScroll: true });
    updateProgress();
  }
  window.addEventListener('hashchange', route);
  route();
})();
