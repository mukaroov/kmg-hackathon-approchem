(() => {
  'use strict';

  let dispose = () => {};

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const symbols = {
    play: '<path d="m8 5 11 7-11 7z"/>', back: '<path d="m14 5-7 7 7 7"/>',
    next: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    stack: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    okay: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    screen: '<rect x="2" y="4" width="20" height="15" rx="3"/><path d="M8 22h8"/>',
    list: '<path d="M7 6h13M7 12h13M7 18h13"/><path d="M3 6h.2M3 12h.2M3 18h.2"/>'
  };
  const icon = name => '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + symbols[name] + '</svg>';
  const duration = seconds => {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  };
  const playRoute = id => '#/shorts/' + encodeURIComponent(id);

  function videoState(id) {
    const root = window.Portal.state;
    root.video ||= {};
    return root.video[id] ||= {position: 0, completed: false};
  }

  function status(id) {
    const data = videoState(id);
    if (data.completed) return 'Просмотрено';
    if (data.position > 1) return 'Продолжить';
    return 'Смотреть';
  }

  function catalog(host, media) {
    const clips = media.shorts || [];
    host.innerHTML = `<section class="wv-page">
      <div class="wv-head"><div><h1>${media.fromPipeline ? 'Видео' : 'Шортсы'}</h1><p>${media.fromPipeline ? 'Ролики, которые собрал конвейер по главам: шортсы 9:16 и разборы 16:9. В каждом — вопрос на предсказание с разбором ответа, субтитры и паспорт с источником каждой реплики.' : 'Короткие разборы с вопросом внутри каждого ролика.'}</p></div></div>
      <div class="wv-sectionline"><h2>${media.fromPipeline ? 'Ролики конвейера' : 'Интерактивная серия'}</h2><span>${media.fromPipeline ? U.plural(clips.length, ['ролик', 'ролика', 'роликов']) : clips.length + ' выпуска'}</span></div>
      <div class="wv-grid">${clips.map((clip, index) => {
        const data = videoState(clip.id);
        const pct = data.completed ? 100 : Math.min(100, Math.round(100 * (data.position || 0) / (clip.duration || 1)));
        return `<a class="wv-card" href="${playRoute(clip.id)}">
          <div class="wv-poster"><img alt="" src="${escape(clip.poster)}"><div class="wv-filmshade"></div>
          <span class="wv-part">${clip.courseTitle ? escape((clip.vertical === false ? '16:9 · ' : '9:16 · ') + clip.source) : 'Часть ' + (index + 1)}</span><span class="wv-roundplay">${icon(data.completed ? 'okay':'play')}</span>
          <span class="wv-runtime">${duration(clip.duration)}</span><span class="wv-progress" style="width:${pct}%"></span></div>
          <div class="wv-cardbody"><h3>${escape(clip.title)}</h3><p>${escape(clip.hook)}</p>
          <span class="wv-action">${status(clip.id)} ${icon('next')}</span></div></a>`;
      }).join('')}</div>
      ${media.long?.src ? `<div class="wv-sectionline"><h2>Подробный разбор</h2></div><a class="wv-longcard" href="#/video">
      <div class="wv-longposter"><img alt="" src="${escape(media.long.poster)}"><span class="wv-roundplay">${icon('play')}</span></div>
      <div><span class="wv-subline">${icon('screen')} Полный формат · ${duration(media.long.duration)}</span>
      <h3>${escape(media.long.title)}</h3><span class="wv-action">Открыть разбор ${icon('next')}</span></div></a>` : ''}
    </section>`;
  }

  function watch(host, media, clip, isLong) {
    const clips = media.shorts || [];
    const id = isLong ? 'long' : clip.id;
    const index = clips.findIndex(item => item.id === id);
    const state = videoState(id);
    let quizShowing = false;
    let answeredThisRun = state.selected != null && !state.completed;
    let startedAt = 0;
    let activeElapsed = 0;
    let ended = false;
    let queuedSaveAt = 0;
    let loaded = false;
    let suppressCheckpoint = false;
    let resumeOnReturn = false;
    const checkpoint = Number(clip.checkpoint);
    const hasQuestion = !isLong && Number.isFinite(checkpoint) && Array.isArray(clip.options) && clip.options.length > 1;
    const next = clips[index + 1];
    const wide = isLong || clip.vertical === false;
    const source = [clip.source, clip.sourcePage && !(String(clip.source || '').includes(String(clip.sourcePage))) ? 'стр. ' + clip.sourcePage : ''].filter(Boolean).join(' · ');
    host.innerHTML = `<section class="wv-page wv-watch">
      <a class="wv-back" href="#/shorts">${icon('back')} ${media.fromPipeline ? 'Все ролики' : 'Все шортсы'}</a>
      <div class="wv-head"><div><h1>${escape(clip.title)}</h1>
      <p class="wv-subline">${icon(wide ? 'screen':'stack')} ${isLong ? 'Полный разбор' : (clip.courseTitle ? (wide ? 'Разбор 16:9' : 'Шортс 9:16') + ' · ' + (index + 1) + ' из ' + clips.length : 'Часть ' + (index + 1) + ' из ' + clips.length)} <span>·</span> ${icon('clock')} ${duration(clip.duration)}</p></div></div>
      <div class="wv-layout ${wide ? 'wv-wide':''}"><div class="wv-stage ${wide ? 'wv-landscape':''}">
        <video playsinline preload="metadata" controls poster="${escape(clip.poster)}" aria-label="${escape(clip.title)}" src="${escape(clip.src)}">${clip.subtitles ? `<track kind="subtitles" srclang="ru" label="Русские субтитры" src="${escape(clip.subtitles)}" default>` : ''}</video>
        <div class="wv-overlay" hidden></div>
      </div><aside class="wv-sidebar"><h2>В этой серии</h2>
      <div class="wv-playlist">${clips.map((item, idx) => `<a class="wv-row${id === item.id ? ' wv-selected':''}" href="${playRoute(item.id)}" ${id === item.id ? 'aria-current="page"':''}>
        <img alt="" src="${escape(item.poster)}"><div><small>${item.courseTitle ? (item.vertical === false ? '16:9' : '9:16') + ' · ' + escape(item.source) : 'Часть ' + (idx+1)} · ${duration(item.duration)}</small><strong>${escape(item.title)}</strong></div>
        ${icon(videoState(item.id).completed ? 'okay':'play')}</a>`).join('')}</div>
      ${media.long?.src && !isLong ? `<a href="#/video" class="wv-source wv-more">${icon('screen')} <span>Полный разбор<br><b>${escape(media.long.title)}</b></span>${icon('next')}</a>` : ''}
      ${source ? `<p class="wv-source"><small>Источник</small><span>${escape(source)}</span></p>` : ''}
      ${clip.courseId && clip.stepId ? `<a href="#/step/${encodeURIComponent(clip.courseId)}/${encodeURIComponent(clip.stepId)}" class="wv-source wv-more">${icon('list')} <span>Шаг курса<br><b>${escape(clip.stepTitle || '')}</b></span>${icon('next')}</a>` : ''}
      ${clip.passport ? `<a href="${escape(clip.passport)}" target="_blank" rel="noopener" class="wv-source wv-more">${icon('screen')} <span>Паспорт ролика<br><b>источники, метки кадров, чек-лист физики</b></span>${icon('next')}</a>` : ''}
      </aside></div></section>`;
    const player = host.querySelector('video');
    const overlay = host.querySelector('.wv-overlay');
    const save = () => window.Portal.save();
    const now = () => performance.now();
    const trackTime = () => {
      if (startedAt) activeElapsed += (now() - startedAt) / 1000;
      startedAt = 0;
    };
    const box = (label, title, content) => {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="wv-dialog" role="group" aria-label="${escape(label)}"><small>${escape(label)}</small><h2>${escape(title)}</h2>${content}</div>`;
    };
    const attemptPlay = () => {
      const result = player.play();
      if (result?.catch) result.catch(() => {});
    };
    const resume = () => {
      overlay.querySelector('.wv-mini')?.pause();
      overlay.hidden = true;
      overlay.innerHTML = '';
      quizShowing = false;
      state.feedbackPending = false;
      save();
      player.controls = true;
      attemptPlay();
    };
    const showQuestion = () => {
      quizShowing = true;
      player.pause();
      player.controls = false;
      player.currentTime = checkpoint;
      state.position = checkpoint;
      save();
      startedAt = document.hidden ? 0 : now();
      activeElapsed = 0;
      box('Вопрос в видео', clip.question,
        '<div class="wv-options">' + clip.options.map((opt, i) => '<button type="button" data-answer="' + i + '"><span>' + (i+1) + '</span>' + escape(opt) + '</button>').join('') + '</div>');
      overlay.querySelector('button')?.focus({preventScroll:true});
    };
    function answer(i) {
      if (answeredThisRun || !quizShowing) return;
      answeredThisRun = true;
      trackTime();
      const correct = i === Number(clip.correct);
      const events = window.Portal.state.events || [];
      const key = 'short/' + id;
      const attempt = events.filter(e => e.type === 'video-answer' && e.questionId === key).length + 1;
      if (state.firstChoice == null) state.firstChoice = i;
      state.selected = i;
      state.feedbackPending = true;
      window.Portal.record({type:'video-answer', questionId:key, videoId:id, correct, elapsed:Math.round(activeElapsed), response:String(clip.options[i]), attempt});
      save();
      showFeedback(i);
      overlay.querySelector('.wv-mini')?.play()?.catch(() => {});
    }
    function showFeedback(i) {
      const correct = i === Number(clip.correct);
      quizShowing = true;
      player.controls = false;
      box(correct ? 'Ответ принят' : 'Разбор ответа', correct ? 'Верно' : 'Посмотрим внимательнее',
        '<p>' + escape(clip.feedback?.[i] || (correct ? 'Продолжите просмотр.' : clip.source)) + '</p>' +
        (!correct && clip.remedialSrc ? '<small class="wv-remedial-label">Видеопояснение</small><video class="wv-mini" aria-label="Видеопояснение к ответу" playsinline controls preload="metadata" src="' + escape(clip.remedialSrc) + '"></video>' : '') +
        '<button type="button" class="wv-primary" data-resume>Продолжить ' + icon('next') + '</button>');
      overlay.querySelector('button')?.focus({preventScroll:true});
    }
    const checkQuestion = () => {
      if (!ended && !suppressCheckpoint && loaded && hasQuestion && !quizShowing && !answeredThisRun && player.currentTime >= checkpoint) {
        showQuestion();
        return true;
      }
      return false;
    };
    const onMeta = () => {
      if (loaded) return;
      loaded = true;
      const t = state.completed ? 0 : Math.max(0, Number(state.position) || 0);
      if (t) player.currentTime = Math.min(t, player.duration || t);
      if (state.feedbackPending && state.selected != null) showFeedback(state.selected);
      else checkQuestion();
    };
    const onProgress = () => {
      if (!loaded || ended || quizShowing || checkQuestion()) return;
      if (now() - queuedSaveAt < 2000) return;
      queuedSaveAt = now();
      state.position = player.currentTime;
      save();
    };
    const onEnd = () => {
      if (checkQuestion()) return;
      ended = true;
      player.controls = false;
      state.completed = true;
      state.position = 0;
      window.Portal.record({type:'video-finish',videoId:id});
      save();
      box(isLong ? 'Разбор завершён' : 'Выпуск завершён', isLong || !next ? 'Просмотр завершён' : 'Следующая часть',
        (isLong || !next ? '' : '<p>' + escape(next.title) + '</p>') +
        '<a class="wv-primary" href="' + (isLong || !next ? '#/courses':playRoute(next.id)) + '">' + (isLong || !next ? 'К учебному маршруту':'Смотреть дальше') + ' ' + icon('next') + '</a>' +
        '<button class="wv-ghost" type="button" data-replay>Посмотреть ещё раз</button>');
    };
    const click = event => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-answer')) answer(Number(btn.dataset.answer));
      if (btn.hasAttribute('data-resume')) resume();
      if (btn.hasAttribute('data-replay')) {
        ended = false;
        answeredThisRun = false;
        suppressCheckpoint = true;
        player.currentTime = 0;
        suppressCheckpoint = false;
        resume();
      }
    };
    const visibility = () => {
      if (document.hidden) {
        trackTime();
        resumeOnReturn = !player.paused;
        player.pause();
      } else {
        if (quizShowing && !answeredThisRun) startedAt = now();
        if (resumeOnReturn && !quizShowing) attemptPlay();
        resumeOnReturn = false;
      }
    };
    const persist = () => {
      if (loaded && !ended) {
        state.position = player.currentTime;
        save();
      }
    };
    player.addEventListener('loadedmetadata', onMeta);
    player.addEventListener('timeupdate', onProgress);
    player.addEventListener('seeking', checkQuestion);
    player.addEventListener('pause', persist);
    player.addEventListener('ended', onEnd);
    player.addEventListener('error', () => {
      box('Видео', 'Не удалось открыть ролик', '<p>' + (media.fromPipeline ? 'Ролики конвейера лежат в папке dist рядом с папкой site: откройте сайт из репозитория целиком или с сервера конвейера.' : 'Проверьте, что папка assets/media находится рядом с файлом index.html.') + '</p><button type="button" data-reload class="wv-primary">Повторить</button>');
      overlay.querySelector('[data-reload]').onclick = () => { overlay.hidden = true; player.load(); };
    });
    if (player.readyState >= 1) onMeta();
    overlay.addEventListener('click', click);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', persist);
    dispose = () => {
      persist();
      player.pause();
      overlay.querySelector('.wv-mini')?.pause();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', persist);
      dispose = () => {};
    };
  }

  window.addEventListener('hashchange', () => {
    queueMicrotask(() => { if (!document.querySelector('#view .wv-watch')) dispose(); });
  });
  window.renderWatch = function renderWatch(parts) {
    dispose();
    const host = document.getElementById('watch-host') || document.getElementById('view');
    const media = window.MEDIA || {};
    const entity = parts[0] === 'video' ? media.long : (media.shorts || []).find(s => s.id === parts[1]);
    if (entity?.src) watch(host, media, entity, parts[0] === 'video');
    else catalog(host, media);
  };
})();
