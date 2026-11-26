/* STRATA · личная система опыта и рангов. Только для одного профиля: без рейтинга, друзей и соревнований.
   Опыт начисляется за три вещи, как просили:
   1) завершение урока (шага) — все задания шага решены хотя бы раз;
   2) 100 % верно — все задания шага решены верно с первой попытки;
   3) серия — первое завершение шага за день продлевает серию и даёт бонус. */
(() => {
  'use strict';
  const RULES = {complete: 50, perfect: 30, streakPerDay: 10, streakCap: 7};
  const RANKS = [
    {min: 1, id: 'novice', name: 'Новичок', color: '#7C898E'},
    {min: 3, id: 'trainee', name: 'Стажёр', color: '#3E9A8F'},
    {min: 5, id: 'specialist', name: 'Специалист', color: '#4F7FA0'},
    {min: 8, id: 'expert', name: 'Эксперт', color: '#8A78B8'},
    {min: 11, id: 'master', name: 'Мастер', color: '#C9844A'},
    {min: 15, id: 'grandmaster', name: 'Грандмастер', color: '#173B4D'}
  ];
  /* Уровень n требует 100·n·(n−1)/2 опыта: 0, 100, 300, 600, 1000 … */
  const need = n => 100 * n * (n - 1) / 2;
  function level(total = Store.state.xp.total) {
    let n = 1; while (total >= need(n + 1)) n++;
    const from = need(n), to = need(n + 1);
    return {n, total, from, to, inLevel: total - from, span: to - from, pct: Math.round(100 * (total - from) / (to - from))};
  }
  const rankOf = n => [...RANKS].reverse().find(r => n >= r.min);
  const nextRank = n => RANKS.find(r => r.min > n) || null;

  const ACH = [
    {id: 'first-step', name: 'Первый шаг', text: 'Завершите первый шаг курса', test: s => s.completed.length >= 1},
    {id: 'perfect', name: 'Без единой ошибки', text: 'Решите шаг на 100 % с первой попытки', test: s => Object.keys(s.xp.awarded).some(k => k.startsWith('perfect:'))},
    {id: 'streak-3', name: 'Три дня подряд', text: 'Серия занятий 3 дня', test: s => s.streak.best >= 3},
    {id: 'streak-7', name: 'Неделя', text: 'Серия занятий 7 дней', test: s => s.streak.best >= 7},
    {id: 'tasks-50', name: 'Практик', text: 'Решите 50 заданий', test: s => s.events.filter(e => e.type === 'answer').length >= 50},
    {id: 'cards-20', name: 'Память', text: 'Отметьте 20 карточек «знаю»', test: s => Object.values(s.cards).filter(v => v === 'known').length >= 20},
    {id: 'upload', name: 'Своя книга', text: 'Загрузите книгу и соберите курс', test: s => !!s.achievements.uploadDone},
    {id: 'course', name: 'Курс пройден', text: 'Завершите все шаги одного курса', test: s => !!s.achievements.courseDone}
  ];

  function grant(key, amount, reason, ref) {
    const s = Store.state;
    if (s.xp.awarded[key]) return 0;
    const before = level().n;
    s.xp.awarded[key] = new Date().toISOString();
    s.xp.total += amount;
    s.xp.log.unshift({ts: new Date().toISOString(), amount, reason, ref});
    s.xp.log = s.xp.log.slice(0, 200);
    const after = level().n;
    return {amount, reason, levelUp: after > before ? after : 0};
  }
  /* Серия: считается по дням, когда завершён хотя бы один шаг. Пропуск дня обнуляет текущую серию. */
  function touchStreak() {
    const s = Store.state, d = U.today();
    if (s.streak.lastDay === d) return 0;
    const gap = s.streak.lastDay ? U.dayDiff(s.streak.lastDay, d) : 99;
    s.streak.current = gap === 1 ? s.streak.current + 1 : 1;
    s.streak.best = Math.max(s.streak.best, s.streak.current);
    s.streak.lastDay = d;
    return s.streak.current;
  }
  const streakAlive = () => { const s = Store.state.streak; return s.lastDay && U.dayDiff(s.lastDay, U.today()) <= 1 ? s.current : 0; };

  /* Вызывается после каждого ответа. stats — итог по шагу. Возвращает список наград для показа. */
  function onStepProgress(courseId, stepId, stats) {
    const out = [], ref = courseId + '/' + stepId;
    if (stats.allAnswered) {
      const g = grant('complete:' + ref, RULES.complete, 'Шаг завершён', ref);
      if (g) {
        out.push(g);
        Store.state.activity[U.today()] ||= {steps: 0, tasks: 0, correct: 0, cards: 0, hints: 0};
        Store.state.activity[U.today()].steps++;
        const day = U.today();
        if (!Store.state.xp.awarded['streak:' + day]) {
          const n = touchStreak();
          const bonus = RULES.streakPerDay * Math.min(n, RULES.streakCap);
          const sg = grant('streak:' + day, bonus, 'Серия: ' + U.P.day(n), ref);
          if (sg) out.push(sg);
        }
      }
    }
    if (stats.allFirstTryCorrect) {
      const g = grant('perfect:' + ref, RULES.perfect, '100 % верно с первой попытки', ref);
      if (g) out.push(g);
    }
    checkAchievements();
    Store.save();
    return out;
  }
  function checkAchievements() {
    const s = Store.state; const fresh = [];
    for (const a of ACH) if (!s.achievements[a.id] && a.test(s)) { s.achievements[a.id] = new Date().toISOString(); fresh.push(a); }
    fresh.forEach(a => U.toast('Достижение: «' + a.name + '»'));
    return fresh;
  }

  /* Цели на сегодня: показывают, какой опыт ещё можно получить сегодня. */
  function dailyGoals() {
    const s = Store.state, d = U.today(), a = s.activity[d] || {steps: 0, tasks: 0, correct: 0, cards: 0};
    const perfectToday = s.xp.log.some(l => l.ts.slice(0, 10) === d && l.reason.startsWith('100'));
    const streakToday = !!s.xp.awarded['streak:' + d];
    const nextStreak = streakToday ? s.streak.current : (streakAlive() || 0) + 1;
    return [
      {id: 'step', title: 'Завершите один шаг', progress: Math.min(a.steps, 1), of: 1, xp: RULES.complete},
      {id: 'perfect', title: 'Решите шаг без ошибок', progress: perfectToday ? 1 : 0, of: 1, xp: RULES.perfect},
      {id: 'streak', title: streakToday ? 'Серия продлена' : 'Продлите серию', progress: streakToday ? 1 : 0, of: 1, xp: RULES.streakPerDay * Math.min(nextStreak, RULES.streakCap)},
      {id: 'tasks', title: 'Решите 5 заданий', progress: Math.min(a.tasks, 5), of: 5, xp: 0}
    ];
  }

  /* Шесть личных показателей для радара (0–100). Считаются только по своим событиям. */
  function radar() {
    const s = Store.state, ans = s.events.filter(e => e.type === 'answer');
    const first = new Map(); for (const e of ans) { const k = e.courseId + '/' + e.questionId; if (!first.has(k)) first.set(k, e); }
    const f = [...first.values()];
    const acc = f.length ? f.filter(e => e.correct).length / f.length : 0;
    const noHint = f.length ? f.filter(e => !e.hints).length / f.length : 0;
    const times = f.map(e => e.elapsed).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    const med = times.length ? times[Math.floor(times.length / 2)] : 0;
    const speed = med ? U.clamp(1 - (med - 10) / 80, 0, 1) : 0;
    const days = Object.keys(s.activity).filter(d => U.dayDiff(d, U.today()) < 14).length;
    const total = window.Catalog ? Catalog.totalSteps() : 0;
    const known = Object.values(s.cards).filter(v => v === 'known').length;
    return [
      {k: 'Точность', v: Math.round(acc * 100)},
      {k: 'Скорость', v: Math.round(speed * 100)},
      {k: 'Самостоятельность', v: Math.round(noHint * 100)},
      {k: 'Регулярность', v: Math.round(Math.min(days / 10, 1) * 100)},
      {k: 'Прогресс', v: total ? Math.round(Math.min(s.completed.length / total, 1) * 100) : 0},
      {k: 'Память', v: Math.round(Math.min(known / 30, 1) * 100)}
    ];
  }

  /* Медаль ранга — SVG, без картинок из интернета. */
  function badge(rank, size = 96, n) {
    const c = rank.color;
    return '<svg class="medal" width="' + size + '" height="' + Math.round(size * (n ? 1.1 : 1)) + '" viewBox="0 0 100 ' + (n ? 110 : 100) + '" role="img" aria-label="Ранг ' + U.esc(rank.name) + '">' +
      '<path d="M30 4h14l6 22-12 6zM70 4H56l-6 22 12 6z" fill="' + c + '" opacity=".55"/>' +
      '<circle cx="50" cy="60" r="34" fill="' + c + '"/><circle cx="50" cy="60" r="27" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5"/>' +
      '<path d="m50 40 6 12 13 2-9.5 9 2.3 13L50 70l-11.8 6 2.3-13-9.5-9 13-2z" fill="#fff" fill-opacity=".92"/>' +
      (n ? '<text x="50" y="108" text-anchor="middle" font-size="13" font-weight="700" fill="' + c + '">ур. ' + n + '</text>' : '') + '</svg>';
  }

  window.XP = {RULES, RANKS, ACH, level, rankOf, nextRank, onStepProgress, dailyGoals, radar, badge, streakAlive, checkAchievements, need};
})();
