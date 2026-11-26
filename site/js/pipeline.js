/* STRATA ↔ конвейер «Глава → курс».
   • Данные: data/pipeline.js (window.PIPELINE) пишет сборщик конвейера: курсы в модели сайта и ролики с вопросом внутри.
     Раздел «Видео» показывает ролики конвейера вместо демонстрационной серии.
   • Сервер: если сайт открыт с сервера конвейера (node pipeline/server.mjs), на странице «Загрузить книгу» появляется
     сборка главы конвейером: модель, страницы, ход работы; готовый курс сразу открывается здесь. API — pipeline/API.md. */
(() => {
  'use strict';
  const {esc, icon, $} = U;
  const P = window.PIPELINE;
  if (P?.videos?.length) window.MEDIA = {...(window.MEDIA || {}), shorts: P.videos, long: null, fromPipeline: true};

  let server = null; // {current, providers}
  async function detect() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const r = await fetch('/api/providers', {headers: {Accept: 'application/json'}});
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j.providers) ? j : null;
    } catch { return null; }
  }
  const ready = detect().then(j => (server = j));

  // перечитать data/pipeline.js после сборки новой главы
  function reloadData() {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'data/pipeline.js?t=' + Date.now();
      s.onload = () => { if (window.PIPELINE?.videos?.length) window.MEDIA = {...window.MEDIA, shorts: window.PIPELINE.videos, long: null, fromPipeline: true}; resolve(true); };
      s.onerror = () => resolve(false);
      document.head.append(s);
    });
  }

  function providerOptions() {
    return server.providers.map(p => '<option value="' + esc(p.id) + '"' + (p.id === server.current ? ' selected' : '') + '>' + esc(p.label) + (p.available ? '' : ' — не настроена') + '</option>').join('');
  }

  async function mount(host) {
    await ready;
    if (!server || !host.isConnected) return;
    const box = document.createElement('section');
    box.className = 'card pad pl-box';
    box.innerHTML = '<span class="overline">Сервер конвейера</span><h2 style="font-size:22px;margin-top:4px">Собрать курс конвейером</h2>' +
      '<p class="muted" style="margin-top:6px">Глава уходит модели: шаги со ссылками на страницы и цитатами автора, задания пяти типов, проверки, маршрутизация. Готовый курс появится в каталоге этого сайта. Сборка в браузере ниже работает без модели.</p>' +
      '<form class="pl-form" id="pl-form">' +
      '<label>Файл главы (.md с метками страниц или .pdf)<input type="file" name="file" accept=".md,.txt,.pdf" required></label>' +
      '<div class="pl-row"><label>Страницы<input name="pages" placeholder="90-108"></label><label>Первая страница PDF<input name="pageStart" inputmode="numeric" placeholder="1"></label><label>Идентификатор<input name="id" placeholder="из имени файла"></label></div>' +
      '<div class="pl-row"><label>Автор<input name="author" placeholder="И. О. Фамилия"></label><label>Книга<input name="book"></label><label>Год<input name="year" inputmode="numeric"></label></div>' +
      '<div class="pl-row"><label>Модель<select name="provider" id="pl-provider">' + providerOptions() + '</select></label><label id="pl-cli" hidden>Модель CLI<select name="cliModel" id="pl-climodel"></select></label><label>Перезаписать ручные правки<select name="force"><option value="">нет</option><option value="1">да</option></select></label></div>' +
      '<p class="muted" id="pl-note" style="font-size:14px"></p>' +
      '<button class="btn primary" id="pl-go" type="submit">' + icon('upload', 18) + ' Собрать конвейером</button></form>' +
      '<div id="pl-job" hidden><div class="bar" style="margin-top:14px"><i id="pl-bar" style="width:0%"></i></div><ol class="pl-stages" id="pl-stages"></ol><p id="pl-msg" class="muted"></p><pre class="pl-log" id="pl-log"></pre></div>';
    const wrap = host.querySelector('.wrap') || host;
    const head = wrap.querySelector('.page-head');
    head ? head.after(box) : wrap.prepend(box);

    const sel = $('#pl-provider', box), cli = $('#pl-cli', box), cm = $('#pl-climodel', box), note = $('#pl-note', box), go = $('#pl-go', box);
    const show = () => {
      const p = server.providers.find(x => x.id === sel.value);
      cli.hidden = !p?.models; if (p?.models) cm.innerHTML = p.models.map(m => '<option value="' + esc(m.id) + '"' + (m.id === server.cliModel && sel.value === server.current ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('');
      note.textContent = p ? (p.available ? p.note || '' : 'Недоступна: ' + p.note) : '';
      go.disabled = !!p && !p.available;
    };
    sel.onchange = show; show();

    $('#pl-form', box).onsubmit = async e => {
      e.preventDefault(); go.disabled = true;
      const fd = new FormData(e.target);
      for (const [k, v] of [...fd]) if (v === '' || (v instanceof File && !v.size)) fd.delete(k);
      let job;
      try {
        const r = await fetch('/api/jobs', {method: 'POST', body: fd});
        job = await r.json();
        if (!r.ok) throw new Error(job.error || r.statusText);
      } catch (err) { note.innerHTML = '<b style="color:var(--red)">' + esc(err.message) + '</b>'; go.disabled = false; return; }
      $('#pl-job', box).hidden = false;
      const render = j => {
        $('#pl-bar', box).style.width = j.progress + '%';
        $('#pl-stages', box).innerHTML = j.stages.map(s => '<li data-s="' + esc(s.state) + '">' + esc(s.title) + '</li>').join('');
        $('#pl-msg', box).textContent = ({queued: 'В очереди', running: 'Идёт сборка', done: 'Готово', failed: 'Ошибка'})[j.state] + (j.message ? ': ' + j.message : '');
      };
      const log = $('#pl-log', box);
      render(job);
      const es = new EventSource('/api/jobs/' + encodeURIComponent(job.id) + '/events');
      es.addEventListener('job', ev => render(JSON.parse(ev.data)));
      es.addEventListener('log', ev => {
        const l = JSON.parse(ev.data); log.textContent += l.line + '\n'; log.scrollTop = 1e9;
        if (/запрос модели в очереди/.test(l.line)) $('#pl-msg', box).textContent = 'Запрос ждёт ответа в work/agent-queue: напишите Claude в чате Claude Code «ответь на очередь конвейера».';
      });
      es.addEventListener('end', async () => {
        es.close();
        const j = await fetch('/api/jobs/' + encodeURIComponent(job.id)).then(r => r.json());
        render(j);
        if (j.state !== 'done') { $('#pl-msg', box).innerHTML = '<b style="color:var(--red)">' + esc(j.error || 'Сборка не удалась') + '</b>'; go.disabled = false; return; }
        await reloadData(); await Catalog.reload();
        const id = j.result.chapterId;
        $('#pl-msg', box).innerHTML = 'Курс собран: ' + j.result.steps + ' шагов, ' + j.result.tasks + ' заданий, покрыто ' + j.result.coverage.covered + ' из ' + j.result.coverage.units + ' единиц главы. ' +
          '<a class="btn primary small" href="#/course/' + esc(id) + '">Открыть курс</a> <a class="btn ghost small" href="/api/jobs/' + esc(job.id) + '/report" target="_blank" rel="noopener">Отчёт проверок</a>';
        go.disabled = false;
      });
    };
  }

  window.Pipeline = {ready, mount, reloadData, get server() { return server; }};
})();
