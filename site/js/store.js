/* STRATA · хранилище. Профиль и события — localStorage (как раньше), загруженные книги и курсы — IndexedDB.
   Совместимость: window.Portal = {state, save, record, go, esc, icon}, ключи state как в старом фронтенде,
   поэтому watch.js и team.js работают без переписывания, а отчёт kmg-learning-report v1 остаётся валидным. */
(() => {
  'use strict';
  const KEY = 'strata-v2', OLD = 'strata-profile-v1';
  const defaults = () => ({
    version: 2, id: U.uid(), name: 'Участник', deadline: '', theme: '',
    completed: [], last: '', events: [], cards: {}, video: {},
    xp: {total: 0, log: [], awarded: {}},
    streak: {current: 0, best: 0, lastDay: ''},
    activity: {}, achievements: {},
    api: {base: '', enabled: false}
  });

  let warned = false;
  const state = defaults();
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
    if (!raw) {
      try {
        const old = JSON.parse(localStorage.getItem(OLD) || 'null');
        if (old) raw = {...old, version: 2, migratedFrom: OLD};
      } catch { /* старого профиля нет */ }
    }
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(state)) {
        if (raw[k] === undefined) continue;
        if (Array.isArray(state[k])) { if (Array.isArray(raw[k])) state[k] = raw[k]; }
        else if (state[k] && typeof state[k] === 'object') { if (raw[k] && typeof raw[k] === 'object') state[k] = {...state[k], ...raw[k]}; }
        else state[k] = raw[k];
      }
      if (raw.migratedFrom) state.migratedFrom = raw.migratedFrom;
    }
    try { const t = localStorage.getItem('strata-theme'); if (t) state.theme = t; } catch { /* нет доступа */ }
    if (!state.theme) state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  /* В режиме сервера прогресс живёт в базе: локально сохраняется только тема, офлайн-профиль не смешивается с серверным. */
  function save() {
    try { localStorage.setItem('strata-theme', state.theme); } catch { /* нет доступа */ }
    if (window.Api?.enabled()) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { if (!warned) { warned = true; U.toast('Браузер не дал сохранить прогресс на устройстве.'); } }
  }
  /* Единая точка событий обучения. id — ключ идемпотентности для будущей синхронизации с сервером. */
  const listeners = [];
  function record(event) {
    const e = {...event, ts: new Date().toISOString(), id: U.uid()};
    state.events.push(e);
    const d = U.today(), a = state.activity[d] ||= {steps: 0, tasks: 0, correct: 0, cards: 0, hints: 0};
    if (e.type === 'answer') { a.tasks++; if (e.correct) a.correct++; a.hints += e.hints || 0; }
    if (e.type === 'card') a.cards++;
    save();
    listeners.forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });
    if (window.Api?.enabled()) window.Api.enqueue(e);  // карточки и видео — на сервер; ответы на задания отправляет tasks.js
    return e;
  }
  const onRecord = fn => listeners.push(fn);
  function go(route) { location.hash = '#/' + String(route).replace(/^#?\/?/, ''); }

  /* IndexedDB для книг: курсы бывают большими (сотни страниц), в localStorage они не помещаются. */
  const DB = {
    db: null, mem: {courses: new Map(), books: new Map()},
    open() {
      if (this.db || this.failed) return Promise.resolve(this.db);
      return new Promise(res => {
        let req;
        try { req = indexedDB.open('strata', 1); } catch { this.failed = true; return res(null); }
        req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('courses', {keyPath: 'id'}); db.createObjectStore('books', {keyPath: 'id'}); };
        req.onsuccess = () => { this.db = req.result; res(this.db); };
        req.onerror = () => { this.failed = true; res(null); };
      });
    },
    async tx(store, mode, fn) {
      const db = await this.open();
      if (!db) return fn(null, this.mem[store]);
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode), s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(t.error);
      });
    },
    all(store) { return this.tx(store, 'readonly', (s, m) => m ? [...m.values()] : s.getAll()); },
    get(store, id) { return this.tx(store, 'readonly', (s, m) => m ? m.get(id) : s.get(id)); },
    put(store, obj) { return this.tx(store, 'readwrite', (s, m) => { if (m) { m.set(obj.id, obj); return; } s.put(obj); }); },
    del(store, id) { return this.tx(store, 'readwrite', (s, m) => { if (m) { m.delete(id); return; } s.delete(id); }); }
  };

  load();
  window.Store = {state, save, record, onRecord, DB, defaults};
  window.Portal = {state, save, record, go, esc: U.esc, icon: U.icon};
})();
