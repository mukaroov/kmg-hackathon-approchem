(() => {
  'use strict';

  const STORAGE = 'kmg.team.reports.v1';
  const FORMAT = 'kmg-learning-report';
  let selected = null;
  let notice = '';
  let reports;
  function getReports() {
    if (reports) return reports;
    try { reports = JSON.parse(localStorage.getItem(STORAGE)) || {}; }
    catch { reports = {}; }
    return reports;
  }
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(getReports())); }
    catch { notice = 'Изменения доступны в этой вкладке. Браузеру не удалось сохранить их на устройстве.'; }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, chr => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[chr]));
  }
  function short(value, length = 180) { return String(value ?? '').trim().slice(0, length); }
  function dateOnly(value) {
    const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!match) return '';
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  function iso(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(+date) ? date.toISOString() : '';
  }
  function day(value) {
    return value ? new Date(value + 'T12:00:00').toLocaleDateString('ru', {day:'numeric',month:'short',year:'numeric'}) : 'Без срока';
  }
  function time(value) {
    const seconds = Math.round(value);
    return seconds >= 60 ? Math.floor(seconds / 60) + ' мин ' + (seconds % 60) + ' с' : seconds + ' с';
  }
  function percent(n, d) { return d ? Math.round(n * 100 / d) + '%' : '—'; }
  function cleanProfile(input) {
    if (!input || typeof input !== 'object' || !short(input.id) || !Array.isArray(input.completed) || !Array.isArray(input.events)) {
      throw new Error('В отчёте отсутствуют обязательные поля профиля.');
    }
    if (['__proto__','constructor','prototype'].includes(short(input.id))) throw new Error('Некорректный идентификатор профиля.');
    const events = input.events.filter(e => e && ['answer','video-answer'].includes(e.type) && typeof e.correct === 'boolean')
      .map(e => ({
        type:e.type, questionId:short(e.questionId), courseId:short(e.courseId), lessonId:short(e.lessonId),
        correct:e.correct, elapsed:Number.isFinite(e.elapsed) && e.elapsed >= 0 ? e.elapsed : null,
        hints:Math.max(0, Number(e.hints) || 0), attempt:Math.max(1, Number(e.attempt) || 1),
        response:short(Array.isArray(e.response) ? e.response.join(', ') : e.response, 300),
        ts:iso(e.ts ?? e.timestamp ?? e.at ?? e.time)
      }));
    return {id:short(input.id), name:short(input.name, 80) || 'Участник', last:short(input.last),
      completed:[...new Set(input.completed.filter(x => typeof x === 'string').map(x => short(x)))],
      deadline:dateOnly(input.deadline), events};
  }
  function curriculum() {
    // STRATA: шаги и задания всех курсов каталога, включая загруженные книги
    const lessons = new Map(), questions = new Map();
    for (const course of (window.Catalog ? Catalog.list() : [])) {
      for (const step of course.steps) {
        const path = course.id + '/' + step.id;
        lessons.set(path, {lesson: step, course});
        for (const q of Catalog.tasksOf(course, step.id)) questions.set(path + '/' + q.id, q);
      }
    }
    return {lessons, questions};
  }
  function progress(profile, library) {
    return profile.completed.filter(id => library.lessons.has(id)).length;
  }
  function stats(profile) {
    const answers = profile.events.filter(e => e.type === 'answer');
    const first = new Map();
    for (const a of answers) {
      const key = [a.courseId, a.lessonId, a.questionId].join('/');
      if (!first.has(key) || a.attempt < first.get(key).attempt) first.set(key, a);
    }
    return {answers, first:[...first.values()], right:[...first.values()].filter(e => e.correct).length};
  }
  function orderProfiles(local) {
    return [local, ...Object.values(getReports()).filter(r => r.profile && r.profile.id !== local.id).map(r => r.profile)];
  }
  function reportTitle(event, library) {
    const q = library.questions.get([event.courseId,event.lessonId,event.questionId].join('/'));
    if (q) return q.prompt || q.title || event.questionId;
    const video = window.MEDIA?.shorts?.find(s => s.id === event.questionId || 'short/' + s.id === event.questionId);
    return video ? video.question : event.questionId || 'Вопрос в видео';
  }
  function renderTable(profiles, library, localId) {
    return profiles.map(person => {
      const s = stats(person), steps = progress(person, library), isLocal = person.id === localId;
      return '<button type="button" class="tm-person '+ (selected === person.id ? 'tm-selected' : '') +'" data-person="'+ esc(person.id) +'" aria-pressed="'+ (selected === person.id) +'">'+
        '<span class="tm-avatar" aria-hidden="true">'+esc(person.name[0] || '•')+'</span><span class="tm-identity"><strong>'+esc(person.name)+'</strong><small>'+(isLocal ? 'Этот браузер' : 'Импортированный отчёт')+'</small></span>'+
        '<span class="tm-mini"><strong>'+steps+' / '+library.lessons.size+'</strong><small>шагов</small></span><span class="tm-mini"><strong>'+percent(s.right,s.first.length)+'</strong><small>сразу верно</small></span></button>';
    }).join('');
  }
  function records(person, library) {
    const events = person.events.slice().reverse();
    if (!events.length) return '<p class="tm-empty">После первого ответа здесь появятся вопрос, результат, подсказки и время.</p>';
    return '<div class="tm-attempts">'+events.map(e =>
      '<details><summary><span class="tm-dot '+ (e.correct ? 'tm-hit' : '') +'"></span><span>'+esc(reportTitle(e,library))+'</span><b>'+ (e.elapsed === null ? '—' : time(e.elapsed))+'</b></summary>'+
      '<div class="tm-details"><strong>'+ (e.correct ? 'Верно' : 'Ошибка') +'</strong> · '+(e.type === 'answer' ? 'Задание' : 'Выбор в шортсе')+' · Попытка '+esc(e.attempt)+' · Подсказок '+esc(e.hints)+
      (e.response ? '<p>Ответ участника: '+esc(e.response)+'</p>' : '')+'</div></details>').join('')+'</div>';
  }
  function difficulty(profiles, library) {
    const groups = new Map();
    for (const profile of profiles) for (const ev of stats(profile).first) {
      if (ev.elapsed === null) continue;
      const key = [ev.courseId,ev.lessonId,ev.questionId].join('/');
      if (!groups.has(key)) groups.set(key, {ev,times:[]});
      groups.get(key).times.push(ev.elapsed);
    }
    const sorted = [...groups.values()].map(({ev,times}) => {
      times.sort((a,b) => a-b);
      const mid = Math.floor(times.length / 2);
      return {ev,n:times.length,median:(times[mid] + times[Math.floor((times.length-1)/2)])/2};
    }).sort((a,b) => b.median - a.median).slice(0,3);
    return sorted.length ? '<p class="tm-note">Медиана активного времени первой попытки. При малом числе участников сравнение предварительное.</p><ol class="tm-ranking">'+
      sorted.map(row => '<li><span>'+esc(reportTitle(row.ev,library))+'<small>Участников: '+row.n+'</small></span><b>'+time(row.median)+'</b></li>').join('')+'</ol>' :
      '<p class="tm-empty">Для сравнения вопросов нужны первые попытки с измеренным временем.</p>';
  }
  function exportLocal(profile) {
    const report = {format:FORMAT,version:1,exportedAt:new Date().toISOString(),profile};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'kmg-report-'+profile.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)+'.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  async function importFiles(files, localId) {
    let accepted=0, skipped=0, failures=[];
    for (const f of files) {
      try {
        const item = JSON.parse(await f.text());
        if (item.format !== FORMAT || item.version !== 1 || !iso(item.exportedAt)) throw new Error('Нужен JSON-отчёт, экспортированный из кабинета.');
        const profile = cleanProfile(item.profile);
        const old = getReports()[profile.id];
        if (profile.id === localId || (old && old.exportedAt >= iso(item.exportedAt))) { skipped++; continue; }
        if (old?.assignedDeadline !== undefined) profile.deadline = old.assignedDeadline;
        getReports()[profile.id] = {profile, exportedAt:iso(item.exportedAt),assignedDeadline:old?.assignedDeadline};
        accepted++; selected=profile.id;
      } catch(err) { failures.push(f.name+' — '+(err instanceof SyntaxError ? 'некорректный JSON' : err.message)); }
    }
    notice = 'Добавлено или обновлено: '+accepted+'. Дубли и прежние версии: '+skipped+'. '+failures.join(' · ');
    if (accepted) persist();
    if (location.hash.startsWith('#/team')) window.renderTeam();
  }
  window.renderTeam = function() {
    const p = window.Portal, local = cleanProfile({...p.state, id:p.state.id || 'local'});
    const library = curriculum(), profiles = orderProfiles(local);
    const person = profiles.find(x => x.id === selected) || local; selected=person.id;
    const s = stats(person), last = library.lessons.get(person.last), active = profiles.filter(x => x.events.length || x.last || x.completed.length).length;
    const answered = profiles.reduce((sum,x) => sum + stats(x).first.length, 0);
    const view = document.getElementById('team-host') || document.getElementById('view');
    view.innerHTML = '<section class="tm-wrap"><header class="tm-head"><div><h1>Кабинет руководителя</h1><p>Прогресс команды, результаты и время на задания.</p></div><div class="tm-actions"><button type="button" id="tm-export">↓ Экспорт профиля</button><button type="button" id="tm-import">↑ Импорт отчётов</button><input type="file" id="tm-files" accept=".json,application/json" multiple hidden></div></header>'+
      '<p class="tm-notice" role="status">'+esc(notice)+'</p><div class="tm-metrics">'+[['Профили',profiles.length],['Начали обучение',active],['Первые ответы',answered]].map(([label,n]) => '<div><small>'+label+'</small><strong>'+n+'</strong></div>').join('')+'</div>'+
      '<div class="tm-grid"><section class="tm-panel"><h2>Сотрудники</h2><div class="tm-roster">'+renderTable(profiles,library,local.id)+'</div><p class="tm-note">Импортируйте отчёт с другого устройства, чтобы добавить сотрудника. Повторный импорт обновляет его профиль.</p></section>'+
      '<section class="tm-panel"><h2>'+esc(person.name)+'</h2><dl class="tm-dl"><div><dt>Учебные шаги</dt><dd>'+progress(person,library)+' из '+library.lessons.size+'</dd></div><div><dt>Верно с первой попытки</dt><dd>'+s.right+' из '+s.first.length+'</dd></div><div><dt>Последний шаг</dt><dd>'+esc(last?.lesson.title || 'Ещё не открыт')+'</dd></div></dl>'+
      '<form class="tm-deadline"><label>Срок прохождения<input aria-label="Срок прохождения" type="date" value="'+esc(person.deadline)+'"></label><button type="submit">Сохранить</button></form><small class="tm-note">'+(person.id===local.id ? 'Срок действует для текущего профиля.' : 'Срок импортированного профиля хранится в этом кабинете.')+'</small></section>'+
      '<section class="tm-panel"><h2>История ответов</h2>'+records(person,library)+'</section><section class="tm-panel"><h2>На что уходит время</h2>'+difficulty(profiles,library)+'</section></div></section>';
    view.querySelector('#tm-export').onclick = () => exportLocal(local);
    view.querySelector('#tm-import').onclick = () => view.querySelector('#tm-files').click();
    view.querySelector('#tm-files').onchange = e => importFiles([...e.target.files],local.id);
    view.querySelectorAll('[data-person]').forEach(b => b.onclick=() => { selected=b.dataset.person; notice=''; window.renderTeam(); view.querySelector('.tm-selected').focus(); });
    view.querySelector('.tm-deadline').onsubmit = e => {
      e.preventDefault(); const deadline=dateOnly(e.target.querySelector('input').value);
      notice='Срок сохранён. '+day(deadline)+'.';
      if (person.id === local.id) { p.state.deadline=deadline; p.save(); }
      else { getReports()[person.id].profile.deadline=deadline; getReports()[person.id].assignedDeadline=deadline; persist(); }
      window.renderTeam(); view.querySelector('.tm-deadline button').focus();
    };
  };
})();
