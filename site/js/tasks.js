/* STRATA · задания шага. Пять типов task.schema.json: single, multiple, order (перетаскивание пальцем и кнопками), gap, calc.
   Проверка сразу; после проверки виден верный ответ, пояснение и страница книги.
   Сигналы обучения в событии: correct, response, elapsed (активное время), idle (простой), changes (смены ответа), hints, attempt. */
(() => {
  'use strict';
  const {esc, icon, $, $$} = U;
  const IDLE_AFTER = 30000; // мс без действий — время перестаёт считаться активным
  const LETTERS = 'АБВГДЕЖЗ';
  const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,;:!?()]/g, '').replace(/\s+/g, ' ').trim();
  const typeName = {single: 'Один ответ', multiple: 'Несколько ответов', order: 'Порядок', gap: 'Пропуск в тексте', calc: 'Расчёт'};

  function gapMatch(given, want, accepted = []) {
    const g = norm(given);
    return [want, ...accepted].some(w => {
      const n = norm(w); if (!n) return false;
      if (g === n) return true;
      // допуск на окончание: совпадает основа слова (не короче 5 букв)
      const stem = n.length >= 6 ? n.slice(0, Math.max(5, n.length - 2)) : n;
      return n.length >= 6 && g.startsWith(stem) && Math.abs(g.length - n.length) <= 3;
    });
  }
  function answerText(t) {
    if (t.answer == null) return '';   // режим сервера: ключ приходит только после попытки
    const byId = id => t.options?.find(o => o.id === id)?.text ?? id;
    if (t.type === 'single') return byId(t.answer);
    if (t.type === 'multiple') return t.answer.map(byId).join('; ');
    if (t.type === 'order') return t.answer.map(byId).join(' → ');
    if (t.type === 'gap') return t.answer.join(', ');
    return t.answer + (t.unit ? ' ' + t.unit : '');
  }

  function mount(host, course, step, opts = {}) {
    const all = Catalog.tasksOf(course, step.id);
    const S = {queue: [], i: 0, fb: null, sel: [], order: [], inputs: [], changes: 0, hints: 0, reply: '', helpOpen: false, rewards: [], busy: false, byModel: false};
    const server = !!course.server && Api.enabled();
    const last = id => Catalog.answers(course, step.id).filter(e => e.questionId === id).at(-1);
    const attempts = id => Catalog.answers(course, step.id).filter(e => e.questionId === id).length;
    let clock = null;

    function start(retryMissed) {
      const unseen = all.filter(t => !last(t.id)), missed = all.filter(t => last(t.id) && !last(t.id).correct);
      S.queue = retryMissed && missed.length ? missed : unseen.length ? unseen : all;
      S.i = 0; S.rewards = []; reset(); render();
    }
    function reset() {
      const t = S.queue[S.i];
      S.fb = null; S.sel = []; S.inputs = []; S.changes = 0; S.hints = 0; S.reply = ''; S.byModel = false; S.busy = false;
      S.order = t?.type === 'order' ? t.options.map(o => o.id) : [];
      clock = {acc: 0, start: performance.now(), lastInput: performance.now(), idle: 0};
    }
    function tick() { // переводит прошедшее время в активное или простой
      if (!clock || clock.start == null) return;
      const now = performance.now();
      const sinceInput = now - clock.lastInput;
      const span = now - clock.start;
      const idlePart = Math.max(0, Math.min(span, sinceInput - IDLE_AFTER));
      clock.acc += span - idlePart; clock.idle += idlePart; clock.start = now;
    }
    const touch = () => { if (clock) { tick(); clock.lastInput = performance.now(); } };
    const vis = () => { if (!clock) return; if (document.hidden) { tick(); clock.start = null; } else { clock.start = performance.now(); clock.lastInput = performance.now(); } };
    document.addEventListener('visibilitychange', vis);
    host.addEventListener('pointerdown', touch); host.addEventListener('keydown', touch);

    function header(t) {
      return '<div class="q-head"><span class="overline">Задание ' + (S.i + 1) + ' из ' + S.queue.length + '</span><span class="chip">' + esc(typeName[t.type]) + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(100 * (S.i + (S.fb ? 1 : 0)) / S.queue.length) + '%"></i></div>';
    }
    function body(t) {
      const locked = !!S.fb;
      if (t.type === 'single' || t.type === 'multiple') {
        return '<p class="q-prompt">' + U.richText(t.prompt) + '</p><div class="opts" role="group" aria-label="Варианты ответа">' + t.options.map((o, k) => {
          let cls = '';
          if (locked) { const right = t.type === 'single' ? o.id === t.answer : t.answer.includes(o.id); if (right) cls = 'right'; else if (S.sel.includes(o.id)) cls = 'wrong'; }
          return '<button type="button" class="opt ' + cls + '" data-opt="' + esc(o.id) + '" aria-pressed="' + S.sel.includes(o.id) + '"' + (locked ? ' disabled' : '') + '><span>' + LETTERS[k] + '</span>' + U.richText(o.text) + '</button>';
        }).join('') + '</div>' + (t.type === 'multiple' ? '<p class="muted" style="margin-top:8px;font-size:15px">Отметьте все верные варианты.</p>' : '');
      }
      if (t.type === 'order') {
        const byId = id => t.options.find(o => o.id === id);
        return '<p class="q-prompt">' + U.richText(t.prompt) + '</p><p class="muted" style="font-size:15px;margin:-6px 0 10px">Перетащите карточки за значок слева или используйте стрелки.</p><ol class="order-list">' + S.order.map((id, k) =>
          '<li class="order-item" data-id="' + esc(id) + '"><span class="grip" aria-hidden="true">' + icon('grip', 20) + '</span><span>' + U.richText(byId(id).text) + '</span><span class="mv">' +
          '<button type="button" data-mv="-1" aria-label="Поднять выше"' + (k === 0 || locked ? ' disabled' : '') + '>' + icon('up', 16) + '</button>' +
          '<button type="button" data-mv="1" aria-label="Опустить ниже"' + (k === S.order.length - 1 || locked ? ' disabled' : '') + '>' + icon('down', 16) + '</button></span></li>').join('') + '</ol>';
      }
      if (t.type === 'gap') {
        let n = 0;
        const html = U.esc(t.prompt).replace(/\{\{(\d+)\}\}/g, () => { const k = n++; return '<input aria-label="Пропуск ' + (k + 1) + '" data-gap="' + k + '" value="' + esc(S.inputs[k] || '') + '" autocomplete="off"' + (locked ? ' disabled' : '') + '>'; });
        return '<p class="gap-text">' + html + '</p>';
      }
      return '<p class="q-prompt">' + U.richText(t.prompt) + '</p><div class="calc"><label class="sr" for="calc-in">Ответ числом</label><input id="calc-in" inputmode="decimal" autocomplete="off" placeholder="Число" value="' + esc(S.inputs[0] || '') + '"' + (locked ? ' disabled' : '') + '>' + (t.unit ? '<b>' + esc(t.unit) + '</b>' : '') + '</div>';
    }
    function feedback(t) {
      if (!S.fb) return '';
      const page = t.page ? '<button type="button" class="pg" data-page="' + esc(t.page) + '">стр. ' + esc(t.page) + '</button>' : '';
      return '<div class="fb' + (S.fb.correct ? '' : ' bad') + '" role="status"><strong>' + (S.fb.correct ? 'Верно' : 'Разберём ответ') + '</strong>' + esc(t.explanation || '') +
        '<p style="margin-top:6px"><b>Верный ответ:</b> ' + U.richText(answerText(t)) + ' ' + page + '</p>' +
        (t.quote ? '<p class="muted" style="margin-top:6px;font-size:15px">«' + U.richText(t.quote) + '»</p>' : '') +
        (S.fb.rec && S.fb.rec.code !== 'neutral' ? '<div class="rec"><b>' + icon('bulb', 16) + ' Рекомендация</b><p>' + esc(S.fb.rec.message) + '</p>' +
          (S.fb.rec.lessons?.length ? '<p>' + S.fb.rec.lessons.map(l => '<a class="link" href="#/step/' + esc(course.id) + '/' + esc(l.id) + '">' + esc(l.title) + '</a>').join(', ') + '</p>' : '') +
          '<small class="muted">' + esc(S.fb.rec.note || '') + '</small></div>' : '') + '</div>';
    }
    function results() {
      const right = all.filter(t => last(t.id)?.correct).length, wrong = all.filter(t => last(t.id) && !last(t.id).correct).length;
      const idx = course.steps.indexOf(step), next = course.steps[idx + 1];
      const rw = S.rewards.length ? '<div class="reward">' + S.rewards.map(r => '<span>+' + r.amount + ' XP · ' + esc(r.reason) + '</span>').join('') + '</div>' : '';
      return '<div class="card pad quiz"><span class="overline">Итог шага</span><h2 style="margin-top:6px">' + right + ' из ' + all.length + ' верно</h2>' +
        '<p class="muted" style="margin-top:6px">Учитывается последняя попытка по каждому заданию.' + (wrong ? ' Осталось разобрать: ' + U.P.task(wrong) + '.' : ' Все задания решены.') + '</p>' + rw +
        '<div class="q-foot">' + (wrong ? '<button class="btn primary" data-act="retry">' + icon('target') + ' Разобрать ошибки</button>' : '') +
        (next ? '<a class="btn ' + (wrong ? 'ghost' : 'primary') + '" href="#/step/' + esc(course.id) + '/' + esc(next.id) + '">Следующий шаг ' + icon('arrow') + '</a>' : '<a class="btn ghost" href="#/course/' + esc(course.id) + '">К маршруту курса ' + icon('arrow') + '</a>') +
        '<button class="btn ghost" data-act="again">Пройти заново</button></div></div>';
    }
    function helpPane(t) {
      if (!S.helpOpen) return '<button type="button" class="btn ghost small" data-act="help">' + icon('bulb') + ' Подсказка</button>';
      return '<div class="help card pad" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + icon('spark') + ' Помощник шага</b><button class="icon-btn" style="width:34px;height:34px" data-act="help" aria-label="Закрыть помощника">' + icon('close', 16) + '</button></div>' +
        '<p class="help-msg" aria-live="polite">' + esc(S.reply || 'Помощник ведёт к ответу, а не называет его. Попросите ориентир или спросите, где прочитать.') + (S.byModel ? ' <span class="by model">модель</span>' : '') + '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" data-act="hint">' + (S.hints ? 'Ещё подсказка' : 'Дать ориентир') + '</button><button class="btn ghost small" data-act="where">Где прочитать?</button></div>' +
        '<form class="ask" data-ask><label class="sr" for="ask-in">Вопрос по шагу</label><input id="ask-in" maxlength="300" placeholder="Спросить по тексту шага…" required><button class="btn primary small" aria-label="Спросить">' + icon('arrow', 16) + '</button></form>' +
        '<small class="muted">' + (server ? 'Помощник работает на локальной модели STRATA и опирается на страницы книги. Его ответы не проверены экспертом.' : 'Офлайн: подсказки из текста шага') + '</small></div>';
    }
    function hintText(t, level) {
      const ans = norm(answerText(t));
      const leak = h => ans && ans.length > 2 && norm(h).includes(ans);
      const own = (step.hints || []).filter(h => !leak(h));
      const fall = [
        'Сначала определите, что спрашивают: наблюдение, вывод автора или порядок действий.',
        t.page ? 'Ответ есть в тексте шага на стр. ' + t.page + '. Найдите абзац с этой страницей.' : 'Ответ есть в тексте шага. Перечитайте блок «Как это работает».',
        'Сопоставьте ключевые слова задания с формулировками автора; ответ опирается на одно конкретное предложение.'
      ];
      const list = [...own, ...fall];
      return list[Math.min(level, list.length - 1)];
    }
    function askLocal(q, t) {
      const ws = norm(q).split(' ').filter(w => w.length >= 4).map(w => w.slice(0, 5));
      const ans = t ? norm(answerText(t)) : '';
      const sents = step.blocks.how?.flatMap(p => (p.text.match(/[^.!?]+[.!?]/g) || []).map(s => ({s: s.trim(), page: p.page}))) || [];
      const scored = sents.filter(x => !(ans && ans.length > 2 && norm(x.s).includes(ans))).map(x => ({...x, k: ws.filter(w => norm(x.s).includes(w)).length})).sort((a, b) => b.k - a.k);
      return scored[0]?.k ? scored[0].s + ' (стр. ' + scored[0].page + ')' : 'В тексте шага прямого ответа на этот вопрос нет. ' + hintText(t || {}, S.hints);
    }

    function render() {
      if (!all.length) { host.innerHTML = '<div class="empty">В этом шаге нет заданий.</div>'; return; }
      if (S.i >= S.queue.length) { clock = null; host.innerHTML = results(); bind(); return; }
      const t = S.queue[S.i];
      host.innerHTML = '<div class="card pad quiz" ' + (S.fb ? '' : 'data-live') + '>' + header(t) + body(t) + feedback(t) +
        '<div class="q-foot">' + (S.fb ? '<button class="btn primary" data-act="next">' + (S.i === S.queue.length - 1 ? 'Посмотреть итог' : 'Дальше') + ' ' + icon('arrow') + '</button>' :
        '<button class="btn primary" data-act="check">Проверить ответ</button><span class="validation" role="status"></span>') + '</div>' +
        '<div style="margin-top:14px">' + (S.fb ? '' : helpPane(t)) + '</div></div>';
      bind();
    }
    function bind() {
      const t = S.queue[S.i];
      $$('[data-opt]', host).forEach(b => b.onclick = () => {
        const id = b.dataset.opt; S.changes++;
        S.sel = t.type === 'single' ? [id] : S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id];
        $$('[data-opt]', host).forEach(x => x.setAttribute('aria-pressed', String(S.sel.includes(x.dataset.opt))));
      });
      $$('[data-gap]', host).forEach(inp => inp.oninput = () => { S.inputs[Number(inp.dataset.gap)] = inp.value; S.changes++; });
      const ci = $('#calc-in', host); if (ci) { ci.oninput = () => { S.inputs[0] = ci.value; }; ci.onchange = () => S.changes++; ci.onkeydown = e => { if (e.key === 'Enter') check(); }; }
      $$('[data-gap]', host).forEach(inp => inp.onkeydown = e => { if (e.key === 'Enter') check(); });
      $$('[data-mv]', host).forEach(b => b.onclick = () => {
        const li = b.closest('[data-id]'), k = S.order.indexOf(li.dataset.id), j = k + Number(b.dataset.mv);
        if (j < 0 || j >= S.order.length) return;
        [S.order[k], S.order[j]] = [S.order[j], S.order[k]]; S.changes++; render();
        $$('[data-id]', host)[j]?.querySelector('[data-mv="' + b.dataset.mv + '"]')?.focus();
      });
      if (t?.type === 'order' && !S.fb) dragOrder();
      $$('[data-page]', host).forEach(b => b.onclick = () => opts.openPage?.(Number(b.dataset.page), t?.quote));
      const act = {
        check, next: () => { S.i++; reset(); render(); }, retry: () => start(true), again: () => start(false),
        help: () => { S.helpOpen = !S.helpOpen; render(); },
        hint: async () => { S.hints++;
          if (!server) { S.reply = hintText(t, S.hints - 1); render(); return; }
          S.reply = 'Помощник думает…'; S.byModel = false; render();
          try { const r = await Api.hint(t.id, Math.min(S.hints, 4)); S.reply = r.text; S.byModel = true; }
          catch (err) { S.reply = aiFallback(err) + hintText(t, S.hints - 1); }
          render(); },
        where: () => { S.hints++; S.reply = t.page ? 'Откройте стр. ' + t.page + ' в тексте шага: ответ опирается на одно предложение этого абзаца.' : 'Ответ есть в тексте шага.'; render(); }
      };
      $$('[data-act]', host).forEach(b => b.onclick = () => act[b.dataset.act]?.());
      const f = $('[data-ask]', host); if (f) f.onsubmit = async e => { e.preventDefault(); const q = $('#ask-in', host).value.trim(); if (!q) return; S.hints++;
        if (!server) { S.reply = askLocal(q, t); render(); return; }
        S.reply = 'Помощник думает…'; S.byModel = false; render();
        try { const r = await Api.chat(step.id, q, t?.id); S.reply = r.text; S.byModel = true; }
        catch (err) { S.reply = aiFallback(err) + askLocal(q, t); }
        render(); };
    }
    /* Перетаскивание указателем: работает мышью и пальцем; клавиатура — кнопки-стрелки. */
    function dragOrder() {
      const list = $('.order-list', host); if (!list) return;
      $$('.order-item', list).forEach(item => {
        const grip = $('.grip', item);
        grip.onpointerdown = e => {
          e.preventDefault(); grip.setPointerCapture(e.pointerId);
          const items = $$('.order-item', list), start = e.clientY, from = items.indexOf(item);
          const rects = items.map(x => x.getBoundingClientRect());
          let to = from; item.classList.add('dragging');
          grip.onpointermove = ev => {
            const dy = ev.clientY - start; item.style.transform = 'translateY(' + dy + 'px)';
            const mid = rects[from].top + rects[from].height / 2 + dy;
            to = rects.findIndex(r => mid < r.top + r.height / 2); if (to < 0) to = items.length - 1;
            items.forEach((x, k) => { if (x === item) return; let shift = 0; const h = rects[from].height + 10;
              if (from < to && k > from && k <= to) shift = -h; if (from > to && k < from && k >= to) shift = h; x.style.transform = shift ? 'translateY(' + shift + 'px)' : ''; });
          };
          grip.onpointerup = grip.onpointercancel = () => {
            grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
            if (to !== from) { const [id] = S.order.splice(from, 1); S.order.splice(to, 0, id); S.changes++; }
            render();
          };
        };
      });
    }
    function aiFallback(err) {
      return (err.status === 503 ? 'Помощник сейчас недоступен (локальная модель не отвечает). ' : err.status === 429 ? err.message + ' ' : 'Помощник не ответил: ' + err.message + ' ') + 'Подсказка из текста шага: ';
    }
    /* Режим сервера: ответ проверяет сервер; он же начисляет опыт и даёт рекомендацию адаптивных правил. */
    async function checkServer(t, response) {
      if (S.busy) return; S.busy = true;
      const v = $('.validation', host); if (v) v.textContent = 'Проверяем…';
      tick();
      const before = XP.level().n;
      try {
        const r = await Api.attempt({question_id: t.id, response, active_seconds: Math.round((clock?.acc || 0) / 100) / 10, idle_seconds: Math.round((clock?.idle || 0) / 1000),
          answer_changes: S.changes, hints_used: S.hints, client_id: U.uid().slice(0, 60)});
        t.answer = r.key; t.explanation = r.explanation; t.quote = r.quote; if (r.page) t.page = r.page;
        S.fb = {correct: r.correct, ev: r.event, rec: r.recommendation};
        (r.rewards || []).forEach(g => { S.rewards.push(g); U.toast('+' + g.amount + ' XP · ' + g.reason); });
        (r.achievements || []).forEach(code => U.toast('Достижение: «' + (XP.ACH.find(a => a.id === code)?.name || code) + '»'));
        await Api.hydrate().catch(() => Store.state.events.push(r.event));
        const after = XP.level().n; if (after > before) levelUp(after);
        opts.onChange?.();
      } catch (err) {
        S.busy = false; const v2 = $('.validation', host); if (v2) v2.textContent = 'Ответ не записан: ' + err.message; return;
      }
      S.busy = false; render();
    }
    function check() {
      const t = S.queue[S.i]; if (!t || S.fb) return;
      let response, correct;
      if (server) {
        if (t.type === 'single') response = S.sel[0];
        else if (t.type === 'multiple') response = [...S.sel].sort();
        else if (t.type === 'order') response = [...S.order];
        else if (t.type === 'gap') { const n = (t.prompt.match(/\{\{\d+\}\}/g) || []).length || 1; response = Array.from({length: n}, (_, k) => (S.inputs[k] || '').trim()); }
        else response = (S.inputs[0] || '').trim();
        const empty = response == null || response === '' || (Array.isArray(response) && (!response.length || response.some(x => x === '')));
        if (empty && t.type !== 'order') { const v = $('.validation', host); if (v) v.textContent = 'Сначала выберите или введите ответ.'; return; }
        return checkServer(t, response);
      }
      if (t.type === 'single') { response = S.sel[0]; correct = response === t.answer; }
      else if (t.type === 'multiple') { response = [...S.sel].sort(); correct = JSON.stringify(response) === JSON.stringify([...t.answer].sort()); }
      else if (t.type === 'order') { response = [...S.order]; correct = JSON.stringify(response) === JSON.stringify(t.answer); }
      else if (t.type === 'gap') { response = t.answer.map((_, k) => (S.inputs[k] || '').trim()); correct = t.answer.every((w, k) => gapMatch(response[k], w, t.accepted)); }
      else { response = (S.inputs[0] || '').trim(); const v = Number(response.replace(',', '.').replace(/\s/g, '')); correct = Number.isFinite(v) && Math.abs(v - Number(t.answer)) <= (t.tolerance ?? 1e-6); }
      const empty = response == null || response === '' || (Array.isArray(response) && (!response.length || response.some(x => x === '')));
      if (empty && t.type !== 'order') { const v = $('.validation', host); if (v) v.textContent = 'Сначала выберите или введите ответ.'; return; }
      tick();
      const ev = Store.record({type: 'answer', courseId: course.id, lessonId: step.id, questionId: t.id, taskType: t.type, correct,
        elapsed: Math.round((clock?.acc || 0) / 100) / 10, idle: Math.round((clock?.idle || 0) / 1000), changes: S.changes, hints: S.hints,
        attempt: attempts(t.id) + 1, response});
      S.fb = {correct, ev};
      const stats = Catalog.stepStats(course, step);
      const key = Catalog.key(course, step);
      if (stats.allAnswered && !Store.state.completed.includes(key)) { Store.state.completed.push(key); Store.save(); }
      if (course.steps.every(s => Catalog.isDone(course, s))) { Store.state.achievements.courseDone ||= new Date().toISOString(); }
      const got = XP.onStepProgress(course.id, step.id, stats);
      if (got.length) { S.rewards.push(...got); got.forEach(g => U.toast('+' + g.amount + ' XP · ' + g.reason)); const lv = got.find(g => g.levelUp); if (lv) levelUp(lv.levelUp); }
      opts.onChange?.();
      render();
    }
    function levelUp(n) {
      const r = XP.rankOf(n), box = document.createElement('div');
      box.className = 'levelup'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Новый уровень');
      box.innerHTML = '<div class="card">' + XP.badge(r, 110, n) + '<h2>Уровень ' + n + '</h2><p class="muted">Ранг: <b>' + esc(r.name) + '</b>. Опыт начисляется за шаги, серию дней и решения без ошибок.</p><button class="btn primary">Продолжить</button></div>';
      document.body.append(box); const b = box.querySelector('button'); b.focus(); b.onclick = () => box.remove();
    }
    start(false);
    return {destroy() { document.removeEventListener('visibilitychange', vis); clock = null; }};
  }

  window.Tasks = {mount, answerText, typeName};
})();
