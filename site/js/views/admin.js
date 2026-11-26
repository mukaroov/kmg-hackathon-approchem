/* STRATA · страницы режима сервера: вход и регистрация, профиль, статистика ученика, кабинет руководителя (из базы),
   управление: документы и сборка курсов (эксперт), ИИ, пользователи, правила, сеть (администратор).
   Все проверки прав повторяются на сервере; интерфейс лишь не показывает недоступное. */
(() => {
  'use strict';
  const {esc, icon, P, $, $$} = U;
  const V = window.Views = window.Views || {};
  const ROLE = {student: 'Ученик', expert: 'Эксперт', admin: 'Администратор'};
  const STATUS = {draft: 'черновик', in_review: 'на проверке', published: 'опубликован', archived: 'снят'};
  const fmtDate = s => s ? new Date(s).toLocaleString('ru', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
  const pct = v => v == null ? '—' : v + ' %';
  const fail = (box, err) => { box.innerHTML = '<div class="note">' + esc(err.message || err) + '</div>'; };
  const kpi = (v, l) => '<div class="kpi card"><b>' + esc(v) + '</b><small>' + esc(l) + '</small></div>';

  /* ---------- Вход и регистрация ---------- */
  V.login = host => {
    let mode = 'login';
    const draw = (msg = '') => {
      host.innerHTML = '<div class="wrap auth"><div class="auth-art"><span class="chip" style="background:rgba(255,255,255,.16);color:#fff">Учебная лаборатория</span><h1>STRATA</h1>' +
        '<p>Глава книги превращается в проверенный курс: шаги со ссылкой на страницу, задания с проверкой, личный ранг и помощник, который ведёт к ответу, а не подсказывает его.</p></div>' +
        '<form class="card pad form auth-form" data-auth novalidate><h2>' + (mode === 'login' ? 'Вход' : 'Регистрация') + '</h2>' +
        (mode === 'register' ? '<label class="field">Имя<input name="name" maxlength="80" autocomplete="name" required></label>' : '') +
        '<label class="field">Почта<input name="email" type="email" maxlength="254" autocomplete="email" required></label>' +
        '<label class="field">Пароль<input name="password" type="password" minlength="' + (mode === 'register' ? 8 : 1) + '" maxlength="200" autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '" required>' + (mode === 'register' ? '<small>Не короче 8 символов</small>' : '') + '</label>' +
        '<p class="validation" role="alert">' + esc(msg) + '</p>' +
        '<button class="btn primary">' + (mode === 'login' ? 'Войти' : 'Создать учётную запись') + '</button>' +
        '<button type="button" class="btn ghost" data-switch>' + (mode === 'login' ? 'Нет учётной записи? Зарегистрироваться' : 'Уже есть учётная запись? Войти') + '</button>' +
        '<small class="muted">Соединение в локальной сети идёт по HTTP без шифрования. Не используйте пароль от других сервисов.</small></form></div>';
      $('[data-switch]', host).onclick = () => { mode = mode === 'login' ? 'register' : 'login'; draw(); };
      $('[data-auth]', host).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector('.btn.primary'); btn.disabled = true;
        try {
          if (mode === 'login') await Api.login(f.get('email'), f.get('password'));
          else await Api.register(f.get('email'), f.get('name'), f.get('password'));
          await Catalog.reload(); location.hash = '#/home';
        } catch (err) {
          const extra = err.detail?.errors?.map(x => x.message).join('; ');
          draw(err.message + (extra ? ' (' + extra + ')' : ''));
        }
      };
    };
    draw();
  };

  /* ---------- Профиль (режим сервера) ---------- */
  V.settingsOnline = host => {
    const u = Api.user, s = Store.state;
    host.innerHTML = '<div class="wrap" style="max-width:820px"><div class="page-head"><div><h1>Профиль</h1><p>' + esc(u.email) + ' · ' + esc(ROLE[u.role] || u.role) + '. Прогресс хранится на сервере STRATA и доступен с любого устройства в сети.</p></div>' +
      '<button class="btn ghost" data-logout>' + icon('back') + ' Выйти</button></div>' +
      '<form class="card pad form" data-profile><div class="row2"><label class="field">Имя<input name="name" maxlength="80" value="' + esc(u.name) + '" required></label>' +
      '<label class="field">Срок прохождения<input type="date" name="deadline" value="' + esc(u.deadline || '') + '"><small>Виден руководителю и на главной</small></label></div>' +
      '<label class="field">Тема<select name="theme"><option value="light"' + (s.theme === 'light' ? ' selected' : '') + '>Светлая</option><option value="dark"' + (s.theme === 'dark' ? ' selected' : '') + '>Тёмная</option></select></label>' +
      '<button class="btn primary" style="justify-self:start">Сохранить</button></form>' +
      '<form class="card pad form" style="margin-top:16px" data-pass><h2 style="font-size:20px">Смена пароля</h2><div class="row2"><label class="field">Текущий пароль<input type="password" name="current" autocomplete="current-password" required></label>' +
      '<label class="field">Новый пароль<input type="password" name="next" minlength="8" autocomplete="new-password" required><small>Не короче 8 символов</small></label></div><button class="btn ghost" style="justify-self:start">Сменить пароль</button></form></div>';
    $('[data-logout]', host).onclick = () => Api.logout();
    $('[data-profile]', host).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try {
        const r = await Api.patch('/api/auth/me', {name: f.get('name').trim(), deadline: f.get('deadline') || null});
        Object.assign(Api.user, r); s.name = r.name; s.deadline = r.deadline || ''; s.theme = f.get('theme'); Store.save(); App.applyTheme(); App.header(); U.toast('Сохранено');
      } catch (err) { U.toast(err.message); }
    };
    $('[data-pass]', host).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await Api.patch('/api/auth/me', {current_password: f.get('current'), new_password: f.get('next')}); e.target.reset(); U.toast('Пароль изменён'); }
      catch (err) { U.toast(err.message); }
    };
  };

  /* ---------- Статистика ученика (дополняет страницу «Мой ранг») ---------- */
  V.statsOnline = async box => {
    box.innerHTML = '<div class="card pad"><p class="muted">Загружаем статистику…</p></div>';
    try {
      const [st, recs] = await Promise.all([Api.get('/api/analytics/student'), Api.get('/api/progress/recommendations')]);
      box.innerHTML = '<div class="card pad"><div class="sec-head" style="margin:0 0 12px"><h2 style="font-size:20px">Статистика обучения</h2><span class="chip">из базы STRATA</span></div>' +
        '<div class="grid g4" style="gap:10px">' + kpi(pct(st.firstTryAccuracy), 'верно с первой попытки') + kpi(st.medianActiveSeconds == null ? '—' : st.medianActiveSeconds + ' с', 'медиана активного времени') +
        kpi(pct(st.hintRate), 'заданий с подсказкой') + kpi(st.questions, 'заданий решено') + '</div>' +
        '<p class="muted" style="font-size:15px;margin-top:10px">Время считается только активное: простой больше 30 секунд не учитывается. Медленный ответ не снижает оценку.</p>' +
        '<div class="grid g2" style="gap:16px;margin-top:16px"><div><h3 style="font-size:17px">Что дальше</h3>' +
        (recs.length ? '<ul class="log" style="margin-top:6px">' + recs.map(r => '<li><a class="link" href="' + (r.lessonId ? '#/step/' + esc(r.courseId) + '/' + esc(r.lessonId) : '#/course/' + esc(r.courseId)) + '">' + esc(r.title) + '</a>' + (r.mastery != null ? '<b>' + r.mastery + ' %</b>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">Начните любой курс — здесь появятся рекомендации.</p>') + '</div>' +
        '<div><h3 style="font-size:17px">Слабые места</h3>' + (st.weakLessons.length ? '<ul class="log" style="margin-top:6px">' + st.weakLessons.map(w => '<li><a class="link" href="#/step/' + esc(w.courseId) + '/' + esc(w.lessonId) + '">' + esc(w.title) + '</a><b>' + w.accuracy + ' %</b></li>').join('') + '</ul>' : '<p class="muted">Пока нет шагов с точностью ниже 80 %.</p>') + '</div></div>' +
        (st.courses.length ? '<h3 style="font-size:17px;margin-top:16px">Курсы</h3>' + st.courses.map(c => '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between"><a class="link" href="#/course/' + esc(c.id) + '">' + esc(c.title) + '</a><span class="muted">' + c.done + ' / ' + c.total + '</span></div><div class="bar"><i style="width:' + c.pct + '%"></i></div></div>').join('') : '') + '</div>';
    } catch (err) { fail(box, err); }
  };

  /* ---------- Кабинет руководителя (из базы) ---------- */
  V.teamOnline = async host => {
    host.innerHTML = '<div class="wrap"><div class="page-head"><div><h1>Кабинет руководителя</h1><p>Прогресс сотрудников из базы STRATA. Отчёты в файлах больше не нужны: данные обновляются сразу после ответа ученика.</p></div><a class="btn ghost" href="#/admin/users">' + icon('team') + ' Пользователи и сроки</a></div><div id="tm"></div></div>';
    const box = $('#tm', host);
    try {
      const t = await Api.get('/api/analytics/team');
      box.innerHTML = '<div class="grid g4" style="gap:12px">' + kpi(t.totals.students, 'учеников') + kpi(t.totals.started, 'начали обучение') + kpi(t.totals.overdue, 'просрочили срок') + kpi(t.ai.requests ? Math.round(100 * t.ai.ok / t.ai.requests) + ' %' : '—', 'успешных запросов к ИИ') + '</div>' +
        '<section class="sec"><div class="card pad tbl-wrap"><h2 style="font-size:20px;margin-bottom:10px">Сотрудники</h2>' +
        (t.people.length ? '<table class="tbl"><thead><tr><th>Имя</th><th>Шаги</th><th>Верно с 1-й</th><th>Медиана, с</th><th>С подсказкой</th><th>Уровень</th><th>Срок</th><th>Последняя активность</th></tr></thead><tbody>' +
          t.people.map(p => '<tr' + (p.overdue ? ' class="bad"' : '') + '><td><button class="link" data-person="' + p.id + '">' + esc(p.name) + '</button><br><small class="muted">' + esc(p.email) + '</small></td><td>' + p.stepsDone + ' / ' + p.stepsTotal + '</td><td>' + pct(p.firstTryAccuracy) + '</td><td>' + (p.medianActiveSeconds ?? '—') + '</td><td>' + pct(p.hintRate) + '</td><td>' + p.level + '</td><td>' + (p.deadline ? esc(p.deadline) + (p.overdue ? ' <span class="chip orange">просрочен</span>' : '') : '—') + '</td><td>' + fmtDate(p.lastActivity) + '</td></tr>').join('') + '</tbody></table>' :
          '<p class="muted">Учеников пока нет. Они появятся после регистрации или создания на странице «Пользователи».</p>') + '</div></section>' +
        '<section class="sec"><div class="card pad"><h2 style="font-size:20px;margin-bottom:10px">Самые трудные задания</h2>' +
        (t.hardestQuestions.length ? '<ul class="log">' + t.hardestQuestions.map(h => '<li><span>' + esc(h.prompt) + '<br><small class="muted">первых попыток: ' + h.n + (h.medianSeconds ? ', медиана ' + h.medianSeconds + ' с' : '') + '</small></span><b>' + h.errorRate + ' % ошибок</b></li>').join('') + '</ul>' : '<p class="muted">Нужно хотя бы две первые попытки по заданию.</p>') + '</div></section><div id="person"></div>';
      $$('[data-person]', box).forEach(b => b.onclick = async () => {
        const p = $('#person', box); p.innerHTML = '<div class="card pad"><p class="muted">Загрузка…</p></div>';
        try {
          const s = await Api.get('/api/analytics/student/' + b.dataset.person);
          p.innerHTML = '<div class="card pad"><h2 style="font-size:20px">' + esc(s.user.name) + '</h2><div class="grid g4" style="gap:10px;margin-top:10px">' + kpi(pct(s.firstTryAccuracy), 'верно с 1-й') + kpi(s.medianActiveSeconds ?? '—', 'медиана, с') + kpi(pct(s.hintRate), 'с подсказкой') + kpi(s.level.level, 'уровень') + '</div>' +
            '<h3 style="font-size:17px;margin-top:14px">Слабые шаги</h3>' + (s.weakLessons.length ? '<ul class="log">' + s.weakLessons.map(w => '<li><span>' + esc(w.title) + '</span><b>' + w.accuracy + ' %</b></li>').join('') + '</ul>' : '<p class="muted">Нет.</p>') +
            '<h3 style="font-size:17px;margin-top:14px">Курсы</h3>' + (s.courses.map(c => '<p>' + esc(c.title) + ': ' + c.done + ' / ' + c.total + '</p>').join('') || '<p class="muted">Не начаты.</p>') + '</div>';
          p.scrollIntoView({behavior: 'smooth'});
        } catch (err) { fail(p, err); }
      });
    } catch (err) { fail(box, err); }
  };

  /* ---------- Загрузка (режим сервера): эксперт — в управление документами; ученик — пояснение ---------- */
  V.uploadInfo = host => {
    host.innerHTML = '<div class="wrap" style="max-width:820px"><div class="page-head"><div><h1>Загрузить книгу</h1></div></div><div class="card pad"><p>В режиме сервера курсы из книг собирает и проверяет <b>эксперт</b>: документ проходит извлечение текста, сборку курса и проверку источников, и только после публикации появляется у учеников.</p>' +
      '<p class="muted" style="margin-top:10px">Попросите эксперта или администратора STRATA загрузить нужную главу. Если нужно собрать курс только для себя, откройте STRATA как файл (frontend/index.html) — в офлайн-режиме сборка идёт прямо в браузере.</p></div></div>';
  };

  /* ---------- Управление ---------- */
  const TABS = [['docs', 'Документы и курсы', 'file', 'expert'], ['ai', 'ИИ', 'spark', 'admin'], ['users', 'Пользователи', 'team', 'admin'], ['rules', 'Правила', 'target', 'admin'], ['network', 'Сеть', 'map', 'admin']];
  V.admin = (host, parts) => {
    const allowed = TABS.filter(t => t[3] === 'expert' ? Api.isExpert() : Api.isAdmin());
    if (!allowed.length) { host.innerHTML = '<div class="wrap"><div class="empty" style="margin-top:30px">Раздел доступен эксперту и администратору.</div></div>'; return; }
    const tab = allowed.find(t => t[0] === parts[1]) || allowed[0];
    host.innerHTML = '<div class="wrap"><div class="page-head"><div><h1>Управление</h1><p>' + esc(ROLE[Api.role()]) + ' · ' + esc(Api.user.email) + '</p></div></div>' +
      '<div class="filters" role="tablist">' + allowed.map(t => '<a role="tab" class="tab" href="#/admin/' + t[0] + '" aria-selected="' + (t === tab) + '">' + icon(t[2], 16) + ' ' + esc(t[1]) + '</a>').join('') + '</div><div id="adm"></div></div>';
    ({docs, ai, users, rules, network})[tab[0]]($('#adm', host));
  };

  /* Документы → извлечение → сборка курса → проверка экспертом → публикация */
  async function docs(box) {
    box.innerHTML = '<form class="card pad form" data-up><h2 style="font-size:20px">Загрузить документ</h2><p class="muted">PDF с текстовым слоем, DOCX, TXT или Markdown (метки <code>&lt;!-- page N --&gt;</code> дают точные страницы). Сканы без текста не распознаются — будет понятная ошибка.</p>' +
      '<div class="row2"><label class="field">Файл<input type="file" name="file" accept=".pdf,.docx,.txt,.md,.markdown" required></label><label class="field">Название книги<input name="title" maxlength="300" placeholder="как на обложке"></label></div>' +
      '<label class="field">Автор<input name="author" maxlength="300"></label><button class="btn primary" style="justify-self:start">' + icon('upload') + ' Загрузить и извлечь текст</button><p class="validation" role="status"></p></form>' +
      '<section class="sec"><h2 style="font-size:20px;margin-bottom:10px">Документы</h2><div id="doc-list"><p class="muted">Загрузка…</p></div></section>' +
      '<section class="sec"><h2 style="font-size:20px;margin-bottom:10px">Курсы</h2><div id="course-list"><p class="muted">Загрузка…</p></div></section>';
    $('[data-up]', box).onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), v = $('.validation', e.target), b = e.target.querySelector('.btn'); b.disabled = true; v.textContent = 'Отправка и извлечение текста…';
      try { const d = await Api.post('/api/documents', f); v.textContent = d.status === 'extracted' ? 'Готово: ' + P.page(d.pages) + '.' : 'Ошибка извлечения: ' + d.error; e.target.reset(); listDocs(); }
      catch (err) { v.textContent = err.message; }
      b.disabled = false;
    };
    listDocs(); listCourses();
  }
  async function listDocs() {
    const box = $('#doc-list'); if (!box) return;
    try {
      const ds = await Api.get('/api/documents');
      box.innerHTML = ds.length ? ds.map(d => '<div class="card pad doc" data-doc="' + esc(d.id) + '"><div class="doc-h"><div><b>' + esc(d.title || d.filename) + '</b><br><small class="muted">' + esc(d.filename) + ' · ' + Math.round(d.size / 1024) + ' КБ · ' + fmtDate(d.createdAt) + '</small></div>' +
        '<span class="chip ' + (d.status === 'extracted' ? 'green' : 'orange') + '">' + (d.status === 'extracted' ? P.page(d.pages) + (d.pageMarkers ? ' · метки страниц' : '') : 'ошибка') + '</span></div>' +
        (d.error ? '<p class="note" style="margin-top:8px">' + esc(d.error) + '</p>' : '') + (d.meta?.pages_without_text?.length ? '<p class="muted" style="font-size:15px">' + esc(d.meta.warning || '') + ' Страницы: ' + esc(d.meta.pages_without_text.slice(0, 20).join(', ')) + '</p>' : '') +
        '<div class="doc-a">' + (d.status === 'extracted' ? '<button class="btn primary small" data-gen>' + icon('layers', 16) + ' Собрать курс</button>' : '<button class="btn ghost small" data-re>Повторить извлечение</button>') +
        '<button class="btn ghost small" data-del style="color:var(--red)">' + icon('trash', 16) + ' Удалить</button>' + (d.courses.length ? '<small class="muted">Курсы: ' + d.courses.map(esc).join(', ') + '</small>' : '') + '</div><div class="gen-box"></div></div>').join('') :
        '<div class="empty">Документов пока нет.</div>';
      $$('[data-doc]', box).forEach(el => {
        const id = el.dataset.doc;
        el.querySelector('[data-del]').onclick = async () => { if (!confirm('Удалить документ? Курсы, собранные из него, останутся.')) return; try { await Api.del('/api/documents/' + id); listDocs(); } catch (err) { U.toast(err.message); } };
        el.querySelector('[data-re]')?.addEventListener('click', async () => { try { await Api.post('/api/documents/' + id + '/extract'); listDocs(); } catch (err) { U.toast(err.message); } });
        el.querySelector('[data-gen]')?.addEventListener('click', () => genForm(el.querySelector('.gen-box'), id));
      });
    } catch (err) { fail(box, err); }
  }
  async function genForm(box, id) {
    box.innerHTML = '<p class="muted">Читаем структуру документа…</p>';
    try {
      const [d, ai] = await Promise.all([Api.get('/api/documents/' + id), Api.aiStatus().catch(() => ({ok: false}))]);
      const pv = d.preview || {headings: [], pageMin: 1, pageMax: d.pages};
      const opts = '<option value="">—</option>' + pv.headings.map(h => '<option value="' + esc(h.id) + '">стр. ' + h.page + ' · ' + esc(h.title) + '</option>').join('');
      box.innerHTML = '<form class="form gen" data-g><div class="row2"><label class="field">Страница с<input type="number" name="pageFrom" value="' + pv.pageMin + '" min="0"></label><label class="field">по<input type="number" name="pageTo" value="' + pv.pageMax + '" min="0"></label></div>' +
        '<div class="row2"><label class="field">Начать с заголовка<select name="startHeading">' + opts + '</select></label><label class="field">Закончить перед заголовком<select name="endHeading">' + opts + '</select></label></div>' +
        (pv.figureModel ? '<p class="muted" style="font-size:15px">Найдено описаний рисунков, вставленных моделью при распознавании: ' + pv.figureModel + '. Они отделяются от текста автора.</p>' : '') +
        '<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="with_ai"' + (ai.ok ? '' : ' disabled') + '> Добавить пояснения локальной модели к шагам (помечаются «модель, не проверено»)' + (ai.ok ? '' : ' — ИИ недоступен') + '</label>' +
        '<button class="btn primary" style="justify-self:start">Собрать курс</button><p class="validation" role="status"></p></form>';
      $('[data-g]', box).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), v = $('.validation', e.target), b = e.target.querySelector('.btn'); b.disabled = true; v.textContent = f.get('with_ai') ? 'Сборка с пояснениями модели может занять несколько минут…' : 'Сборка…';
        const range = f.get('pageFrom') && f.get('pageTo') ? ', стр. ' + f.get('pageFrom') + '–' + f.get('pageTo') : '';
        const body = {document_id: id, title: (d.title || d.filename) + range, author: d.author, with_ai: !!f.get('with_ai'), startHeading: f.get('startHeading'), endHeading: f.get('endHeading')};
        if (f.get('pageFrom')) body.pageFrom = Number(f.get('pageFrom')); if (f.get('pageTo')) body.pageTo = Number(f.get('pageTo'));
        try {
          const g = await Api.post('/api/course-generation', body);
          v.innerHTML = 'Курс собран: ' + P.step(g.steps) + ', ' + P.task(g.tasks) + ', покрытие ' + g.coverage.covered + ' / ' + g.coverage.units + '. Узлов знаний: ' + g.layer.nodes + ' (подтверждены по тексту страницы: ' + g.layer.verified + '), ссылок на источник: ' + g.layer.references + '.' +
            (g.ai.requested ? ' Пояснений модели: ' + g.ai.done + (g.ai.error ? ' (ошибка: ' + esc(g.ai.error) + ')' : '') + '.' : '') + ' Статус — «на проверке».';
          await Catalog.reload(); listCourses(); listDocs();
        } catch (err) { v.textContent = err.message; b.disabled = false; }
      };
    } catch (err) { fail(box, err); }
  }
  async function listCourses() {
    const box = $('#course-list'); if (!box) return;
    try {
      const cs = await Api.get('/api/admin/courses');
      box.innerHTML = '<div class="card pad tbl-wrap"><table class="tbl"><thead><tr><th>Курс</th><th>Статус</th><th>Шаги / задания</th><th>Действия</th></tr></thead><tbody>' + cs.map(c =>
        '<tr data-c="' + esc(c.id) + '"><td><a class="link" href="#/course/' + esc(c.id) + '">' + esc(c.title) + '</a><br><small class="muted">' + esc(c.id) + (c.source !== 'builtin' ? ' · из документа, версия ' + c.version : ' · встроенный') + '</small></td>' +
        '<td><span class="chip ' + (c.status === 'published' ? 'green' : c.status === 'in_review' ? 'orange' : '') + '">' + esc(STATUS[c.status] || c.status) + '</span></td><td>' + c.steps.length + ' / ' + c.tasks.length + '</td><td class="acts">' +
        (c.status !== 'published' ? '<button class="btn primary small" data-pub>Опубликовать</button>' : '<button class="btn ghost small" data-arch>Снять</button>') +
        (c.status === 'in_review' ? '<button class="btn ghost small" data-rej>Вернуть</button>' : '') + (c.source !== 'builtin' ? '<button class="btn ghost small" data-know>Проверка источников</button>' : '') +
        '<button class="btn ghost small" data-route>Маршрутизация</button>' + (Api.isAdmin() ? '<button class="btn ghost small" data-rm style="color:var(--red)">' + icon('trash', 15) + '</button>' : '') + '</td></tr><tr class="sub" hidden><td colspan="4"></td></tr>').join('') + '</tbody></table></div>';
      $$('[data-c]', box).forEach(tr => {
        const id = tr.dataset.c, sub = tr.nextElementSibling;
        const review = async (decision, publish) => {
          const comment = decision === 'approved' ? '' : (prompt('Комментарий для автора курса (необязательно):') || '');
          try { await Api.post('/api/courses/' + encodeURIComponent(id) + '/review', {decision, publish, comment}); await Catalog.reload(); listCourses(); U.toast('Статус обновлён'); } catch (err) { U.toast(err.message); }
        };
        tr.querySelector('[data-pub]')?.addEventListener('click', () => review('approved', true));
        tr.querySelector('[data-rej]')?.addEventListener('click', () => review('rejected', false));
        tr.querySelector('[data-arch]')?.addEventListener('click', async () => { try { await Api.post('/api/admin/courses/' + encodeURIComponent(id) + '/archive'); await Catalog.reload(); listCourses(); } catch (err) { U.toast(err.message); } });
        tr.querySelector('[data-rm]')?.addEventListener('click', async () => { if (!confirm('Удалить курс «' + id + '» вместе с прогрессом учеников по нему? Отменить нельзя.')) return; try { await Api.del('/api/admin/courses/' + encodeURIComponent(id)); await Catalog.reload(); listCourses(); } catch (err) { U.toast(err.message); } });
        tr.querySelector('[data-route]').addEventListener('click', () => { sub.hidden = !sub.hidden; if (!sub.hidden) routingPanel(sub.firstElementChild, id); });
        tr.querySelector('[data-know]')?.addEventListener('click', async () => {
          sub.hidden = !sub.hidden; if (sub.hidden) return; const cell = sub.firstElementChild; cell.innerHTML = '<p class="muted">Загрузка…</p>';
          try {
            const [k, refs] = await Promise.all([Api.get('/api/knowledge?course_id=' + encodeURIComponent(id) + '&limit=60'), Api.get('/api/source-references?course_id=' + encodeURIComponent(id))]);
            const bad = refs.items.filter(r => r.validation !== 'source_verified').slice(0, 12);
            cell.innerHTML = '<p><b>Ссылки на источник:</b> ' + refs.total + ', подтверждены по тексту страницы: ' + (refs.byValidation.source_verified || 0) + ', не подтверждены: ' + (refs.total - (refs.byValidation.source_verified || 0)) + '.</p>' +
              '<p><b>Узлы знаний:</b> ' + Object.entries(k.byValidation).map(([a, n]) => esc(a) + ' — ' + n).join(', ') + '.</p>' +
              (bad.length ? '<details><summary style="cursor:pointer;font-weight:700">Не подтверждённые цитаты (' + bad.length + ')</summary><ul class="log">' + bad.map(r => '<li><span>стр. ' + esc(r.page ?? '—') + ': ' + esc(r.excerpt || r.claim) + '</span><b>' + esc(r.support) + '</b></li>').join('') + '</ul></details>' : '') +
              '<details><summary style="cursor:pointer;font-weight:700">Узлы (первые 60)</summary><ul class="log">' + k.nodes.map(n => '<li><span><b>' + esc(n.type) + '</b> · ' + esc(n.title) + (n.page ? ' · стр. ' + n.page : '') + (n.origin !== 'extracted' ? ' <span class="by model">' + esc(n.origin) + '</span>' : '') + '</span>' +
                (n.validation === 'approved' ? '<b>одобрен</b>' : '<button class="btn ghost small" data-ok="' + esc(n.id) + '">Одобрить</button>') + '</li>').join('') + '</ul></details>';
            $$('[data-ok]', cell).forEach(b => b.onclick = async () => { try { await Api.patch('/api/knowledge/' + encodeURIComponent(b.dataset.ok), {decision: 'approved'}); b.replaceWith(Object.assign(document.createElement('b'), {textContent: 'одобрен'})); } catch (err) { U.toast(err.message); } });
          } catch (err) { fail(cell, err); }
        });
      });
    } catch (err) { fail(box, err); }
  }

  /* Маршрутизация (шаг 2): баллы видеоёмкости 0–2 по пяти критериям ТЗ → формат узла. Формат выбирает код по порогам; эксперт может поправить. */
  const CRIT_SHORT = {time: 'время', invisible: 'невидимое', scale: 'масштаб', counterintuitive: 'контринтуитивно', cause_effect: 'причина→следствие'};
  async function routingPanel(cell, cid) {
    cell.innerHTML = '<p class="muted">Загрузка маршрутизации…</p>';
    let d;
    try { d = await Api.get('/api/courses/' + encodeURIComponent(cid) + '/routing'); } catch (err) { fail(cell, err); return; }
    const s = d.summary, cfg = d.config;
    const run = async useAi => {
      cell.querySelector('.validation').textContent = useAi ? 'Модель оценивает узлы по урокам (на бесплатном тарифе — несколько минут)…' : 'Разметка по правилам…';
      cell.querySelectorAll('[data-run]').forEach(b => b.disabled = true);
      try { const r = await Api.post('/api/courses/' + encodeURIComponent(cid) + '/routing', {use_ai: useAi}); U.toast('Маршрутизация готова: ИИ — уроков ' + r.ai_lessons + ', по правилам — ' + r.rules_lessons); routingPanel(cell, cid); }
      catch (err) { cell.querySelector('.validation').textContent = err.message; cell.querySelectorAll('[data-run]').forEach(b => b.disabled = false); }
    };
    cell.innerHTML = '<div class="route-head"><div><b>Шаг 2 конвейера — маршрутизация.</b> Каждый узел слоя знаний оценивается по пяти критериям видеоёмкости (0–2). ' +
      'Ролик, если сумма ≥ ' + cfg.video_min + ' и есть шаблон сцены; интерактив — от ' + cfg.interactive_min + ' при процессе или невидимом; длинное видео — от ' + cfg.long_min + '. Остальное — текст, практикум, карточки.</div>' +
      '<div class="acts"><button class="btn primary small" data-run="ai">' + icon('spark', 15) + ' Оценить с ИИ</button><button class="btn ghost small" data-run="rules">По правилам (без ИИ)</button>' +
      (s.routes ? '<a class="btn ghost small" href="/api/courses/' + encodeURIComponent(cid) + '/routing.json" download="routing_' + esc(cid) + '.json">routing.json</a><a class="btn ghost small" href="/api/courses/' + encodeURIComponent(cid) + '/template-coverage" download="template_coverage_' + esc(cid) + '.json">Покрытие шаблонами</a>' : '') + '</div><p class="validation" role="status"></p></div>' +
      (s.routes ? '<p style="margin:8px 0">' + Object.entries(s.by_format).filter(([, n]) => n).map(([f, n]) => '<span class="chip ' + (['шортс', 'длинное видео'].includes(f) ? 'accent' : f === 'интерактив' ? 'orange' : '') + '">' + esc(f) + ': ' + n + '</span>').join(' ') +
        ' <span class="muted">· крючков: ' + s.hooks + ' · нужен новый шаблон: ' + s.need_template + ' · ИИ ' + s.by_origin.ai + ', правила ' + s.by_origin.rules + ', эксперт ' + s.by_origin.expert + '</span></p>' +
        '<div class="tbl-wrap"><table class="tbl route-tbl"><thead><tr><th>Узел</th>' + Object.values(CRIT_SHORT).map(c => '<th title="' + esc(c) + '">' + esc(c) + '</th>').join('') + '<th>Σ</th><th>Формат</th><th>Шаблон</th><th></th></tr></thead><tbody>' +
        d.routes.map(r => '<tr data-r="' + r.id + '"' + (['шортс', 'длинное видео', 'интерактив'].includes(r.format) ? ' class="hot"' : '') + '><td><b>' + esc(r.title) + '</b><br><small class="muted">' + esc(r.type) + (r.page ? ' · стр. ' + r.page : '') + ' · ' + esc({ai: 'ИИ', rules: 'правила', expert: 'эксперт'}[r.origin]) + (r.hookShort ? ' · крючок' : '') + '</small>' +
          '<details><summary>почему</summary><p>' + esc(r.why) + '</p>' + Object.entries(r.evidence || {}).map(([k, q]) => '<p class="muted">' + esc(CRIT_SHORT[k] || k) + ': «' + esc(q) + '»</p>').join('') + (r.notes.length ? '<p class="note">' + r.notes.map(esc).join('<br>') + '</p>' : '') + '</details></td>' +
          Object.keys(CRIT_SHORT).map(k => '<td class="sc s' + (r.scores[k] || 0) + '">' + (r.scores[k] || 0) + '</td>').join('') + '<td><b>' + r.total + '</b></td>' +
          '<td><select data-f aria-label="Формат узла">' + d.formats.map(f => '<option' + (f === r.format ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select></td>' +
          '<td><select data-t aria-label="Шаблон сцены"><option value="">—</option>' + d.templates.map(t => '<option' + (t === r.template ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></td>' +
          '<td><button class="btn ghost small" data-save hidden>Сохранить</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted" style="margin-top:8px">Маршрутизация ещё не запускалась.</p>');
    cell.querySelector('[data-run="ai"]').onclick = () => run(true);
    cell.querySelector('[data-run="rules"]').onclick = () => run(false);
    $$('[data-r]', cell).forEach(tr => {
      const save = tr.querySelector('[data-save]');
      tr.querySelectorAll('select').forEach(sel => sel.onchange = () => { save.hidden = false; });
      save.onclick = async () => {
        try { await Api.patch('/api/routing/' + tr.dataset.r, {format: tr.querySelector('[data-f]').value, template: tr.querySelector('[data-t]').value || null}); U.toast('Сохранено: правка эксперта не затирается при повторном запуске'); routingPanel(cell, cid); }
        catch (err) { U.toast(err.message); }
      };
    });
  }

  /* ИИ: состояние, настройки, модели, проверка, журнал */
  async function ai(box) {
    box.innerHTML = '<p class="muted">Проверяем соединение с моделью…</p>';
    try {
      const [st, cfg, log] = await Promise.all([Api.get('/api/ai/status?force=true'), Api.get('/api/ai/settings'), Api.get('/api/admin/ai-log?limit=30')]);
      box.innerHTML = '<div class="grid g2" style="gap:16px"><div class="card pad"><h2 style="font-size:20px">Состояние</h2><p style="margin-top:8px"><span class="chip ' + (st.ok ? 'green' : 'orange') + '">' + (st.ok ? 'подключено' : 'недоступно') + '</span></p>' +
        '<ul class="log" style="margin-top:8px"><li><span>Провайдер</span><b>' + esc(st.provider) + '</b></li><li><span>Адрес</span><b>' + esc(st.base_url) + '</b></li><li><span>Модель</span><b>' + esc(st.model || cfg.model || 'первая из списка') + '</b></li>' +
        '<li><span>Последний успешный ответ</span><b>' + fmtDate(st.last_ok_at) + '</b></li></ul>' + (st.error ? '<p class="note" style="margin-top:10px">' + esc(st.error) + '</p>' : '') +
        (st.models?.length ? '<p class="muted" style="margin-top:8px;font-size:15px">Доступные модели: ' + st.models.map(esc).join(', ') + '</p>' : '') +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary small" data-test>Проверочный запрос</button><button class="btn ghost small" data-refresh>Обновить</button></div><p class="validation" id="ai-test" role="status"></p>' +
        '<p class="muted" style="font-size:14px;margin-top:10px">Браузер к модели не обращается: запросы идут через сервер STRATA. Порт модели (11434 у Ollama, 1234 у LM Studio) открывать в сеть не нужно.</p></div>' +
        '<form class="card pad form" data-ai><h2 style="font-size:20px">Настройки</h2><label class="field">Провайдер<select name="provider">' +
        [['gemini', 'Google AI Studio (Gemini, облако)'], ['openrouter', 'OpenRouter (облако)'], ['ollama', 'Ollama (локально)'], ['lmstudio', 'LM Studio (локально)'], ['openai', 'Другой OpenAI-совместимый сервер'], ['custom', 'Свой агент по HTTP'], ['none', 'Отключить ИИ']].map(([v, l]) => '<option value="' + v + '"' + (cfg.provider === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        (cfg.cloud ? '<div class="note">Облачный провайдер: текст урока и вопрос ученика отправляются ' + esc(cfg.provider === 'gemini' ? 'Google' : 'OpenRouter') + '. На бесплатном тарифе данные могут использоваться для обучения моделей.</div>' : '') +
        '<label class="field">Адрес API<input name="base_url" value="' + esc(cfg.base_url) + '" placeholder="пусто — адрес провайдера по умолчанию"><small>Для локальных моделей — обычно 127.0.0.1</small></label>' +
        '<label class="field">Модель<input name="model" list="models" value="' + esc(cfg.model) + '" placeholder="пусто — первая из списка"><datalist id="models">' + (st.models || []).map(m => '<option value="' + esc(m) + '">').join('') + '</datalist></label>' +
        '<div class="row2"><label class="field">Таймаут, с<input type="number" name="timeout" min="5" max="900" value="' + esc(cfg.timeout) + '"></label><label class="field">Путь чата агента<input name="agent_chat_path" value="' + esc(cfg.agent_chat_path) + '"><small>Только для «своего агента»</small></label></div>' +
        '<label class="field">Ключ API<input type="password" name="api_key" autocomplete="off" placeholder="' + (cfg.api_key_set ? 'сохранён на сервере — оставьте пустым' : 'не нужен для локальных моделей') + '"><small>Хранится только на сервере и никогда не возвращается в браузер</small></label>' +
        (cfg.api_key_set ? '<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="clear_api_key"> Удалить сохранённый ключ</label>' : '') +
        '<button class="btn primary" style="justify-self:start">Сохранить</button></form></div>' +
        '<section class="sec"><div class="card pad tbl-wrap"><h2 style="font-size:20px;margin-bottom:10px">Журнал обращений</h2>' + (log.length ? '<table class="tbl"><thead><tr><th>Время</th><th>Тип</th><th>Модель</th><th>Результат</th><th>мс</th></tr></thead><tbody>' +
          log.map(r => '<tr' + (r.ok ? '' : ' class="bad"') + '><td>' + fmtDate(r.at) + '</td><td>' + esc(r.kind) + '</td><td>' + esc(r.model || r.provider) + '</td><td>' + (r.ok ? 'ок' : esc(r.error)) + '</td><td>' + (r.latencyMs || '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">Обращений ещё не было.</p>') + '</div></section>';
      $('[data-refresh]', box).onclick = () => ai(box);
      $('[data-test]', box).onclick = async () => {
        const out = $('#ai-test', box); out.textContent = 'Отправляем запрос модели…';
        try { const r = await Api.post('/api/ai/test'); out.textContent = r.ok ? 'Ответ модели «' + r.model + '» за ' + r.latency_ms + ' мс: ' + r.reply : 'Не получилось: ' + r.error; } catch (err) { out.textContent = err.message; }
      };
      $('[data-ai]', box).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target);
        const body = {provider: f.get('provider'), base_url: f.get('base_url').trim() || null, model: f.get('model').trim(), timeout: Number(f.get('timeout')) || null, agent_chat_path: f.get('agent_chat_path').trim() || null, clear_api_key: !!f.get('clear_api_key')};
        if (f.get('api_key')) body.api_key = f.get('api_key');
        try { await Api.put('/api/ai/settings', body); U.toast('Настройки ИИ сохранены'); ai(box); } catch (err) { U.toast(err.message); }
      };
    } catch (err) { fail(box, err); }
  }

  /* Пользователи и роли */
  async function users(box) {
    try {
      const us = await Api.get('/api/admin/users');
      box.innerHTML = '<form class="card pad form" data-new><h2 style="font-size:20px">Новый пользователь</h2><div class="row2"><label class="field">Имя<input name="name" maxlength="80" required></label><label class="field">Почта<input name="email" type="email" required></label></div>' +
        '<div class="row2"><label class="field">Временный пароль<input name="password" type="password" minlength="8" autocomplete="new-password" required><small>Не короче 8 символов; пользователь сменит его в профиле</small></label><label class="field">Роль<select name="role"><option value="student">Ученик</option><option value="expert">Эксперт</option><option value="admin">Администратор</option></select></label></div>' +
        '<button class="btn primary" style="justify-self:start">Создать</button></form>' +
        '<section class="sec"><div class="card pad tbl-wrap"><table class="tbl"><thead><tr><th>Пользователь</th><th>Роль</th><th>Срок</th><th>Активен</th><th>Последний вход</th><th></th></tr></thead><tbody>' + us.map(u =>
          '<tr data-u="' + u.id + '"><td><b>' + esc(u.name) + '</b><br><small class="muted">' + esc(u.email) + '</small></td><td><select name="role">' + Object.entries(ROLE).map(([v, l]) => '<option value="' + v + '"' + (u.role === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td>' +
          '<td><input type="date" name="deadline" value="' + esc(u.deadline || '') + '"></td><td><input type="checkbox" name="active"' + (u.isActive ? ' checked' : '') + ' aria-label="Активен"></td><td>' + fmtDate(u.lastLogin) + '</td>' +
          '<td class="acts"><button class="btn ghost small" data-save>Сохранить</button>' + (u.id !== Api.user.id ? '<button class="btn ghost small" data-rm style="color:var(--red)">' + icon('trash', 15) + '</button>' : '') + '</td></tr>').join('') + '</tbody></table></div></section>';
      $('[data-new]', box).onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await Api.post('/api/admin/users', f); U.toast('Пользователь создан'); users(box); } catch (err) { U.toast(err.message); } };
      $$('[data-u]', box).forEach(tr => {
        const id = tr.dataset.u, q = n => tr.querySelector('[name="' + n + '"]');
        tr.querySelector('[data-save]').onclick = async () => {
          const d = q('deadline').value;
          try { await Api.patch('/api/admin/users/' + id, {role: q('role').value, is_active: q('active').checked, ...(d ? {deadline: d} : {clear_deadline: true})}); U.toast('Сохранено'); } catch (err) { U.toast(err.message); users(box); }
        };
        tr.querySelector('[data-rm]')?.addEventListener('click', async () => { if (!confirm('Удалить пользователя и весь его прогресс? Отменить нельзя.')) return; try { await Api.del('/api/admin/users/' + id); users(box); } catch (err) { U.toast(err.message); } });
      });
    } catch (err) { fail(box, err); }
  }

  /* Правила адаптивности и регистрация */
  async function rules(box) {
    try {
      const s = await Api.get('/api/admin/settings'), a = s.adaptive;
      box.innerHTML = '<form class="card pad form" data-rules><h2 style="font-size:20px">Адаптивные правила</h2><p class="muted">Скорость считается по активному времени относительно ожидаемого: медиана первых попыток других учеников (если их достаточно) или норматив по типу задания. Медленный ответ не снижает оценку — правила лишь предлагают практику.</p>' +
        '<div class="row2"><label class="field">«Быстро», доля ожидаемого времени<input type="number" step="0.05" min="0.05" max="0.95" name="fast_ratio" value="' + a.fast_ratio + '"></label><label class="field">«Медленно», доля ожидаемого времени<input type="number" step="0.1" min="1.1" max="9" name="slow_ratio" value="' + a.slow_ratio + '"></label></div>' +
        '<div class="row2"><label class="field">Ошибок подряд до совета вернуться к предыдущему шагу<input type="number" min="2" max="20" name="repeat_mistakes" value="' + a.repeat_mistakes + '"></label><label class="field">Подсказок в шаге до совета «объяснить иначе»<input type="number" min="2" max="50" name="repeat_hints" value="' + a.repeat_hints + '"></label></div>' +
        '<label class="field">Минимум первых попыток других учеников для медианы<input type="number" min="1" max="1000" name="min_peers" value="' + a.min_peers + '"></label><button class="btn primary" style="justify-self:start">Сохранить правила</button></form>' +
        '<div class="card pad" style="margin-top:16px"><h2 style="font-size:20px">Регистрация</h2><label style="display:flex;gap:10px;align-items:center;margin-top:10px"><input type="checkbox" data-reg' + (s.registration.open ? ' checked' : '') + '> Разрешить самостоятельную регистрацию учеников</label><p class="muted" style="font-size:15px;margin-top:6px">Если выключить, учётные записи создаёт администратор на вкладке «Пользователи».</p></div>';
      $('[data-rules]', box).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), body = {};
        for (const k of ['fast_ratio', 'slow_ratio', 'repeat_mistakes', 'repeat_hints', 'min_peers']) body[k] = Number(f.get(k));
        try { await Api.put('/api/admin/settings/adaptive', body); U.toast('Правила сохранены'); } catch (err) { U.toast(err.message); }
      };
      $('[data-reg]', box).onchange = async e => { try { await Api.put('/api/admin/settings/registration', {open: e.target.checked}); U.toast(e.target.checked ? 'Регистрация открыта' : 'Регистрация закрыта'); } catch (err) { U.toast(err.message); } };
    } catch (err) { fail(box, err); }
  }

  /* Сеть: адреса для подключения с других устройств */
  async function network(box) {
    try {
      const n = await Api.get('/api/system/network');
      box.innerHTML = '<div class="card pad"><h2 style="font-size:20px">Подключение из локальной сети</h2><p class="muted" style="margin-top:6px">Откройте один из адресов на другом устройстве той же сети (Wi-Fi или кабель). Адреса определяются при каждом запуске.</p>' +
        '<ul class="log" style="margin-top:10px">' + n.urls.map(u => '<li><a class="link" href="' + esc(u) + '">' + esc(u) + '</a></li>').join('') + '</ul>' +
        '<ul class="log" style="margin-top:10px"><li><span>Имя компьютера</span><b>' + esc(n.hostname) + '</b></li><li><span>Слушает все интерфейсы</span><b>' + (n.listensOnAllInterfaces ? 'да (' + esc(n.host) + ')' : 'нет — доступ только с этого компьютера') + '</b></li><li><span>Порт</span><b>' + n.port + '</b></li><li><span>База данных</span><b>' + esc(n.database) + '</b></li></ul>' +
        '<div class="note info" style="margin-top:12px">' + esc(n.note) + ' Брандмауэр Windows: разрешите входящие подключения только на TCP-порт ' + n.port + ' для частной сети (см. README). Порты базы данных и локальной модели открывать не нужно.</div></div>';
    } catch (err) { fail(box, err); }
  }
})();
