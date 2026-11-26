/* STRATA · клиент API.
   Два режима:
   • сервер — страница открыта с адреса STRATA (http://IP:8000/), /api/health отвечает: вход по почте и паролю,
     курсы, проверка ответов, прогресс, опыт и помощник идут через сервер; прогресс хранится в базе;
   • офлайн — страница открыта как файл (file://) или сервер недоступен: всё работает в браузере, как раньше.
   Адрес сервера не зашит: запросы идут на тот же источник, с которого открыта страница.
   Ключи моделей и секреты живут только на сервере. Браузер никогда не обращается к модели напрямую. */
(() => {
  'use strict';
  const EVENT_TYPES = new Set(['card', 'video-answer', 'video-finish', 'lesson-open']);
  let online = false, user = null, health = null;
  let queue = [], qkey = '';

  class ApiError extends Error {
    constructor(status, detail) {
      const msg = typeof detail === 'string' ? detail : detail?.message || detail?.detail || 'Ошибка сервера (' + status + ')';
      super(msg); this.status = status; this.detail = detail;
    }
  }

  async function request(method, path, body, opts = {}) {
    const init = {method, credentials: 'same-origin', headers: {}};
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, init); }
    catch { throw new ApiError(0, 'Нет связи с сервером STRATA. Проверьте сеть.'); }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
    if (!res.ok) {
      if (res.status === 401 && !opts.allow401 && user) { user = null; location.hash = '#/login'; }
      throw new ApiError(res.status, data?.detail ?? data ?? res.statusText);
    }
    return data;
  }
  const get = (p, o) => request('GET', p, undefined, o);
  const post = (p, b) => request('POST', p, b ?? {});
  const put = (p, b) => request('PUT', p, b);
  const patch = (p, b) => request('PATCH', p, b);
  const del = p => request('DELETE', p);

  /* Определение режима: только если страница открыта по http(s) и сервер STRATA отвечает. */
  async function init() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/health', {signal: ctl.signal, credentials: 'same-origin'}); clearTimeout(t);
      health = r.ok ? await r.json() : null;
      online = !!(health && health.app === 'STRATA');
    } catch { online = false; }
    if (!online) return false;
    try { user = await get('/api/auth/me', {allow401: true}); } catch { user = null; }
    if (user) await afterLogin();
    return true;
  }

  async function afterLogin() {
    qkey = 'strata-queue-u' + user.id;
    try { queue = JSON.parse(localStorage.getItem(qkey) || '[]'); } catch { queue = []; }
    await hydrate();
    flush();
  }

  /* Прогресс с сервера переносится в Store.state: остальные модули читают его как раньше. */
  async function hydrate() {
    const st = await get('/api/progress');
    const s = Store.state;
    s.id = st.id; s.name = st.name; s.deadline = st.deadline || '';
    s.completed = st.completed; s.events = st.events; s.cards = st.cards;
    s.xp = st.xp; s.streak = st.streak; s.activity = st.activity; s.achievements = st.achievements;
    s.role = st.role; s.email = st.email;
    for (const e of queue) if (!s.events.some(x => x.id === e.id)) s.events.push(e);  // ещё не отправленные события
    return st;
  }

  async function login(email, password) { user = (await post('/api/auth/login', {email, password})).user; await afterLogin(); return user; }
  async function register(email, name, password) { user = (await post('/api/auth/register', {email, name, password})).user; await afterLogin(); return user; }
  async function logout() { try { await post('/api/auth/logout'); } catch { /* сессия уже закрыта */ } user = null; location.hash = '#/login'; location.reload(); }

  /* События интерфейса (карточки, видео) — пакетами, повтор с теми же id; сервер отбрасывает дубликаты. */
  const persist = () => { if (qkey) try { localStorage.setItem(qkey, JSON.stringify(queue.slice(-2000))); } catch { /* полно */ } };
  function enqueue(e) {
    if (!online || !user || !EVENT_TYPES.has(e.type)) return;
    const clean = {id: e.id, type: e.type};
    for (const k of ['courseId', 'lessonId', 'cardId', 'mark', 'videoId', 'questionId', 'correct', 'elapsed', 'attempt']) if (e[k] !== undefined && e[k] !== null) clean[k] = e[k];
    if (e.response !== undefined) clean.response = String(e.response).slice(0, 300);
    queue.push(clean); persist(); clearTimeout(enqueue.t); enqueue.t = setTimeout(flush, 800);
  }
  async function flush() {
    if (!online || !user || !queue.length) return;
    const batch = queue.slice(0, 200);
    try {
      const r = await post('/api/events', {events: batch});
      const done = new Set([...(r.accepted || []), ...(r.duplicates || [])]);
      queue = queue.filter(e => !done.has(e.id)); persist();
      if (queue.length) flush();
    } catch { /* повтор при следующем событии или возврате на вкладку */ }
  }
  addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });

  window.Api = {
    ApiError, request, get, post, put, patch, del, init, hydrate, login, register, logout, enqueue, flush,
    get online() { return online; }, get user() { return user; }, get health() { return health; },
    enabled: () => online && !!user,
    role: () => user?.role || '',
    isExpert: () => ['expert', 'admin'].includes(user?.role),
    isAdmin: () => user?.role === 'admin',
    queued: () => queue.length,
    attempt: body => post('/api/attempts', body),
    hint: (question_id, level, message = '') => post('/api/ai/hint', {question_id, level, message}),
    chat: (lesson_id, message, question_id, history) => post('/api/ai/chat', {lesson_id, message, question_id: question_id || null, history: history || []}),
    aiStatus: () => get('/api/ai/status')
  };
})();
