/* STRATA · страницы: главная (дизайн 3), каталог, ранг (дизайн 4, только личный), настройки. */
(() => {
  'use strict';
  const {esc, icon, P} = U;
  const V = window.Views = window.Views || {};
  const DOMAIN_STYLE = {'Геофизика скважин': ['#287C83', 'data'], 'Гидромеханика': ['#4F7FA0', 'layers'], 'Литология': ['#8A78B8', 'target'], 'Ваша книга': ['#C9844A', 'book']};
  const dstyle = d => DOMAIN_STYLE[d] || ['#173B4D', 'book'];

  function cover(c) {
    if (c.cover) return '<div class="cover" style="background-image:url(' + esc(c.cover) + ')"><span class="chip">' + esc(c.source === 'upload' ? 'Ваша книга' : 'Глава книги') + '</span></div>';
    return '<div class="cover gen">' + icon('book', 46) + '<span class="chip">Ваша книга</span></div>';
  }
  function courseCard(c) {
    const pr = Catalog.progress(c), st = Catalog.resumeStep(c);
    return '<a class="card course" href="#/course/' + esc(c.id) + '">' + cover(c) +
      '<div class="course-b"><span class="muted" style="font-size:14px">' + esc(c.author || c.domain) + '</span><h3>' + esc(c.title) + '</h3>' +
      '<div class="meta"><span>' + icon('layers', 16) + P.step(c.steps.length) + '</span><span>' + icon('list', 16) + P.task(c.tasks.length) + '</span><span>' + icon('clock', 16) + Catalog.minutes(c) + ' мин</span></div>' +
      '<div class="meta"><span>' + (pr.done ? 'Пройдено ' + pr.pct + ' %' : 'Начать: ' + esc(st?.title || '')) + '</span></div>' +
      '<div class="bar"><i style="width:' + pr.pct + '%"></i></div></div></a>';
  }
  V.courseCard = courseCard;

  function rankStrip() {
    const lv = XP.level(), r = XP.rankOf(lv.n), goals = XP.dailyGoals(), streak = XP.streakAlive();
    return '<section class="sec"><div class="card pad rankstrip">' +
      '<a href="#/rank" aria-label="Мой ранг">' + XP.badge(r, 104, lv.n) + '</a>' +
      '<div><span class="overline">Мой прогресс</span><h3 style="margin-top:4px">' + esc(r.name) + ' · уровень ' + lv.n + '</h3>' +
      '<p class="muted" style="margin:6px 0 10px">' + lv.inLevel + ' из ' + lv.span + ' XP до уровня ' + (lv.n + 1) + '</p><div class="bar yellow"><i style="width:' + lv.pct + '%"></i></div>' +
      '<div class="meta" style="margin-top:12px"><span>' + icon('fire', 16) + 'Серия: ' + P.day(streak) + '</span><span>' + icon('star', 16) + lv.total + ' XP всего</span></div></div>' +
      '<div><span class="overline">Цели на сегодня</span>' + goals.slice(0, 3).map(g => '<div class="goal' + (g.progress >= g.of ? ' done' : '') + '"><span class="gi">' + icon(g.progress >= g.of ? 'check' : 'target', 18) + '</span><div><b>' + esc(g.title) + '</b><small class="muted">' + g.progress + ' / ' + g.of + '</small></div>' + (g.xp ? '<span class="xp">+' + g.xp + ' XP</span>' : '') + '</div>').join('') + '</div>' +
      '</div></section>';
  }
  function deadlineNote() {
    const d = Store.state.deadline; if (!d) return '';
    const left = U.dayDiff(U.today(), d), total = Catalog.totalSteps(), done = Store.state.completed.length;
    const need = total - done;
    const cls = left < 0 ? 'note' : need > 0 && left < need / 3 ? 'note' : 'note info';
    return '<div class="' + cls + '" style="margin-top:18px">' + icon('calendar', 16) + ' Срок прохождения: ' + new Date(d + 'T12:00').toLocaleDateString('ru', {day: 'numeric', month: 'long'}) +
      (left < 0 ? ' — срок прошёл ' + P.day(-left) + ' назад.' : ' — осталось ' + P.day(left) + ', впереди ' + P.step(need) + '.') + '</div>';
  }

  V.home = host => {
    const cs = Catalog.list(), s = Store.state;
    const domains = [...new Set(cs.map(c => c.domain))];
    const lastKey = s.last.split('/'), lastC = Catalog.get(lastKey[0]);
    const cont = lastC ? '#/step/' + lastC.id + '/' + Catalog.resumeStep(lastC).id : '#/courses';
    const tasks = cs.reduce((n, c) => n + c.tasks.length, 0), cards = cs.reduce((n, c) => n + c.cards.length, 0);
    const shorts = (window.MEDIA?.shorts || []).length + (window.MEDIA?.long ? 1 : 0);
    const parts = cs.flatMap(c => c.parts.map(p => ({c, p}))).slice(0, 4);
    host.innerHTML =
      '<div class="wrap"><section class="hero"><div><span class="chip" style="background:rgba(255,255,255,.14);color:#fff">Глава книги → курс</span>' +
      '<h1 style="margin-top:16px">Учитесь сегодня.<br><em>Решайте завтра.</em></h1>' +
      '<p>Загрузите главу книги — сайт соберёт из неё курс: шаги со ссылкой на страницу у каждого абзаца, задания с проверкой, карточки и карту связей.</p>' +
      '<div class="hero-actions"><a class="btn yellow" href="#/upload">' + icon('upload') + ' Загрузить книгу</a><a class="btn light" href="' + cont + '">' + (s.last ? 'Продолжить обучение' : 'Начать с готового курса') + ' ' + icon('arrow') + '</a></div>' + deadlineNote() + '</div>' +
      '<div class="hero-art"><div class="hero-photo" style="background-image:url(assets/relief.webp)" role="img" aria-label="Условная объёмная модель рельефа и пластов"></div>' +
      '<div class="float f1"><span class="fi">' + icon('book', 18) + '</span><div>Курс из книги<small>шаги в порядке графа</small></div></div>' +
      '<div class="float f2"><span class="fi">' + icon('check', 18) + '</span><div>Проверка сразу<small>верный ответ и страница</small></div></div>' +
      '<div class="float f3"><span class="fi">' + icon('trophy', 18) + '</span><div>Ваш ранг<small>опыт за шаги и серии</small></div></div></div></section>' +
      '<form class="card searchbar" role="search" data-search><label>' + icon('search', 20) + '<span style="min-width:0;flex:1"><b>Найти курс</b><input name="q" placeholder="Название, автор, тема"></span></label>' +
      '<label>' + icon('layers', 20) + '<span style="min-width:0;flex:1"><b>Направление</b><select name="cat"><option value="">Все направления</option>' + domains.map(d => '<option>' + esc(d) + '</option>').join('') + '</select></span></label>' +
      '<label>' + icon('target', 20) + '<span style="min-width:0;flex:1"><b>Тип трудности</b><select name="type"><option value="">Любой</option>' + ['М', 'В', 'И', 'Ф', 'П', 'Пр', 'Н', 'Р'].map(t => '<option>' + t + '</option>').join('') + '</select></span></label>' +
      '<button class="btn primary">Найти курсы</button></form>' +

      '<section class="sec"><div class="sec-head"><h2>Направления</h2><a class="link" href="#/courses">Все курсы ' + icon('arrow', 16) + '</a></div><div class="grid g5 cats">' +
      domains.map(d => { const [col, ic] = dstyle(d); const n = cs.filter(c => c.domain === d).length;
        return '<a class="card cat" href="#/courses?cat=' + encodeURIComponent(d) + '"><span class="ci" style="background:' + col + '">' + icon(ic, 24) + '</span><b>' + esc(d) + '</b><small>' + P.course(n) + '</small></a>'; }).join('') +
      '<a class="card cat" href="#/upload"><span class="ci" style="background:#C9844A">' + icon('upload', 24) + '</span><b>Своя книга</b><small>загрузить .md или .txt</small></a></div></section>' +

      '<section class="sec"><div class="sec-head"><h2>' + (s.completed.length ? 'Продолжить обучение' : 'Популярные курсы') + '</h2><a class="link" href="#/courses">Смотреть все ' + icon('arrow', 16) + '</a></div><div class="grid g4">' +
      cs.slice(0, 4).map(courseCard).join('') + '</div></section>' + rankStrip() +

      '<section class="sec why"><div><h2>Почему <em>STRATA</em>?</h2><p class="muted" style="margin-top:10px;max-width:56ch">Курс собирается из учебного слоя книги, а не пересказывается общими словами. Всё, что вы читаете, можно проверить по странице оригинала.</p>' +
      '<div class="feats">' + [['quote', 'Стр. N у абзаца', 'Каждая мысль привязана к странице книги'], ['check', 'Задания с проверкой', '5 типов, ответ виден сразу'], ['cards', 'Карточки', '«знаю / повторить» по всем шагам'], ['map', 'Карта связей', 'какой шаг на какой опирается'], ['print', 'Конспект в PDF', 'суть шагов на печать'], ['layers', 'Работает офлайн', 'без сервера и регистрации']].map(f => '<div class="feat"><span class="fi">' + icon(f[0], 20) + '</span><b>' + f[1] + '</b>' + f[2] + '</div>').join('') + '</div>' +
      '<a class="btn primary" style="margin-top:22px" href="#/courses">Перейти к курсам</a></div>' +
      '<div class="why-art"><div class="ph" style="background-image:url(assets/media/hero.jpg)" role="img" aria-label="Иллюстрация учебного центра"></div></div></section>' +

      '<section class="sec banner"><div><span class="overline" style="color:#fff;opacity:.85">Своя литература</span><h2 style="margin-top:6px">Превратите свою книгу в курс</h2><p>Загрузите главу в формате markdown с метками страниц или обычный текст. Сайт разобьёт её на шаги, построит задания и таблицу покрытия.</p>' +
      '<div class="steps3"><span>1. Файл<small>.md или .txt</small></span><span>2. Границы главы<small>страницы и заголовки</small></span><span>3. Курс<small>шаги, задания, карточки</small></span></div></div>' +
      '<a class="btn yellow" href="#/upload">' + icon('upload') + ' Загрузить книгу</a></section>' +

      '<section class="sec"><div class="card stats"><div><b>' + cs.length + '</b><small>' + P.course(cs.length).replace(/^\d+ /, '') + '</small></div><div><b>' + Catalog.totalSteps() + '</b><small>шагов</small></div><div><b>' + tasks + '</b><small>заданий</small></div><div><b>' + shorts + '</b><small>ролика с вопросами</small></div></div></section>' +

      '<section class="sec"><div class="sec-head"><h2>Учебные траектории</h2><a class="link" href="#/courses">Все траектории ' + icon('arrow', 16) + '</a></div><div class="grid g4">' +
      parts.map(({c, p}) => '<a class="card path" href="#/course/' + esc(c.id) + '">' + (c.cover ? '<div class="cover" style="background-image:url(' + esc(c.cover) + ')"></div>' : '<div class="cover gen">' + icon('layers', 36) + '</div>') +
        '<div class="course-b"><h3>' + esc(p.title) + '</h3><span class="muted" style="font-size:15px">' + esc(c.title) + ' · ' + P.step(p.steps.length) + '</span></div></a>').join('') + '</div></section>' +
      '<p class="muted" style="margin-top:22px;font-size:15px">В каталоге ' + P.card(cards) + ' для повторения. Шортсы: <a class="link" href="#/shorts">смотреть</a>.</p></div>';
    host.querySelector('[data-search]').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      const q = new URLSearchParams(); ['q', 'cat', 'type'].forEach(k => { if (f.get(k)) q.set(k, f.get(k)); });
      location.hash = '#/courses' + (q.toString() ? '?' + q : '');
    };
  };

  V.library = (host, params) => {
    const q = (params.get('q') || '').toLowerCase(), cat = params.get('cat') || '', type = params.get('type') || '', src = params.get('src') || '';
    const all = Catalog.list(), domains = [...new Set(all.map(c => c.domain))];
    const list = all.filter(c => (!q || (c.title + ' ' + c.author + ' ' + c.book + ' ' + c.domain).toLowerCase().includes(q)) && (!cat || c.domain === cat) && (!type || c.types.includes(type)) && (!src || c.source === src));
    const btn = (label, k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); const on = (params.get(k) || '') === v; return '<button type="button" data-go="#/courses' + (p.toString() ? '?' + p : '') + '" aria-pressed="' + on + '">' + esc(label) + '</button>'; };
    host.innerHTML = '<div class="wrap"><div class="page-head"><div><h1>Курсы</h1><p>Готовые курсы по главам книг и курсы из ваших загрузок. ' + (q ? 'Поиск: «' + esc(q) + '».' : '') + '</p></div><a class="btn yellow" href="#/upload">' + icon('upload') + ' Загрузить книгу</a></div>' +
      '<div class="filters" role="group" aria-label="Источник">' + btn('Все', 'src', '') + btn('Готовые главы', 'src', 'builtin') + btn('Ваши книги', 'src', 'upload') + '</div>' +
      '<div class="filters" role="group" aria-label="Направление">' + btn('Все направления', 'cat', '') + domains.map(d => btn(d, 'cat', d)).join('') + '</div>' +
      (list.length ? '<div class="grid g4">' + list.map(courseCard).join('') + '</div>' : '<div class="empty">Курсов не найдено. <a class="link" href="#/courses">Сбросить фильтры</a> или <a class="link" href="#/upload">загрузите свою книгу</a>.</div>') + '</div>';
    host.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
  };

  function radarSvg(data) {
    const cx = 150, cy = 140, R = 100, n = data.length;
    const pt = (i, r) => [cx + r * Math.sin(2 * Math.PI * i / n), cy - r * Math.cos(2 * Math.PI * i / n)];
    const ring = k => data.map((_, i) => pt(i, R * k).join(',')).join(' ');
    const area = data.map((d, i) => pt(i, R * Math.max(d.v, 4) / 100).join(',')).join(' ');
    return '<svg class="radar" viewBox="0 0 300 290" width="100%" role="img" aria-label="Личные показатели: ' + data.map(d => d.k + ' ' + d.v + '%').join(', ') + '">' +
      [0.25, 0.5, 0.75, 1].map(k => '<polygon class="grid-l" points="' + ring(k) + '"/>').join('') +
      data.map((_, i) => { const [x, y] = pt(i, R); return '<line class="grid-l" x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '"/>'; }).join('') +
      '<polygon class="area" points="' + area + '"/>' +
      data.map((d, i) => { const [x, y] = pt(i, R + 22); return '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + esc(d.k) + '</text>'; }).join('') + '</svg>';
  }
  function calendar() {
    const s = Store.state, cells = [];
    for (let k = 27; k >= 0; k--) {
      const d = new Date(); d.setDate(d.getDate() - k); const key = U.today(d), a = s.activity[key];
      const n = a ? a.steps * 3 + a.tasks : 0, lvl = n === 0 ? '' : n < 4 ? 'l1' : n < 10 ? 'l2' : 'l3';
      cells.push('<i class="' + lvl + (k === 0 ? ' today' : '') + '" title="' + key + ': ' + (a ? a.tasks + ' заданий, ' + a.steps + ' шагов' : 'нет занятий') + '"></i>');
    }
    return '<div class="cal" role="img" aria-label="Активность за 4 недели">' + cells.join('') + '</div>';
  }

  V.rank = host => {
    const s = Store.state, lv = XP.level(), r = XP.rankOf(lv.n), nx = XP.nextRank(lv.n), goals = XP.dailyGoals();
    const answers = s.events.filter(e => e.type === 'answer'), right = answers.filter(e => e.correct).length;
    const toNext = nx ? XP.need(nx.min) - lv.total : 0;
    host.innerHTML = '<div class="wrap"><div class="page-head"><div><h1>Мой ранг</h1><p>Личный прогресс этого профиля. Без рейтинга и соревнований с другими: опыт показывает только вашу работу.</p></div><a class="btn ghost" href="#/settings">' + icon('settings') + ' Профиль</a></div>' +
      '<div class="rank-grid">' +
      '<div class="grid" style="gap:16px"><div class="card medal-card">' + XP.badge(r, 130, lv.n) + '<h2>' + esc(s.name) + '</h2><span class="chip accent">' + esc(r.name) + '</span>' +
      '<div style="width:100%;margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:15px"><span class="muted">Уровень ' + lv.n + '</span><b>' + lv.inLevel + ' / ' + lv.span + ' XP</b></div><div class="bar yellow" style="margin-top:6px"><i style="width:' + lv.pct + '%"></i></div></div>' +
      '<div class="grid g2" style="width:100%;margin-top:10px;gap:10px;text-align:left"><div class="kpi card"><b>' + XP.streakAlive() + '</b><small>серия, дней</small></div><div class="kpi card"><b>' + s.streak.best + '</b><small>лучшая серия</small></div>' +
      '<div class="kpi card"><b>' + s.completed.length + '</b><small>шагов пройдено</small></div><div class="kpi card"><b>' + (answers.length ? Math.round(100 * right / answers.length) : 0) + '%</b><small>верных ответов</small></div></div></div>' +
      '<div class="card pad"><h3 style="font-size:17px">Как начисляется опыт</h3><ul class="log" style="margin-top:8px"><li><span>Шаг завершён (все задания решены)</span><b>+' + XP.RULES.complete + '</b></li><li><span>Все задания шага верно с первой попытки</span><b>+' + XP.RULES.perfect + '</b></li><li><span>Серия: первый шаг за день, × число дней (до 7)</span><b>+' + XP.RULES.streakPerDay + '…' + XP.RULES.streakPerDay * XP.RULES.streakCap + '</b></li></ul></div></div>' +

      '<div class="grid" style="gap:16px"><div class="card big-rank">' + XP.badge(r, 120) + '<div><span class="overline">Текущий ранг</span><div class="rank-name" style="color:' + r.color + '">' + esc(r.name) + '</div>' +
      (nx ? '<p class="muted" style="margin-top:6px">До ранга «' + esc(nx.name) + '» (уровень ' + nx.min + ') — ' + toNext + ' XP</p><div class="bar" style="margin-top:8px"><i style="width:' + Math.max(4, Math.round(100 * (lv.total - XP.need(r.min)) / (XP.need(nx.min) - XP.need(r.min)))) + '%"></i></div>' : '<p class="muted">Высший ранг достигнут.</p>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">' + XP.RANKS.map(x => '<span class="chip" style="' + (x.id === r.id ? 'background:' + x.color + ';color:#fff' : '') + '">' + esc(x.name) + '</span>').join('') + '</div></div></div>' +
      '<div class="card pad"><h3 style="font-size:17px">Показатели</h3>' + radarSvg(XP.radar()) + '</div>' +
      '<div class="card pad"><h3 style="font-size:17px;margin-bottom:12px">Достижения</h3><div class="ach">' + XP.ACH.map(a => '<div class="' + (s.achievements[a.id] ? '' : 'off') + '"><span class="ai">' + icon('medal', 22) + '</span><b>' + esc(a.name) + '</b>' + esc(a.text) + '</div>').join('') + '</div></div></div>' +

      '<div class="grid" style="gap:16px"><div class="card pad"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:17px">Цели на сегодня</h3><span class="chip orange">' + icon('fire', 14) + ' ' + XP.streakAlive() + '</span></div>' +
      goals.map(g => '<div class="goal' + (g.progress >= g.of ? ' done' : '') + '"><span class="gi">' + icon(g.progress >= g.of ? 'check' : 'target', 18) + '</span><div style="min-width:0;flex:1"><b>' + esc(g.title) + '</b><div class="bar" style="margin-top:6px"><i style="width:' + Math.round(100 * g.progress / g.of) + '%"></i></div></div>' + (g.xp ? '<span class="xp">+' + g.xp + '</span>' : '') + '</div>').join('') +
      '<a class="btn primary" style="width:100%;margin-top:12px" href="#/courses">Продолжить обучение</a></div>' +
      '<div class="card pad"><h3 style="font-size:17px;margin-bottom:10px">Активность за 4 недели</h3>' + calendar() + '</div>' +
      '<div class="card pad"><h3 style="font-size:17px;margin-bottom:6px">История опыта</h3>' + (s.xp.log.length ? '<ul class="log">' + s.xp.log.slice(0, 12).map(l => '<li><span>' + esc(l.reason) + '<br><small class="muted">' + new Date(l.ts).toLocaleString('ru', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) + '</small></span><b>+' + l.amount + '</b></li>').join('') + '</ul>' : '<p class="muted">Завершите первый шаг, чтобы получить опыт.</p>') + '</div></div>' +
      '</div></div>';
  };

  V.settings = host => {
    const s = Store.state;
    host.innerHTML = '<div class="wrap" style="max-width:820px"><div class="page-head"><div><h1>Профиль и настройки</h1><p>Всё хранится в этом браузере. Сервер не нужен.</p></div></div>' +
      '<form class="card pad form" data-profile><div class="row2"><label class="field">Имя<input name="name" maxlength="60" value="' + esc(s.name) + '" required></label>' +
      '<label class="field">Срок прохождения<input type="date" name="deadline" value="' + esc(s.deadline) + '"><small>Показывается на главной вместе с остатком шагов</small></label></div>' +
      '<label class="field">Тема<select name="theme"><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Светлая</option><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Тёмная</option></select></label>' +
      '<button class="btn primary" style="justify-self:start">Сохранить</button></form>' +
      '<form class="card pad form" style="margin-top:16px" data-api><h2 style="font-size:20px">Сервер (бэкенд)</h2><p class="muted">Выключено: курсы собирает встроенный движок, прогресс хранится локально. Включите, когда напарник поднимет сервер: тогда PDF и сборка моделью пойдут на сервер, события синхронизируются.</p>' +
      '<label class="field">Адрес сервера<input name="base" placeholder="https://…" value="' + esc(s.api.base) + '"><small>Пути API задаются в js/api.js (PATHS)</small></label>' +
      '<label style="display:flex;gap:10px;align-items:center;font-weight:600"><input type="checkbox" name="enabled"' + (s.api.enabled ? ' checked' : '') + '> Использовать сервер</label>' +
      '<p class="muted" style="font-size:15px">В очереди на отправку: ' + Api.queued() + ' событий.</p><button class="btn ghost" style="justify-self:start">Сохранить</button></form>' +
      '<div class="card pad" style="margin-top:16px"><h2 style="font-size:20px">Данные</h2><p class="muted" style="margin:6px 0 12px">Экспорт отчёта и импорт отчётов сотрудников — в кабинете руководителя. Сброс удалит прогресс, опыт и ранг этого профиля, но не загруженные книги.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="#/team">' + icon('team') + ' Кабинет руководителя</a><button class="btn ghost" data-reset style="color:var(--red)">' + icon('trash') + ' Сбросить прогресс</button></div></div></div>';
    host.querySelector('[data-profile]').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); s.name = f.get('name').trim() || 'Участник'; s.deadline = f.get('deadline'); s.theme = f.get('theme'); Store.save(); App.applyTheme(); App.header(); U.toast('Сохранено'); };
    host.querySelector('[data-api]').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); s.api = {base: f.get('base').trim(), enabled: !!f.get('enabled')}; Store.save(); U.toast(s.api.enabled ? 'Сервер включён' : 'Работа в локальном режиме'); Api.flush(); };
    host.querySelector('[data-reset]').onclick = () => {
      if (!confirm('Удалить прогресс, опыт, серии и ответы этого профиля? Отменить это нельзя.')) return;
      const fresh = Store.defaults(); for (const k of ['completed', 'events', 'cards', 'video', 'xp', 'streak', 'activity', 'achievements']) s[k] = fresh[k]; s.last = '';
      Store.save(); App.header(); U.toast('Прогресс сброшен'); App.route();
    };
  };
})();
