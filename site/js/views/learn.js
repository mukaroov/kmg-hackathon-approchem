/* STRATA · учебные страницы: загрузка книги, курс (маршрут, карта связей, карточки, конспект, покрытие), шаг. */
(() => {
  'use strict';
  const {esc, icon, P, $, $$} = U;
  const V = window.Views = window.Views || {};
  const pg = (n, c) => n ? '<button type="button" class="pg" data-page="' + esc(n) + '" aria-label="Открыть источник: страница ' + esc(n) + '">' + (c?.pseudoPages ? 'усл. стр. ' : 'стр. ') + esc(n) + '</button>' : '';

  /* ---------- Загрузка книги ---------- */
  let up = null; // {file, text, scan}
  V.upload = host => {
    const mine = Catalog.list().filter(c => c.source === 'upload');
    host.innerHTML = '<div class="wrap" style="max-width:1100px"><div class="page-head"><div><h1>Загрузить книгу</h1><p>Сайт соберёт курс по главе: шаги со «стр. N» у каждого абзаца, задания с проверкой, карточки, карту связей и таблицу покрытия. Сборка идёт прямо в браузере, файл никуда не отправляется.</p></div></div>' +
      '<div class="wizard" id="wz"><span class="on">1 · Файл</span><span>2 · Границы главы</span><span>3 · Сборка</span><span>4 · Курс готов</span></div>' +
      '<div id="up-step"></div>' +
      (mine.length ? '<section class="sec"><div class="sec-head"><h2>Ваши книги</h2></div><div class="grid g2">' + mine.map(c => '<div class="card pad" style="display:grid;gap:10px"><div><span class="muted" style="font-size:14px">' + esc(c.fileName || c.book) + ' · стр. ' + esc(c.pages) + '</span><h3 style="font-size:18px;margin-top:4px">' + esc(c.title) + '</h3></div><div class="meta"><span>' + P.step(c.steps.length) + '</span><span>' + P.task(c.tasks.length) + '</span><span>покрытие ' + (c.coverage ? Math.round(100 * c.coverage.covered / Math.max(1, c.coverage.units)) : '—') + ' %</span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary small" href="#/course/' + esc(c.id) + '">Открыть</a><button class="btn ghost small" data-rebuild="' + esc(c.id) + '">Пересобрать</button><button class="btn ghost small" data-del="' + esc(c.id) + '" style="color:var(--red)">' + icon('trash', 16) + ' Удалить</button></div></div>').join('') + '</div></section>' : '') + '</div>';
    stepFile();
    window.Pipeline?.mount(host);
    $$('[data-del]', host).forEach(b => b.onclick = async () => { if (!confirm('Удалить курс и сохранённый текст книги из этого браузера?')) return; await Catalog.remove(b.dataset.del); U.toast('Курс удалён'); V.upload(host); });
    $$('[data-rebuild]', host).forEach(b => b.onclick = async () => {
      const book = await Store.DB.get('books', b.dataset.rebuild); if (!book) { U.toast('Исходный текст не сохранён'); return; }
      const old = Catalog.get(b.dataset.rebuild);
      const c = Engine.build(book.text, {...book.options, title: old.title, author: old.author, book: old.book, fileName: book.fileName});
      c.id = old.id; c.createdAt = old.createdAt; await Catalog.saveUser(c, book); U.toast('Курс пересобран: ' + P.step(c.steps.length) + ', ' + P.task(c.tasks.length)); V.upload(host);
    });
  };
  function wz(n) { $$('#wz span').forEach((s, i) => { s.className = i < n ? 'done' : i === n ? 'on' : ''; }); }
  function stepFile() {
    wz(0);
    const box = $('#up-step');
    box.innerHTML = '<label class="drop" id="drop"><span class="di">' + icon('upload', 30) + '</span><h2>Перетащите файл книги сюда</h2><p class="muted">или нажмите, чтобы выбрать. Markdown с метками <code>&lt;!-- page N --&gt;</code> даёт точные номера страниц; обычный .txt тоже подойдёт.</p>' +
      '<span class="btn primary">' + icon('file') + ' Выбрать файл</span><input type="file" id="file" accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf" class="sr"></label>' +
      '<div class="note info" style="margin-top:14px">PDF и сборку языковой моделью выполняет сервер. Когда он включён в настройках, PDF отправится туда; без сервера используйте .md или .txt.</div>';
    const drop = $('#drop'), inp = $('#file');
    inp.onchange = () => inp.files[0] && read(inp.files[0]);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) read(f); });
  }
  async function read(file) {
    if (/\.pdf$/i.test(file.name)) {
      if (!Api.enabled()) { U.toast('PDF обрабатывает сервер. Включите его в настройках или загрузите .md / .txt.'); return; }
      return serverBuild(file);
    }
    if (file.size > 12e6) { U.toast('Файл больше 12 МБ. Загрузите главу, а не всю книгу.'); return; }
    const text = await file.text();
    up = {file, text, scan: Engine.scan(text)};
    stepRange();
  }
  async function serverBuild(file) {
    wz(2); const box = $('#up-step');
    box.innerHTML = '<div class="card pad"><h2 style="font-size:20px">Сервер собирает курс…</h2><p class="muted" id="stage" style="margin-top:8px">Отправка файла</p></div>';
    try {
      const c = await Api.runPipeline(file, {}, st => { $('#stage').textContent = 'Этап: ' + st; });
      c.source = 'upload'; c.createdAt ||= new Date().toISOString();
      await Catalog.saveUser(c); Store.state.achievements.uploadDone ||= new Date().toISOString(); XP.checkAchievements(); Store.save();
      location.hash = '#/course/' + c.id;
    } catch (err) { box.innerHTML = '<div class="note">Сервер не собрал курс: ' + esc(err.message) + '</div>'; }
  }
  function stepRange() {
    wz(1);
    const sc = up.scan, box = $('#up-step');
    const guess = up.file.name.replace(/\.(md|markdown|txt)$/i, '').replace(/[_]+/g, ' ').replace(/\(\d+\)$/, '').trim();
    const heads = r => sc.headings.filter(h => { const u = sc.units[h.i]; return u.page >= r[0] && u.page <= r[1]; });
    box.innerHTML = '<div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:18px" id="rg">' +
      '<form class="card pad form" id="rf"><h2 style="font-size:20px">Где глава в книге</h2>' +
      (sc.markers ? '<div class="note ok">Найдены метки страниц: ' + sc.pageMin + '–' + sc.pageMax + ' (' + P.page(sc.pageMax - sc.pageMin + 1) + '). Ссылки «стр. N» будут точными.</div>' : '<div class="note">Меток страниц нет: ссылки будут на условные страницы по ' + 3000 + ' знаков. Для точных страниц загрузите markdown с метками <code>&lt;!-- page N --&gt;</code>.</div>') +
      '<div class="row2"><label class="field">Название курса<input name="title" required value="' + esc(guess.slice(0, 80)) + '"></label><label class="field">Автор<input name="author" placeholder="Фамилия И. О."></label></div>' +
      '<div class="row2"><label class="field">Со страницы<input name="from" type="number" min="' + sc.pageMin + '" max="' + sc.pageMax + '" value="' + sc.pageMin + '"></label><label class="field">По страницу<input name="to" type="number" min="' + sc.pageMin + '" max="' + sc.pageMax + '" value="' + sc.pageMax + '"></label></div>' +
      '<label class="field">Начать с заголовка<select name="start"></select><small>Первая и последняя страница главы часто содержат конец предыдущего и начало следующего раздела. Укажите заголовок, с которого глава начинается.</small></label>' +
      '<label class="field">Закончить перед заголовком<select name="end"></select></label>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary">' + icon('spark') + ' Собрать курс</button><button type="button" class="btn ghost" id="again">Другой файл</button></div></form>' +
      '<div class="card pad" id="pv"></div></div>';
    const f = $('#rf');
    const fill = () => {
      const r = [Number(f.from.value) || sc.pageMin, Number(f.to.value) || sc.pageMax], hs = heads(r);
      const opt = (h, sel) => '<option value="' + esc(sc.units[h.i].id) + '"' + (sel ? ' selected' : '') + '>стр. ' + sc.units[h.i].page + ' · ' + esc(h.title.slice(0, 80)) + '</option>';
      const keepS = f.start.value, keepE = f.end.value;
      f.start.innerHTML = '<option value="">С начала диапазона</option>' + hs.map(h => opt(h, sc.units[h.i].id === keepS)).join('');
      f.end.innerHTML = '<option value="">До конца диапазона</option>' + hs.map(h => opt(h, sc.units[h.i].id === keepE)).join('');
      const units = sc.units.filter(u => u.page >= r[0] && u.page <= r[1]);
      const k = units.reduce((m, u) => (m[u.kind] = (m[u.kind] || 0) + 1, m), {});
      const words = units.filter(u => u.kind !== 'figure_model').reduce((n, u) => n + u.text.split(/\s+/).length, 0), sus = units.filter(u => u.ocrSuspect).length;
      $('#pv').innerHTML = '<h2 style="font-size:20px">Что внутри диапазона</h2><div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px">' +
        [[words.toLocaleString('ru'), 'слов'], [k.paragraph || 0, 'абзацев'], [hs.length, 'заголовков'], [(k.worked_example || 0) + ' / ' + (k.task || 0), 'примеров / задач'], [k.table || 0, 'таблиц'], [(k.figure || 0) + ' / ' + (k.figure_model || 0), 'подписей рисунков / описаний моделью']].map(x => '<div class="card kpi"><b>' + x[0] + '</b><small>' + x[1] + '</small></div>').join('') + '</div>' +
        (sus ? '<div class="note" style="margin-top:12px">' + sus + ' фрагм. похожи на сбой распознавания (кириллица прочитана латиницей). Они попадут в курс с пометкой и в таблицу покрытия.</div>' : '') +
        (words > 40000 ? '<div class="note" style="margin-top:12px">Диапазон большой. Курс по главе удобнее: сузьте страницы.</div>' : '');
    };
    f.from.oninput = f.to.oninput = fill; fill();
    $('#again').onclick = stepFile;
    f.onsubmit = e => {
      e.preventDefault(); wz(2);
      const opts = {title: f.title.value.trim(), author: f.author.value.trim(), book: up.file.name, fileName: up.file.name, pageFrom: Number(f.from.value), pageTo: Number(f.to.value), startHeading: f.start.value, endHeading: f.end.value};
      $('#up-step').innerHTML = '<div class="card pad"><h2 style="font-size:20px">Собираю курс…</h2><div class="bar" style="margin-top:12px"><i style="width:60%"></i></div></div>';
      setTimeout(() => {
        try {
          const c = Engine.build(up.text, opts);
          if (!c.steps.length) throw new Error('В выбранном диапазоне нет текста.');
          stepDone(c, {id: c.id, fileName: up.file.name, text: up.text, options: opts});
        } catch (err) { $('#up-step').innerHTML = '<div class="note">Не удалось собрать курс: ' + esc(err.message) + '</div>'; }
      }, 30);
    };
  }
  function stepDone(c, book) {
    wz(3);
    const types = c.tasks.reduce((m, t) => (m[t.type] = (m[t.type] || 0) + 1, m), {});
    const cov = c.coverage, pct = Math.round(100 * cov.covered / Math.max(1, cov.units));
    const typeCount = Object.keys(types).length;
    $('#up-step').innerHTML = '<div class="card pad" style="display:grid;gap:16px"><div><span class="overline">Курс собран</span><h2 style="font-size:24px;margin-top:4px">' + esc(c.title) + '</h2><p class="muted">Движок: ' + esc(c.generatedBy) + ' · стр. ' + esc(c.pages) + '</p></div>' +
      '<div class="kpis">' + [[c.parts.length + ' / ' + c.steps.length, 'частей / шагов'], [c.tasks.length, 'заданий, типов: ' + typeCount], [c.cards.length, 'карточек'], [pct + ' %', 'покрытие единиц главы']].map(x => '<div class="card kpi"><b>' + x[0] + '</b><small>' + x[1] + '</small></div>').join('') + '</div>' +
      '<div class="meta">' + Object.entries(types).map(([t, n]) => '<span class="chip">' + esc(Tasks.typeName[t]) + ': ' + n + '</span>').join('') + '</div>' +
      (c.tasks.length < 15 ? '<div class="note">Заданий меньше 15 (норма организаторов на главу). Расширьте диапазон или подключите серверную сборку моделью.</div>' : '') +
      (typeCount < 4 ? '<div class="note">Типов заданий меньше четырёх: в тексте мало терминов и перечней.</div>' : '') +
      '<div class="note info">Встроенный движок собирает курс только из текста автора. Блоки «Частая ошибка», «Что это значит для данных», «Аналогия» и расчётные задания заполняет модель на сервере. Без сервера эти блоки скрыты, а не выдуманы.</div>' +
      '<details><summary style="cursor:pointer;font-weight:700">Таблица покрытия: ' + cov.covered + ' из ' + cov.units + ' единиц</summary>' + coverageTable(c, true) + '</details>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="save">' + icon('check') + ' Сохранить и открыть курс</button><button class="btn ghost" id="back">Изменить границы</button></div></div>';
    $('#back').onclick = stepRange;
    $('#save').onclick = async () => {
      await Catalog.saveUser(c, book);
      Store.state.achievements.uploadDone ||= new Date().toISOString(); XP.checkAchievements(); Store.save();
      location.hash = '#/course/' + c.id;
    };
  }
  function coverageTable(c, compact) {
    const rows = c.coverage?.rows || [];
    const kindRu = {paragraph: 'абзац', heading: 'заголовок', table: 'таблица', formula: 'формула', figure: 'рисунок', worked_example: 'пример', task: 'задача'};
    const stepTitle = id => c.steps.find(s => s.id === id)?.title || id;
    return '<div class="tbl-wrap tall" tabindex="0" style="margin-top:10px"><table><thead><tr><th>Единица</th><th>Тип</th><th>Стр.</th><th>Начало</th><th>Шаг или причина</th></tr></thead><tbody>' +
      rows.slice(0, compact ? 400 : 5000).map(r => '<tr><td>' + esc(r.unit_id) + '</td><td>' + esc(kindRu[r.kind] || r.kind) + '</td><td>' + esc(r.page_pdf) + '</td><td>' + esc(r.excerpt) + (r.ocrSuspect ? ' <span class="chip orange">сбой OCR?</span>' : '') + '</td><td>' + (r.node_ids.length ? esc(stepTitle(r.node_ids[0])) : '<span class="muted">' + esc(r.reason) + '</span>') + '</td></tr>').join('') + '</tbody></table></div>';
  }

  /* ---------- Курс ---------- */
  V.course = (host, parts) => {
    const c = Catalog.get(parts[1]); if (!c) { host.innerHTML = '<div class="wrap"><div class="empty" style="margin-top:30px">Курс не найден. <a class="link" href="#/courses">Все курсы</a></div></div>'; return; }
    const tab = parts[2] || 'route', pr = Catalog.progress(c), next = Catalog.resumeStep(c);
    const tabs = [['route', 'Маршрут', 'map'], ['graph', 'Карта связей', 'layers'], ['cards', 'Карточки', 'cards'], ['notes', 'Конспект', 'print'], ...(c.coverage ? [['coverage', 'Покрытие', 'list']] : []), ['about', 'Об источнике', 'book']];
    host.innerHTML = '<div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#/courses">Курсы</a>' + icon('arrow', 14) + '<span>' + esc(c.title) + '</span></nav>' +
      '<div class="course-hero" style="margin-top:14px"><div class="card ch-main"><span class="overline">' + esc(c.domain) + (c.types.length ? ' · типы ' + esc(c.types.join(', ')) : '') + '</span><h1>' + esc(c.title) + '</h1><p class="muted">' + esc(c.subtitle || '') + '</p>' +
      '<div class="meta"><span>' + icon('book', 16) + esc(c.book) + (c.pages ? ', стр. ' + esc(c.pages) : '') + '</span><span>' + icon('layers', 16) + P.step(c.steps.length) + '</span><span>' + icon('list', 16) + P.task(c.tasks.length) + '</span><span>' + icon('clock', 16) + Catalog.minutes(c) + ' мин</span></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px"><a class="btn primary" href="#/step/' + esc(c.id) + '/' + esc(next.id) + '">' + (pr.done ? 'Продолжить: ' : 'Начать: ') + esc(next.title.slice(0, 40)) + ' ' + icon('arrow') + '</a><button class="btn ghost" data-print>' + icon('print') + ' Конспект в PDF</button></div></div>' +
      '<div class="card pad"><span class="overline">Прогресс</span><div class="big-num" style="margin-top:8px">' + pr.pct + '<small>%</small></div><div class="bar" style="margin:12px 0"><i style="width:' + pr.pct + '%"></i></div><p class="muted">Пройдено ' + pr.done + ' из ' + P.step(pr.total) + '. Шаг засчитывается, когда решены все его задания.</p></div></div>' +
      '<nav class="tabs" aria-label="Разделы курса">' + tabs.map(([k, l, i]) => '<a href="#/course/' + esc(c.id) + '/' + k + '" class="' + (k === tab ? 'on' : '') + '"' + (k === tab ? ' aria-current="page"' : '') + '>' + icon(i, 16) + l + '</a>').join('') + '</nav><div id="ctab"></div></div>';
    $('[data-print]', host).onclick = () => printNotes(c);
    const box = $('#ctab');
    if (tab === 'route') box.innerHTML = c.parts.map(p => '<section class="part"><h2>' + esc(p.title) + ' <small>' + P.step(p.steps.length) + '</small></h2><ol class="track">' + p.steps.map(id => {
      const s = Catalog.step(c, id), done = Catalog.isDone(c, s), now = s === next && !done, k = c.steps.indexOf(s) + 1, st = Catalog.stepStats(c, s);
      return '<li><a class="card stop' + (done ? ' done' : now ? ' now' : '') + '" href="#/step/' + esc(c.id) + '/' + esc(s.id) + '"><span class="num">' + (done ? icon('check', 18) : k) + '</span><div><h3>' + esc(s.title) + '</h3><small>' + (s.bookTitle && s.bookTitle !== s.title ? esc(s.bookTitle.slice(0, 90)) + ' · ' : '') + (c.pseudoPages ? 'усл. ' : '') + 'стр. ' + esc(s.pages[0]) + (s.pages.length > 1 ? '–' + esc(s.pages.at(-1)) : '') + ' · ' + s.minutes + ' мин · ' + st.answered + '/' + st.total + ' заданий</small></div><span>' + icon('arrow') + '</span></a></li>';
    }).join('') + '</ol></section>').join('');
    if (tab === 'graph') box.innerHTML = conceptMap(c);
    if (tab === 'cards') cardsView(box, c);
    if (tab === 'notes') box.innerHTML = '<div class="card pad prose"><p class="muted">Конспект: суть каждого шага и выводы для данных со ссылками на страницы. Кнопка печатает его или сохраняет в PDF.</p><button class="btn primary" data-print2 style="margin-top:12px">' + icon('print') + ' Печать / PDF</button>' + c.steps.map(s => '<h3 style="margin-top:22px;font-size:18px">' + esc(s.title) + '</h3>' + (s.blocks.essence || []).map(p => '<p>' + U.richText(p.text) + pg(p.page, c) + '</p>').join('') + (s.blocks.data || []).map(p => '<p><b>Для данных:</b> ' + U.richText(p.text) + '</p>').join('')).join('') + '</div>';
    if (tab === 'notes') $('[data-print2]', box).onclick = () => printNotes(c);
    if (tab === 'coverage') box.innerHTML = '<div class="kpis" style="margin-bottom:14px">' + [[c.coverage.units, 'единиц главы'], [c.coverage.covered, 'вошли в шаги'], [Math.round(100 * c.coverage.covered / Math.max(1, c.coverage.units)) + ' %', 'покрытие'], [c.coverage.ocrSuspect, 'подозрений на сбой OCR']].map(x => '<div class="card kpi"><b>' + x[0] + '</b><small>' + x[1] + '</small></div>').join('') + '</div>' + coverageTable(c, false) +
      '<p class="muted" style="margin-top:10px;font-size:15px">Формат совпадает с coverage.schema.json организаторов: единица → шаг или причина. Номера страниц и колонтитулы исключены из подсчёта.</p>';
    if (tab === 'about') box.innerHTML = '<div class="card pad prose"><p><b>Книга:</b> ' + esc(c.book) + (c.author ? ', ' + esc(c.author) : '') + '</p><p><b>Страницы:</b> ' + esc(c.pages) + (c.pseudoPages ? ' (условные: в файле не было меток страниц)' : ' (по PDF)') + '</p><p><b>Как собран:</b> ' + esc(c.generatedBy) + '</p>' +
      '<p><b>Происхождение текста:</b> абзацы шагов — дословный текст автора с номером страницы. Поля, написанные моделью, помечаются «модель».</p>' + (c.source === 'builtin' ? '<p class="muted">Это демонстрационный курс из передачи фронтенда; при подключении конвейера его заменит курс, собранный из учебного слоя.</p>' : '') + '</div>';
    bindPages(host, c, null);
  };

  function conceptMap(c) {
    const N = c.steps.length, cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(N)))), W = 210, H = 64, gx = 60, gy = 56;
    const pos = c.steps.map((s, i) => { const r = Math.floor(i / cols), k = r % 2 ? cols - 1 - i % cols : i % cols; return {x: 20 + k * (W + gx), y: 20 + r * (H + gy)}; });
    const idx = Object.fromEntries(c.steps.map((s, i) => [s.id, i]));
    const width = 40 + cols * W + (cols - 1) * gx, height = 40 + Math.ceil(N / cols) * (H + gy) - gy;
    const edges = c.links.map(l => {
      const a = pos[idx[l.from]], b = pos[idx[l.to]]; if (!a || !b) return '';
      const x1 = a.x + W / 2, y1 = a.y + H / 2, x2 = b.x + W / 2, y2 = b.y + H / 2, mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - (l.note ? 40 : 0);
      return '<path class="e' + (l.note ? ' t' : '') + '" d="M' + x1 + ' ' + y1 + ' Q' + mx + ' ' + my + ' ' + x2 + ' ' + y2 + '" marker-end="url(#ah)"><title>' + esc(l.note ? 'Термин «' + l.note + '» введён раньше' : 'Предпосылка') + '</title></path>';
    }).join('');
    const nodes = c.steps.map((s, i) => { const p = pos[i], t = s.title.length > 21 ? s.title.slice(0, 20).trim() + '…' : s.title;
      return '<a href="#/step/' + esc(c.id) + '/' + esc(s.id) + '"><g class="n' + (Catalog.isDone(c, s) ? ' done' : '') + '"><rect x="' + p.x + '" y="' + p.y + '" width="' + W + '" height="' + H + '" rx="14"/><text x="' + (p.x + 14) + '" y="' + (p.y + 26) + '">' + (i + 1) + '. ' + esc(t) + '</text><text x="' + (p.x + 14) + '" y="' + (p.y + 48) + '" style="font-weight:500;fill:var(--muted)">стр. ' + esc(s.pages[0]) + ' · ' + s.minutes + ' мин</text></g></a>'; }).join('');
    const list = '<ol class="cmap-list card pad">' + c.steps.map(s => { const pre = c.links.filter(l => l.to === s.id).map(l => Catalog.step(c, l.from)?.title).filter(Boolean); return '<li style="margin-top:8px"><a class="link" href="#/step/' + esc(c.id) + '/' + esc(s.id) + '">' + esc(s.title) + '</a>' + (pre.length ? '<br><small class="muted">опирается на: ' + esc(pre.join('; ')) + '</small>' : '') + '</li>'; }).join('') + '</ol>';
    return '<p class="muted" style="margin-bottom:12px">Какой шаг на какой опирается. Сплошная линия — порядок графа, пунктир — термин, введённый в раннем шаге и используемый позже.</p>' +
      '<div class="cmap"><svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="Карта связей шагов курса"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--accent)" fill-opacity=".6"/></marker></defs>' + edges + nodes + '</svg></div>' + list;
  }

  const CS = {course: '', filter: 'all', i: 0, back: false};
  function cardsView(box, c) {
    if (CS.course !== c.id) Object.assign(CS, {course: c.id, filter: 'all', i: 0, back: false});
    const st = card => Store.state.cards[c.id + '/' + card.id] || 'new';
    const list = c.cards.filter(k => CS.filter === 'all' || st(k) === CS.filter); if (CS.i >= list.length) CS.i = 0;
    const k = list[CS.i], counts = ['new', 'review', 'known'].map(f => c.cards.filter(x => st(x) === f).length);
    box.innerHTML = '<div style="max-width:720px;margin:auto"><div class="filters" role="group" aria-label="Фильтр карточек">' + [['all', 'Все · ' + c.cards.length], ['new', 'Новые · ' + counts[0]], ['review', 'Повторить · ' + counts[1]], ['known', 'Знаю · ' + counts[2]]].map(([f, l]) => '<button type="button" data-f="' + f + '" aria-pressed="' + (CS.filter === f) + '">' + l + '</button>').join('') + '</div>' +
      (k ? '<button type="button" class="flash' + (CS.back ? ' back' : '') + '" data-flip aria-label="Перевернуть карточку"><span class="overline">' + (CS.back ? 'Ответ' : 'Вопрос') + ' · ' + (CS.i + 1) + ' / ' + list.length + '</span><strong>' + U.richText(CS.back ? k.back : k.front) + '</strong><span class="muted">' + icon('cards', 16) + ' ' + esc(Catalog.step(c, k.stepId)?.title || '') + ' · нажмите, чтобы перевернуть</span></button>' +
        '<div class="flash-ctl"><button class="btn ghost" data-mark="review">' + icon('target') + ' Повторить</button><button class="btn primary" data-mark="known">' + icon('check') + ' Знаю</button></div><div class="flash-ctl"><button class="btn ghost small" data-nav="-1">' + icon('back', 16) + ' Назад</button><button class="btn ghost small" data-nav="1">Вперёд ' + icon('arrow', 16) + '</button></div>' :
        '<div class="empty">Карточек с такой отметкой нет.</div>') + '</div>';
    $$('[data-f]', box).forEach(b => b.onclick = () => { CS.filter = b.dataset.f; CS.i = 0; CS.back = false; cardsView(box, c); });
    $('[data-flip]', box)?.addEventListener('click', () => { CS.back = !CS.back; cardsView(box, c); });
    $$('[data-mark]', box).forEach(b => b.onclick = () => { Store.state.cards[c.id + '/' + k.id] = b.dataset.mark; Store.record({type: 'card', courseId: c.id, cardId: k.id, mark: b.dataset.mark}); XP.checkAchievements(); CS.back = false; if (CS.filter === 'all' || CS.filter === b.dataset.mark) CS.i = (CS.i + 1) % Math.max(1, list.length); cardsView(box, c); });
    $$('[data-nav]', box).forEach(b => b.onclick = () => { CS.back = false; CS.i = (CS.i + Number(b.dataset.nav) + list.length) % list.length; cardsView(box, c); });
  }

  function printNotes(c) {
    let p = $('#printout'); p?.remove(); p = document.createElement('div'); p.id = 'printout';
    p.innerHTML = '<h1>' + esc(c.title) + '</h1><p>' + esc(c.book) + (c.author ? ' · ' + esc(c.author) : '') + ' · стр. ' + esc(c.pages) + '</p>' + c.steps.map((s, i) => '<h2>' + (i + 1) + '. ' + esc(s.title) + '</h2>' +
      (s.blocks.essence || []).map(x => '<p>' + U.richText(x.text) + ' <span class="pgn">(стр. ' + esc(x.page) + ')</span></p>').join('') +
      (s.blocks.data || []).map(x => '<p><b>Для данных:</b> ' + U.richText(x.text) + '</p>').join('') +
      (s.blocks.numbers || []).slice(0, 3).map(x => '<p>— ' + U.richText(x.text) + ' <span class="pgn">(стр. ' + esc(x.page) + ')</span></p>').join('')).join('');
    document.body.append(p); window.print();
  }
  addEventListener('afterprint', () => $('#printout')?.remove());

  /* Источник по номеру страницы: текст автора с этой страницы; у встроенных курсов — ещё и скан. */
  function openPage(c, step, page, quote) {
    const paras = (step ? [step] : c.steps).flatMap(s => [...(s.blocks.how || []), ...(s.blocks.essence || []), ...(s.blocks.quotes || [])].filter(p => p.page === page));
    const uniq = [...new Map(paras.map(p => [p.text, p])).values()];
    const d = document.createElement('dialog');
    d.innerHTML = '<div class="dlg-top"><b>' + (c.pseudoPages ? 'Условная страница ' : 'Страница ') + esc(page) + ' · ' + esc(c.book) + '</b><button class="icon-btn" aria-label="Закрыть">' + icon('close') + '</button></div><div class="dlg-body prose">' +
      (quote ? '<p class="ex"><b>Цитата:</b> «' + U.richText(quote) + '»</p>' : '') +
      (uniq.length ? uniq.map(p => '<p>' + U.richText(p.text) + '</p>').join('') : '<p class="muted">Текст этой страницы в шаге не приводится.</p>') +
      (step?.sourceImage && step.pages.includes(page) ? '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700">Показать скан страницы</summary><img src="' + esc(step.sourceImage) + '" alt="Скан страницы ' + esc(page) + '" style="margin-top:10px;border-radius:10px;border:1px solid var(--line)"></details>' : '') + '</div>';
    document.body.append(d); d.querySelector('button').onclick = () => d.close(); d.onclose = () => d.remove(); d.addEventListener('click', e => { if (e.target === d) d.close(); }); d.showModal();
  }
  function bindPages(host, c, step) { $$('[data-page]', host).forEach(b => { if (!b.onclick) b.onclick = () => openPage(c, step, Number(b.dataset.page)); }); }

  /* ---------- Шаг ---------- */
  let mounted = null;
  V.step = (host, parts) => {
    mounted?.destroy(); mounted = null; (Scenes.lessonBlock.players || []).forEach(p => p.destroy()); Scenes.lessonBlock.players = [];
    const c = Catalog.get(parts[1]), s = c && (Catalog.step(c, parts[2]) || Catalog.resumeStep(c));
    if (!s) { host.innerHTML = '<div class="wrap"><div class="empty" style="margin-top:30px">Шаг не найден. <a class="link" href="#/courses">Все курсы</a></div></div>'; return; }
    Store.state.last = Catalog.key(c, s); Store.save();
    const b = s.blocks, i = c.steps.indexOf(s), prev = c.steps[i - 1], next = c.steps[i + 1];
    const sec = [];
    const blk = (id, title, ic, html, cls = '') => { if (!html) return; sec.push([id, title]); return '<section class="card blk ' + cls + '" id="b-' + id + '"><h2>' + icon(ic, 20) + esc(title) + '</h2>' + html + '</section>'; };
    const paras = list => (list || []).map(p => '<p' + (p.suspect ? ' class="suspect"' : '') + '>' + U.richText(p.text) + pg(p.page, c) + '<span class="by' + (p.byModel ? ' model' : '') + '">' + (p.byModel ? 'модель' : 'автор') + '</span>' + (p.suspect ? ' <span class="chip orange">возможен сбой распознавания</span>' : '') + '</p>').join('');
    const html = [
      blk('essence', 'Суть', 'target', b.essence?.length ? '<div class="prose"><p class="lead">' + b.essence.map(p => U.richText(p.text)).join(' ') + pg(b.essence[0].page, c) + '</p></div>' : ''),
      blk('media', 'Видео', 'play', (s.media || []).map(m => m.kind === 'video'
        ? '<figure class="step-video' + (m.vertical ? ' vert' : '') + '"><video controls playsinline preload="metadata"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : '') + ' src="' + esc(m.src) + '" aria-label="' + esc(m.title) + '">' + (m.subtitles ? '<track kind="subtitles" srclang="ru" label="Русские субтитры" src="' + esc(m.subtitles) + '" default>' : '') + '</video>' +
          '<figcaption><b>' + esc(m.title) + '</b><span class="muted">' + (m.vertical ? 'Шортс 9:16' : 'Разбор 16:9') + ' · ' + Math.floor(m.duration / 60) + ':' + String(Math.round(m.duration % 60)).padStart(2, '0') + ' · ' + esc(m.source) + '</span>' +
          '<span class="step-video-links">' + (m.question ? '<a class="btn primary small" href="#/shorts/' + esc(m.id) + '">' + icon('play', 16) + ' Смотреть с вопросом</a>' : '') + (m.passport ? '<a class="btn ghost small" href="' + esc(m.passport) + '" target="_blank" rel="noopener">Паспорт ролика</a>' : '') + '</span></figcaption></figure>'
        : '<a class="btn ghost" href="' + (m.kind === 'long' ? '#/video' : '#/shorts/' + esc(m.id)) + '">' + icon(m.kind === 'long' ? 'play' : 'shorts') + ' ' + esc(m.title) + '</a>').join(' ')),
      blk('aiexp', 'Пояснение помощника', 'spark', b.aiExplanation?.text ? '<div class="prose"><p>' + U.richText(b.aiExplanation.text) + ' <span class="by model">модель · ' + (b.aiExplanation.validation === 'approved' ? 'проверено экспертом' : 'не проверено') + '</span></p></div><p class="muted" style="font-size:14px;margin-top:6px">Текст написан локальной моделью по тексту шага. Опирайтесь на текст автора ниже; страницы указаны у каждого абзаца.</p>' : ''),
      blk('anim', 'Анимация', 'play', Api.enabled() || (window.SCENES || []).some(x => x.lesson_id === s.id) ? '<div id="scene-box"><p class="muted">Загрузка анимации…</p></div>' : ''),
      blk('how', 'Как это работает', 'book', b.how?.length ? '<div class="prose">' + paras(b.how) + '</div>' : ''),
      blk('proc', 'По шагам', 'list', b.procedure?.length ? '<ol class="prose" style="padding-left:22px">' + b.procedure.map(p => '<li style="margin-top:8px">' + U.richText(p.text) + pg(p.page, c) + '</li>').join('') + '</ol>' : ''),
      blk('examples', 'Разбор примеров из главы', 'spark', b.examples?.length ? b.examples.map(e => '<div class="ex"><b>' + esc(e.title) + '</b>' + pg(e.page, c) + '<p style="margin-top:6px">' + U.richText(e.text.replace(/^(Пример|Example)\s*\d+\.?\s*/i, '')) + '</p>' + (e.figures?.length ? '<p class="muted" style="font-size:15px;margin-top:6px">Опирается на ' + esc(e.figures.join(', ')) + '.</p>' : '') + '</div>').join('') : ''),
      blk('numbers', 'Цифры и условия', 'data', b.numbers?.length ? '<ul class="prose" style="padding-left:20px">' + b.numbers.map(n => '<li style="margin-top:8px">' + U.richText(n.text) + pg(n.page, c) + '</li>').join('') + '</ul>' : ''),
      blk('terms', 'Новые понятия', 'bulb', b.terms?.length ? '<div class="term-list">' + b.terms.map(t => '<div><b>' + esc(t.term) + '</b><span>' + U.richText(t.def) + pg(t.page, c) + '</span></div>').join('') + '</div>' : ''),
      blk('formulas', 'Формулы', 'layers', b.formulas?.length ? b.formulas.map(f => '<div class="formula">' + U.texToHtml(f.tex) + (f.no ? ' <span class="muted" style="float:right">' + esc(f.no) + '</span>' : '') + '</div>' + (f.vars?.length ? '<ul class="formula-vars">' + f.vars.map(v => '<li><span class="tex">' + U.texToHtml(v.s) + '</span> — ' + U.richText(v.m) + (v.u ? ', ' + U.richText(v.u) : '') + '</li>').join('') + '</ul>' : '') + '<p class="muted" style="font-size:15px;margin-top:4px">Формула из главы' + (f.note ? ': ' + U.richText(f.note) : '') + pg(f.page, c) + '</p>').join('') : ''),
      blk('tables', 'Таблицы книги', 'list', b.tables?.length ? b.tables.map(t => (t.caption ? '<p style="font-weight:700;margin:10px 0 6px">' + U.richText(t.caption) + pg(t.page, c) + '</p>' : '<p class="muted" style="margin:10px 0 6px">Таблица' + pg(t.page, c) + '</p>') + U.mdTable(t.md)).join('') : ''),
      blk('mistake', 'Частая ошибка', 'alert', b.mistake ? '<p class="prose" style="font-size:17px">' + U.richText(b.mistake.text) + '</p>' : '', 'mistake'),
      blk('data', 'Что это значит для данных', 'data', b.data?.length ? '<div class="prose">' + paras(b.data) + '</div>' : ''),
      blk('analogy', 'Аналогия', 'spark', b.analogy ? '<p class="prose">' + U.richText(b.analogy.text) + '</p><p class="muted" style="margin-top:8px"><b>Где перестаёт работать:</b> ' + U.richText(b.analogy.limit || '') + '</p>' : ''),
      blk('ill', 'Иллюстрации', 'map', (s.illustrations || []).map(il => '<figure class="fig"><div class="frame"><span class="prov ' + ({'схема': 'scheme', 'симуляция': 'sim', 'реальные данные': 'real'}[il.label] || 'ai') + '">' + esc(il.label) + '</span><img src="' + esc(il.src) + '" alt="' + esc(il.alt) + '" loading="lazy"></div><figcaption>' + esc(il.caption || '') + (il.frameClass ? ' · класс ' + esc(il.frameClass) : '') + '</figcaption></figure>').join('') +
        (b.figures?.length ? b.figures.map(f => '<div class="fig-ph">' + icon('file', 16) + ' ' + U.richText(f.caption) + pg(f.page, c) + '<br><small>Рисунок книги не вставляется в курс: по правилам он перерисовывается кодом с подписью «перерисовано по рис. N, стр. M».</small></div>').join('') : '') +
        (b.figureModel?.length ? b.figureModel.map(f => '<details class="fig-ph"><summary style="cursor:pointer;font-weight:700">' + icon('spark', 16) + ' Описание рисунка · ' + esc(f.format.replace(/^FORMAT\s*\d+:\s*/i, '')) + pg(f.page, c) + '<span class="by model">модель</span></summary><p style="margin-top:8px;white-space:pre-line">' + U.richText(f.text.slice(0, 2400)) + '</p><small>Текст написан моделью при распознавании книги, а не автором. В задания и термины он не попадает.</small></details>').join('') : '')),
      blk('booktasks', 'Задачи из книги', 'file', b.bookTasks?.length ? b.bookTasks.map(t => '<div class="ex' + (t.suspect ? ' suspect' : '') + '"><b>Задача ' + esc(t.number) + '</b>' + pg(t.page, c) + '<p style="margin-top:6px">' + U.richText(t.text) + '</p>' + (t.figures?.length ? '<p class="muted" style="font-size:15px;margin-top:6px">Нужен рисунок: ' + esc(t.figures.join(', ')) + '.</p>' : '') + '</div>').join('') : ''),
      blk('source', 'Источник', 'quote', '<p class="prose">' + esc(c.book) + (c.author ? ', ' + esc(c.author) : '') + '. ' + (c.pseudoPages ? 'Условные страницы ' : 'Страницы PDF ') + esc(s.pages.join(', ')) + '.</p>' + (b.quotes || []).map(q => '<blockquote class="ex">«' + U.richText(q.text) + '»' + pg(q.page, c) + '</blockquote>').join('') +
        '<p class="muted" style="margin-top:10px;font-size:15px">Метка «автор» — дословный текст книги; «модель» — текст, написанный моделью.</p>')
    ].filter(Boolean).join('');
    sec.push(['tasks', 'Задания']);
    host.innerHTML = '<div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#/courses">Курсы</a>' + icon('arrow', 14) + '<a href="#/course/' + esc(c.id) + '">' + esc(c.title) + '</a>' + icon('arrow', 14) + '<span>Шаг ' + (i + 1) + '</span></nav>' +
      '<div class="step-layout" style="margin-top:16px"><div><header class="step-title"><span class="overline">Шаг ' + (i + 1) + ' из ' + c.steps.length + ' · ' + s.minutes + ' мин</span><h1 style="margin-top:6px">' + esc(s.title) + '</h1>' + (s.bookTitle && s.bookTitle !== s.title ? '<p class="book-t">В книге: «' + esc(s.bookTitle) + '»</p>' : '') + '</header>' + html +
      '<section id="b-tasks" style="margin-top:22px"><h2 style="font-size:22px;margin-bottom:12px">Задания · ' + Catalog.tasksOf(c, s.id).length + '</h2><div id="quiz"></div></section>' +
      '<nav class="step-nav" aria-label="Соседние шаги">' + (prev ? '<a class="btn ghost" href="#/step/' + esc(c.id) + '/' + esc(prev.id) + '">' + icon('back') + ' ' + esc(prev.title.slice(0, 34)) + '</a>' : '<span></span>') + (next ? '<a class="btn primary" href="#/step/' + esc(c.id) + '/' + esc(next.id) + '">' + esc(next.title.slice(0, 34)) + ' ' + icon('arrow') + '</a>' : '<a class="btn primary" href="#/course/' + esc(c.id) + '">К маршруту ' + icon('arrow') + '</a>') + '</nav></div>' +
      '<aside class="aside"><div class="card pad" style="padding:16px"><span class="overline">На этой странице</span><nav class="toc" style="margin-top:8px" aria-label="Оглавление шага">' + sec.map(([id, t]) => '<a href="#b-' + id + '" data-anchor="b-' + id + '">' + esc(t) + '</a>').join('') + '</nav></div>' +
      '<div class="card pad" style="padding:16px" id="mini-xp"></div>' +
      '<div class="card pad" style="padding:16px"><span class="overline">Шаги курса</span><nav class="mini-steps" style="margin-top:8px">' + c.steps.map((o, j) => '<a href="#/step/' + esc(c.id) + '/' + esc(o.id) + '" class="' + (o === s ? 'cur' : '') + '"><span>' + (Catalog.isDone(c, o) ? icon('check', 15) : j + 1) + '</span>' + esc(o.title) + '</a>').join('') + '</nav></div></aside></div></div>';
    $$('[data-anchor]', host).forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.anchor)?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); });
    const miniXP = () => { const lv = XP.level(), r = XP.rankOf(lv.n), st = Catalog.stepStats(c, s);
      $('#mini-xp').innerHTML = '<div style="display:flex;gap:12px;align-items:center">' + XP.badge(r, 54) + '<div style="min-width:0;flex:1"><b>' + esc(r.name) + ' · ур. ' + lv.n + '</b><div class="bar yellow" style="margin-top:6px"><i style="width:' + lv.pct + '%"></i></div><small class="muted">' + lv.inLevel + '/' + lv.span + ' XP</small></div></div>' +
        '<p class="muted" style="font-size:15px;margin-top:10px">Шаг: ' + st.answered + '/' + st.total + ' заданий. За завершение +' + XP.RULES.complete + ', без ошибок +' + XP.RULES.perfect + ' XP.</p>'; App.header(); };
    miniXP();
    mounted = Tasks.mount($('#quiz'), c, s, {openPage: (p, q) => openPage(c, s, p, q), onChange: miniXP});
    bindPages(host, c, s);
    const sb = $('#scene-box'); if (sb) Scenes.lessonBlock(sb, c, s);
  };
})();
