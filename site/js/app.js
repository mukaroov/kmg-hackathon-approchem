/* STRATA · оболочка: шапка, тема, маршрутизатор по hash.
   Режим сервера (страница открыта с адреса STRATA): вход обязателен, меню зависит от роли.
   Офлайн-режим (file:// или сервер недоступен): всё как раньше, без регистрации. */
(() => {
  'use strict';
  const {esc, icon, $} = U;
  const ALIAS = {course: 'courses', step: 'courses', video: 'shorts', settings: 'rank'};

  function nav() {
    const base = [['home', 'Главная', 'home'], ['courses', 'Курсы', 'book']];
    if (!Api.online) return [...base, ['upload', 'Загрузить книгу', 'upload'], ['shorts', 'Шортсы', 'shorts'], ['rank', 'Мой ранг', 'trophy'], ['team', 'Команда', 'team']];
    const out = [...base, ['shorts', 'Видео', 'shorts'], ['rank', 'Мой ранг', 'trophy']];
    if (Api.isAdmin()) out.push(['team', 'Команда', 'team']);
    if (Api.isExpert()) out.push(['admin', Api.isAdmin() ? 'Управление' : 'Курсы и документы', 'settings']);
    return out;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = Store.state.theme;
    const b = $('#theme'); if (b) { b.innerHTML = icon(Store.state.theme === 'dark' ? 'sun' : 'moon', 19); b.setAttribute('aria-label', Store.state.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'); }
  }
  function header(active) {
    if (active) header.active = active;
    const cur = ALIAS[header.active] || header.active;
    const guest = Api.online && !Api.user;
    const links = guest ? '' : nav().map(([k, l, i]) => '<a href="#/' + k + '" class="' + (k === cur ? 'on' : '') + '"' + (k === cur ? ' aria-current="page"' : '') + '>' + icon(i, 17) + '<span>' + l + '</span></a>').join('');
    $('#nav').innerHTML = links; $('#mnav').innerHTML = links;
    $('#xpchip').hidden = guest; $('#settings-btn').hidden = guest; $('#menu').hidden = guest;
    if (guest) return;
    const lv = XP.level(), r = XP.rankOf(lv.n);
    $('#xpchip').innerHTML = XP.badge(r, 32) + '<span>ур. ' + lv.n + '<small>' + lv.total + ' XP</small></span>';
    $('#xpchip').setAttribute('aria-label', 'Мой ранг: ' + r.name + ', уровень ' + lv.n);
    $('#settings-btn').setAttribute('aria-label', Api.user ? 'Профиль: ' + Api.user.name : 'Профиль и настройки');
  }

  async function route() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, query] = raw.split('?');
    const parts = path.split('/').map(decodeURIComponent);
    let key = parts[0] || 'home';
    const params = new URLSearchParams(query || '');
    const view = $('#view');
    if (/^b-/.test(key)) return; // якоря внутри страницы шага
    if (Api.online && !Api.user && key !== 'login') { location.hash = '#/login'; return; }
    if (Api.online && Api.user && key === 'login') { location.hash = '#/home'; return; }
    $('#mnav').dataset.open = 'false';
    header(key);
    const titles = {home: 'Главная', courses: 'Курсы', upload: 'Загрузить книгу', course: 'Курс', step: 'Шаг', rank: 'Мой ранг', settings: 'Профиль', shorts: 'Видео', video: 'Видеоразбор', team: 'Кабинет руководителя', admin: 'Управление', login: 'Вход'};
    document.title = (titles[key] || 'STRATA') + ' · STRATA';
    view.classList.remove('arrive'); void view.offsetWidth; view.classList.add('arrive');
    try {
      if (key === 'login') { Views.login(view); return; }
      await Catalog.init();
      if (key === 'home') Views.home(view);
      else if (key === 'courses') Views.library(view, params);
      else if (key === 'upload') { if (!Api.online) Views.upload(view); else if (Api.isExpert()) location.hash = '#/admin/docs'; else Views.uploadInfo(view); }
      else if (key === 'course') Views.course(view, parts);
      else if (key === 'step') Views.step(view, parts);
      else if (key === 'rank') { Views.rank(view); if (Api.enabled()) { const box = document.createElement('section'); box.className = 'wrap sec'; view.append(box); Views.statsOnline(box); } }
      else if (key === 'settings') (Api.enabled() ? Views.settingsOnline : Views.settings)(view);
      else if (key === 'shorts' || key === 'video') { view.innerHTML = '<div class="wrap" style="margin-top:28px" id="watch-host"></div>'; window.renderWatch(parts); }
      else if (key === 'team') {
        if (!Api.online) { view.innerHTML = '<div class="wrap" style="margin-top:28px" id="team-host"></div>'; window.renderTeam(); }
        else if (Api.isAdmin()) Views.teamOnline(view);
        else view.innerHTML = '<div class="wrap"><div class="empty" style="margin-top:30px">Кабинет руководителя доступен администратору.</div></div>';
      }
      else if (key === 'admin') Views.admin(view, parts);
      else Views.home(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="wrap"><div class="note" style="margin-top:30px">Ошибка при показе страницы: ' + esc(err.message) + '</div></div>';
    }
    if (!location.hash.includes('#b-')) scrollTo({top: 0, behavior: 'instant'});
    view.focus({preventScroll: true});
  }
  async function init() {
    applyTheme();
    $('#theme').onclick = () => { Store.state.theme = Store.state.theme === 'dark' ? 'light' : 'dark'; Store.save(); applyTheme(); };
    $('#menu').onclick = () => { const m = $('#mnav'); m.dataset.open = m.dataset.open === 'true' ? 'false' : 'true'; $('#menu').setAttribute('aria-expanded', m.dataset.open); };
    $('.skip').onclick = e => { e.preventDefault(); $('#view').focus(); };
    $('#settings-btn').innerHTML = icon('user', 19); $('#menu').innerHTML = icon('list', 19);
    $('#view').innerHTML = '<div class="wrap"><p class="muted" style="margin-top:40px">Загрузка STRATA…</p></div>';
    await Api.init();
    const foot = $('#foot-mode');
    if (foot) foot.textContent = Api.online ? 'Работает на сервере STRATA в локальной сети: прогресс хранится в базе.' : 'Офлайн-режим: всё работает в этом браузере, без сервера и регистрации.';
    addEventListener('hashchange', route);
    Store.onRecord(() => header());
    route();
  }
  window.App = {route, header, applyTheme};
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', init) : init();
})();
