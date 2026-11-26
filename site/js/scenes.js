/* STRATA · анимации из кода. Спецификация сцены (формат организаторов: template + params + beats) → SVG-кадры.
   Шаблон well_tool_curve: разрез, ствол, прибор на кабеле и треки кривых. Одно состояние (глубина прибора) двигает
   и прибор, и конец кривой; значение кривой считается из свойств слоёв с окном усреднения прибора.
   Цвета — из стайлгайда организаторов (03_стайлгайд/styleguide.json), фон тёмный. Озвучка — синтез речи браузера (по желанию). */
(() => {
  'use strict';
  const {esc, icon} = U;
  const SG = {
    bg: '#0F1419', panel: '#1A2129', text: '#ECEFF4', muted: '#8A96A3',
    lith: {sand: '#E8C872', shale: '#6B8E5A', limestone: '#7FB3D5', dolomite: '#A98FD1', anhydrite: '#D98CB3', salt: '#C9D6DF', dense: '#8C7B6B', reef: '#F0A35E'},
    fluid: {oil: '#2E8B57', gas: '#E74C3C', water: '#3498DB', filtrate: '#9BD7F5', mud: '#7A6A58'},
    curve: {SP: '#E74C3C', GR: '#2ECC71', RES: '#F1C40F', RES_SHALLOW: '#E67E22', NEUTRON: '#3498DB', DENSITY: '#E84393', SONIC: '#9B59B6', CALIPER: '#BDC3C7', PRESSURE: '#00CEC9'},
    tool: '#F1C40F', prov: {'реальные данные': '#27AE60', 'симуляция': '#2980B9', 'схема': '#8E44AD'}
  };
  const W = 1600, H = 900, Y0 = 150, Y1 = 730;

  /* Тайминг битов: длительность по длине реплики, пауза — отдельным битом. */
  function timeline(spec) {
    let t = 0;
    return spec.beats.map(b => { const d = b.say ? Math.max(2.4, b.say.length / 13) : (b.pause || 1.5); const r = {b, start: t, dur: d}; t += d; return r; });
  }
  /* Состояние сцены в момент t: глубина прибора, рамки, видимые треки, флаги. */
  function stateAt(spec, tl, t) {
    const p = spec.params, s = {tool: p.tool_start ?? p.depth_top, marks: [], shown: new Set(p.curves.filter(c => !c.hidden).map(c => c.key)), cake: !spec.beats.some(b => b.action?.show_mud_cake), inv: !spec.beats.some(b => b.action?.show_invasion), beat: 0};
    for (let i = 0; i < tl.length; i++) {
      const {b, start, dur} = tl[i];
      if (t < start) break;
      s.beat = i;
      const a = b.action || {}, k = Math.min(1, (t - start) / (dur * 0.7));
      if (a.tool_to != null) { const from = s.tool; s.tool = from + (a.tool_to - from) * (t >= start + dur ? 1 : ease(k)); }
      if (a.mark) s.marks.push(a.mark);
      if (a.show_curve) s.shown.add(a.show_curve);
      if (a.show_mud_cake) s.cake = true;
      if (a.show_invasion) s.inv = true;
    }
    return s;
  }
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

  /* Значение свойства на глубине d с усреднением по окну прибора. */
  function value(layers, prop, d, win) {
    const a = d - win / 2, b = d + win / 2; let sum = 0, len = 0;
    for (const l of layers) { const lo = Math.max(a, l.top), hi = Math.min(b, l.bottom); if (hi > lo && l.props[prop] != null) { sum += l.props[prop] * (hi - lo); len += hi - lo; } }
    return len ? sum / len : null;
  }

  function frame(spec, st, beat) {
    const p = spec.params, top = p.depth_top, bot = p.depth_bottom, y = d => Y0 + (d - top) / (bot - top) * (Y1 - Y0);
    const secX = 150, secW = 720, cx = secX + secW - 130, bw = Math.max(40, (p.bore_width || 0.35) * 260);
    const curves = p.curves.filter(c => st.shown.has(c.key)), trX = 930, trW = (W - 40 - trX) / Math.max(1, p.curves.length);
    let g = '<rect width="' + W + '" height="' + H + '" fill="' + SG.bg + '"/>';
    // заголовок и плашка «не в масштабе»
    g += '<text x="40" y="62" fill="' + SG.text + '" font-size="40" font-weight="700">' + esc(spec.title) + '</text>';
    g += '<text x="40" y="104" fill="' + SG.muted + '" font-size="22">' + esc((spec.plaque || []).join(' ')) + '</text>';
    // шкала глубин
    for (let d = Math.ceil(top / (p.depth_tick || 2)) * (p.depth_tick || 2); d <= bot; d += p.depth_tick || 2)
      g += '<line x1="' + (secX - 14) + '" x2="' + secX + '" y1="' + y(d) + '" y2="' + y(d) + '" stroke="' + SG.muted + '"/><text x="' + (secX - 20) + '" y="' + (y(d) + 7) + '" fill="' + SG.muted + '" font-size="20" text-anchor="end">' + d + '</text>';
    g += '<text x="40" y="' + (Y0 - 14) + '" fill="' + SG.muted + '" font-size="18">глубина, м</text>';
    // слои: литология + флюид в порах (точки)
    p.layers.forEach((l, i) => {
      const y1 = y(l.top), h = y(l.bottom) - y1;
      g += '<rect x="' + secX + '" y="' + y1 + '" width="' + secW + '" height="' + h + '" fill="' + (SG.lith[l.lith] || SG.lith.dense) + '"/>';
      if (l.fluid) g += '<rect x="' + secX + '" y="' + y1 + '" width="' + secW + '" height="' + h + '" fill="url(#pores-' + l.fluid + ')"/>';
      if (h >= 26) { const lw = Math.min(secW - 300, 16 + l.label.length * 11.5); g += '<rect x="' + (secX + 8) + '" y="' + (y1 + 6) + '" width="' + lw + '" height="30" rx="6" fill="#0F1419" opacity=".72"/><text x="' + (secX + 16) + '" y="' + (y1 + 28) + '" fill="#ECEFF4" font-size="20" font-weight="600"' + (lw - 16 < l.label.length * 11.5 ? ' textLength="' + (lw - 16) + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(l.label) + '</text>'; }
      if (st.inv && l.invasion_width) { const iw = l.invasion_width * 200; g += '<rect x="' + (cx - bw / 2 - iw) + '" y="' + y1 + '" width="' + (bw + 2 * iw) + '" height="' + h + '" fill="' + SG.fluid.filtrate + '" opacity=".55"/>'; }
      if (st.cake && l.mud_cake) g += '<rect x="' + (cx - bw / 2 - 7) + '" y="' + y1 + '" width="' + (bw + 14) + '" height="' + h + '" fill="' + SG.fluid.mud + '"/>';
    });
    // ствол, кабель, прибор
    g += '<rect x="' + (cx - bw / 2) + '" y="' + Y0 + '" width="' + bw + '" height="' + (Y1 - Y0) + '" fill="#2a3440"/>';
    const ty = y(st.tool);
    g += '<line x1="' + cx + '" x2="' + cx + '" y1="' + (Y0 - 20) + '" y2="' + (ty - 26) + '" stroke="' + SG.muted + '" stroke-width="2"/>';
    g += '<rect x="' + (cx - 11) + '" y="' + (ty - 26) + '" width="22" height="52" rx="6" fill="' + SG.tool + '"/>';
    g += '<line x1="' + secX + '" x2="' + (W - 40) + '" y1="' + ty + '" y2="' + ty + '" stroke="' + SG.tool + '" stroke-dasharray="4 8" opacity=".55"/>';
    // треки кривых: конец кривой всегда на глубине прибора
    p.curves.forEach((c, k) => {
      const x0 = trX + k * trW + 10, w = trW - 20, col = SG.curve[c.key] || SG.text, on = st.shown.has(c.key);
      g += '<rect x="' + x0 + '" y="' + Y0 + '" width="' + w + '" height="' + (Y1 - Y0) + '" fill="' + SG.panel + '" opacity="' + (on ? 1 : 0.35) + '"/>';
      g += '<text x="' + x0 + '" y="' + (Y0 - 34) + '" fill="' + (on ? col : SG.muted) + '" font-size="22" font-weight="700">' + esc(c.label) + '</text><text x="' + x0 + '" y="' + (Y0 - 10) + '" fill="' + SG.muted + '" font-size="18">' + c.min + '–' + c.max + ' ' + esc(c.unit) + '</text>';
      if (!on) return;
      const pts = [];
      for (let d = top; d <= st.tool + 1e-9; d += (bot - top) / 300) { const v = value(p.layers, c.prop, d, p.tool_resolution_m || 0.5); if (v != null) pts.push((x0 + U.clamp((v - c.min) / (c.max - c.min), 0, 1) * w).toFixed(1) + ',' + y(d).toFixed(1)); }
      if (pts.length > 1) g += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linejoin="round"/>';
    });
    // рамки
    for (const m of st.marks) g += '<rect x="' + (secX - 4) + '" y="' + y(m.top) + '" width="' + (W - 36 - secX) + '" height="' + (y(m.bottom) - y(m.top)) + '" fill="none" stroke="' + SG.text + '" stroke-width="3" stroke-dasharray="14 8"/>';
    // метка происхождения и подпись бита
    const lab = beat.label || 'симуляция';
    g += '<rect x="' + (W - 330) + '" y="30" width="290" height="44" rx="22" fill="' + (SG.prov[lab] || SG.prov['схема']) + '"/><text x="' + (W - 185) + '" y="60" fill="#fff" font-size="22" font-weight="700" text-anchor="middle">' + esc(lab) + ' · класс ' + esc(beat.frame_class || 'B') + '</text>';
    g += '<rect x="0" y="' + (Y1 + 20) + '" width="' + W + '" height="' + (H - Y1 - 20) + '" fill="#0B1015"/>';
    g += '<text x="' + W / 2 + '" y="' + (Y1 + 92) + '" fill="' + (beat.question ? '#E6A36A' : SG.text) + '" font-size="46" font-weight="800" text-anchor="middle">' + esc(beat.on_screen || '') + '</text>';
    const defs = '<defs>' + Object.entries(SG.fluid).map(([k, c]) => '<pattern id="pores-' + k + '" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r="3" fill="' + c + '"/><circle cx="14" cy="14" r="2.4" fill="' + c + '"/></pattern>').join('') + '</defs>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title + '. ' + (beat.on_screen || '')) + '">' + defs + g + '</svg>';
  }

  function mount(host, spec) {
    const tl = timeline(spec), total = tl.at(-1).start + tl.at(-1).dur;
    let t = 0, playing = false, last = 0, raf = 0, voice = false, spoken = -1;
    host.innerHTML = '<div class="scene"><div class="scene-stage"></div><p class="scene-say" aria-live="polite"></p>' +
      '<div class="scene-ctl"><button class="btn primary small" data-a="play"></button><button class="btn ghost small" data-a="prev" aria-label="Предыдущий бит">' + icon('back', 16) + '</button><button class="btn ghost small" data-a="next" aria-label="Следующий бит">' + icon('arrow', 16) + '</button>' +
      '<input type="range" min="0" max="' + Math.round(total * 10) + '" value="0" aria-label="Время сцены"><span class="scene-time"></span>' +
      ('speechSynthesis' in window ? '<label class="scene-voice"><input type="checkbox" data-a="voice"> озвучка</label>' : '') + '</div></div>';
    const stage = host.querySelector('.scene-stage'), say = host.querySelector('.scene-say'), range = host.querySelector('input[type=range]'), time = host.querySelector('.scene-time'), btn = host.querySelector('[data-a=play]');
    function draw() {
      const st = stateAt(spec, tl, t), b = tl[st.beat].b;
      stage.innerHTML = frame(spec, st, b);
      say.innerHTML = esc(b.say || '…') + (b.page ? ' <span class="pgn">(стр. ' + esc(b.page) + ')</span>' : '') + (b.kind === 'inference' ? ' <span class="chip orange">вывод, не слова главы</span>' : '');
      range.value = Math.round(t * 10); time.textContent = Math.floor(t) + ' / ' + Math.round(total) + ' с';
      btn.innerHTML = icon(playing ? 'close' : 'play', 16) + (playing ? ' Пауза' : t >= total ? ' Сначала' : ' Смотреть');
      if (voice && playing && st.beat !== spoken) { spoken = st.beat; speechSynthesis.cancel(); if (b.say) { const u = new SpeechSynthesisUtterance(b.say); u.lang = 'ru-RU'; speechSynthesis.speak(u); } }
    }
    function loop(now) { if (!playing) return; t = Math.min(total, t + (now - last) / 1000); last = now; if (t >= total) playing = false; draw(); if (playing) raf = requestAnimationFrame(loop); }
    const play = () => { if (t >= total) { t = 0; spoken = -1; } playing = true; last = performance.now(); raf = requestAnimationFrame(loop); draw(); };
    const pause = () => { playing = false; cancelAnimationFrame(raf); if (voice) speechSynthesis.cancel(); draw(); };
    const jump = dir => { const i = stateAt(spec, tl, t).beat + dir, k = U.clamp(i, 0, tl.length - 1); t = tl[k].start + (dir > 0 ? 0.01 : 0); spoken = -1; draw(); };
    btn.onclick = () => playing ? pause() : play();
    host.querySelector('[data-a=prev]').onclick = () => jump(-1);
    host.querySelector('[data-a=next]').onclick = () => jump(1);
    range.oninput = () => { t = range.value / 10; spoken = -1; draw(); };
    const v = host.querySelector('[data-a=voice]'); if (v) v.onchange = () => { voice = v.checked; if (!voice) speechSynthesis.cancel(); };
    draw();
    return {destroy() { pause(); }};
  }

  /* Блок «Анимация» на странице шага: офлайн — window.SCENES; режим сервера — API, эксперту — генерация, правка JSON, публикация. */
  async function lessonBlock(box, course, step) {
    let scenes = [];
    const expert = Api.enabled() && Api.isExpert();
    if (Api.enabled()) { try { scenes = await Api.get('/api/lessons/' + encodeURIComponent(step.id) + '/scenes'); } catch (err) { box.innerHTML = '<p class="muted">Анимации не загрузились: ' + esc(err.message) + '</p>'; return; } }
    else scenes = (window.SCENES || []).filter(s => s.lesson_id === step.id).map(s => ({...s, status: 'published'}));
    const section = box.closest('section');
    if (!scenes.length && !expert) { section?.remove(); document.querySelector('[data-anchor="b-anim"]')?.remove(); return; }
    box.innerHTML = scenes.map((s, i) => '<div class="scene-item" data-i="' + i + '">' + (expert ? '<div class="scene-meta"><span class="chip ' + (s.status === 'published' ? 'green' : s.status === 'rejected' ? 'red' : 'orange') + '">' + ({published: 'опубликована', in_review: 'на проверке', rejected: 'отклонена'}[s.status] || s.status) + '</span>' +
      '<span class="muted">' + (s.origin === 'ai' ? 'создана ИИ' + (s.model ? ' · ' + esc(s.model) : '') : 'вручную') + '</span></div>' + (s.problems?.length ? '<div class="note"><b>Замечания проверки:</b><ul>' + s.problems.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></div>' : '') : '') +
      '<div class="scene-host"></div><div class="scene-video"></div>' + (s.spec.prediction_question ? '<p class="muted" style="margin-top:8px"><b>Вопрос перед развязкой:</b> ' + esc(s.spec.prediction_question) + '</p>' : '') +
      (s.spec.assumptions?.length ? '<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700">Что в сцене условно</summary><ul>' + s.spec.assumptions.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '') +
      (expert ? '<div class="scene-tools"><button class="btn ghost small" data-json>JSON</button>' + (s.status !== 'published' ? '<button class="btn primary small" data-pub>Опубликовать</button>' : '') + (s.status !== 'rejected' ? '<button class="btn ghost small" data-rej>Отклонить</button>' : '') +
        '<button class="btn ghost small" data-del style="color:var(--red)">' + icon('trash', 15) + '</button></div><div class="scene-edit" hidden><textarea spellcheck="false" aria-label="Спецификация сцены (JSON)"></textarea><button class="btn primary small" data-save>Сохранить и проверить</button></div>' : '') + '</div>').join('') +
      (expert ? '<div class="scene-gen"><button class="btn ghost" data-gen>' + icon('spark') + ' Сгенерировать анимацию по тексту шага (ИИ)</button><p class="validation" role="status"></p></div>' : '');
    const players = [];
    scenes.forEach((s, i) => {
      const el = box.querySelector('[data-i="' + i + '"]');
      const hostEl = el.querySelector('.scene-host');
      if (s.spec.template === 'well_tool_curve') {
        try { players.push(mount(hostEl, s.spec)); } catch (err) { hostEl.innerHTML = '<div class="note">Сцена не отрисована: ' + esc(err.message) + '</div>'; }
      } else hostEl.innerHTML = '<p class="muted">Шаблон «' + esc(s.spec.template) + '» без живого предпросмотра в браузере: смотрите собранный MP4.</p>';
      videoBlock(el.querySelector('.scene-video'), s, expert, () => lessonBlock(box, course, step));
      if (!expert) return;
      const act = async (fn, okMsg) => { try { await fn(); U.toast(okMsg); lessonBlock(box, course, step); } catch (err) { U.toast(err.message); } };
      el.querySelector('[data-pub]')?.addEventListener('click', () => act(() => Api.post('/api/scenes/' + encodeURIComponent(s.id) + '/review', {decision: 'approved'}), 'Анимация опубликована'));
      el.querySelector('[data-rej]')?.addEventListener('click', () => act(() => Api.post('/api/scenes/' + encodeURIComponent(s.id) + '/review', {decision: 'rejected'}), 'Анимация отклонена'));
      el.querySelector('[data-del]')?.addEventListener('click', () => { if (confirm('Удалить анимацию?')) act(() => Api.del('/api/scenes/' + encodeURIComponent(s.id)), 'Удалено'); });
      el.querySelector('[data-json]').onclick = () => { const ed = el.querySelector('.scene-edit'); ed.hidden = !ed.hidden; ed.querySelector('textarea').value = JSON.stringify(s.spec, null, 2); };
      el.querySelector('[data-save]').onclick = () => { let spec; try { spec = JSON.parse(el.querySelector('textarea').value); } catch (err) { U.toast('JSON с ошибкой: ' + err.message); return; } act(() => Api.put('/api/scenes/' + encodeURIComponent(s.id), {spec}), 'Сохранено, сцена снова на проверке'); };
    });
    const gen = box.querySelector('[data-gen]');
    if (gen) gen.onclick = async () => {
      const v = box.querySelector('.scene-gen .validation'); gen.disabled = true; v.textContent = 'Модель заполняет спецификацию, код проверяет её… (до минуты)';
      try { await Api.post('/api/scenes/generate', {lesson_id: step.id}); lessonBlock(box, course, step); }
      catch (err) { v.textContent = err.status === 503 ? 'ИИ недоступен: ' + (err.detail?.detail || err.message) : err.message; gen.disabled = false; }
    };
    lessonBlock.players = players;
  }

  /* MP4 и паспорт ролика: сборка на сервере (движок участника команды, приведённый к формату организаторов). */
  function videoBlock(box, s, expert, reload) {
    if (!Api.enabled()) return;
    const r = s.render || {status: 'none'}, base = '/api/scenes/' + encodeURIComponent(s.id);
    let html = '';
    if (r.status === 'done') html = '<video class="scene-mp4" controls preload="metadata" src="' + base + '/video?v=' + encodeURIComponent(r.at || '') + '"></video>' +
      '<p class="muted" style="font-size:16px">MP4 ' + esc(r.format || '') + ', ' + esc(r.duration || '') + ' с · <a class="link" href="' + base + '/passport" download>паспорт ролика (JSON)</a></p>';
    else if (r.status === 'queued' || r.status === 'rendering') html = '<p class="muted">Собирается MP4: ' + (r.progress || 0) + ' %…</p>';
    else if (r.status === 'failed' && expert) html = '<div class="note">Сборка не удалась: ' + esc(r.error || '') + '</div>';
    if (expert && !['queued', 'rendering'].includes(r.status)) html += '<button class="btn ghost small" data-render>' + icon('play', 15) + (r.status === 'done' ? ' Пересобрать MP4' : ' Собрать MP4 и паспорт') + '</button>';
    box.innerHTML = html;
    const b = box.querySelector('[data-render]');
    if (b) b.onclick = async () => { b.disabled = true; try { await Api.post(base + '/render', {fps: 24}); reload(); } catch (err) { U.toast(err.message); b.disabled = false; } };
    if (['queued', 'rendering'].includes(r.status)) setTimeout(async () => {
      if (!document.body.contains(box)) return;
      try { const list = await Api.get('/api/lessons/' + encodeURIComponent(s.lessonId) + '/scenes'); const fresh = list.find(x => x.id === s.id); if (fresh) videoBlock(box, fresh, expert, reload); } catch { /* повтор при следующем открытии */ }
    }, 3000);
  }

  window.Scenes = {mount, lessonBlock, timeline, stateAt, value};
})();
