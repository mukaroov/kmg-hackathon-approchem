/* STRATA · общие утилиты. Обычный скрипт без модулей: сайт должен открываться и с file://. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const today = (d = new Date()) => d.toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    return n + ' ' + forms[a > 10 && a < 15 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2];
  }
  const P = {
    step: n => plural(n, ['шаг', 'шага', 'шагов']),
    task: n => plural(n, ['задание', 'задания', 'заданий']),
    min: n => plural(n, ['минута', 'минуты', 'минут']),
    course: n => plural(n, ['курс', 'курса', 'курсов']),
    card: n => plural(n, ['карточка', 'карточки', 'карточек']),
    day: n => plural(n, ['день', 'дня', 'дней']),
    page: n => plural(n, ['страница', 'страницы', 'страниц'])
  };

  /* Иконки: один набор линейных SVG, цвет наследуется от текста. */
  const G = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    book: '<path d="M4 5c3-1 5-.5 8 1.5C15 4.5 17 4 20 5v14c-3-1-5-.5-8 1.5C9 18.5 7 18 4 19z"/><path d="M12 6.5V20"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    shorts: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="m10.5 9 4 3-4 3z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4M12 13v4m-4 3h8m-6-3h4"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    moon: '<path d="M21 13a9 9 0 1 1-10-10 7.5 7.5 0 0 0 10 10Z"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    cards: '<rect x="7" y="6" width="13" height="15" rx="2"/><path d="M16 3H5a2 2 0 0 0-2 2v12"/>',
    print: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
    map: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="M8 7.5 16 8M7 8.5l1.5 7M16.5 10 10.5 16"/>',
    spark: '<path d="m12 3 2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.2z"/>',
    fire: '<path d="M12 21c4 0 7-2.8 7-6.8 0-3.6-2.6-5.7-4-8.2-.4 2-1.4 3.2-2.6 3.6C12.6 6.8 11 4.4 8.6 3c.3 3-1.6 5.1-3 7-.9 1.3-1.6 2.6-1.6 4.2C4 18.2 8 21 12 21z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    data: '<path d="M4 19V5m0 14h16"/><path d="m7 15 4-5 3 3 5-7"/>',
    quote: '<path d="M7 7h4v4c0 3-2 5-4 6m6-10h4v4c0 3-2 5-4 6"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4m0 3v.5"/>',
    bulb: '<path d="M9 18h6m-5 3h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    medal: '<circle cx="12" cy="14" r="6"/><path d="m9 3 3 5 3-5"/><path d="m12 11 1 2h2l-1.6 1.3.6 2.2-2-1.2-2 1.2.6-2.2L9 13h2z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>'
  };
  const icon = (name, size = 18, cls = '') => '<svg class="ic ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (G[name] || '') + '</svg>';

  /* Короткое уведомление внизу экрана. */
  function toast(msg) {
    let n = $('#toast');
    if (!n) return;
    n.textContent = msg; n.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { n.hidden = true; }, 3200);
  }

  /* Безопасный рендер формул из md: \( \), $ $, _{ }, ^{ }, греческие буквы. Без внешних библиотек. */
  const GREEK = {alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',epsilon:'ε',varepsilon:'ε',eta:'η',theta:'θ',kappa:'κ',varkappa:'ϰ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',phi:'φ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',Omega:'Ω',Phi:'Φ',Psi:'Ψ',Gamma:'Γ',Lambda:'Λ',Sigma:'Σ',partial:'∂',infty:'∞',cdot:'·',times:'×',approx:'≈',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',pm:'±',div:'÷',to:'→',rightarrow:'→',sqrt:'√',sum:'Σ',int:'∫',nabla:'∇',circ:'°',ldots:'…',dots:'…'};
  function texToHtml(t) {
    let s = esc(t);
    s = s.replace(/\\(?:mathrm|text|mathbf|operatorname)\{([^{}]*)\}/g, '$1');
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
    s = s.replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] || w);
    for (let i = 0; i < 3; i++) {
      s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
    }
    s = s.replace(/_([A-Za-zА-Яа-я0-9])/g, '<sub>$1</sub>').replace(/\^([A-Za-zА-Яа-я0-9*])/g, '<sup>$1</sup>');
    return s.replace(/[{}]/g, '').replace(/\\,|\\;|\\!/g, ' ');
  }
  /* Текст абзаца книги → HTML: формулы внутри \( \) и $ $ превращаются в читаемую запись. */
  function richText(t) {
    const parts = String(t ?? '').split(/(\\\(.*?\\\)|\$\$.*?\$\$|\$[^$\n]{1,200}\$)/s);
    return parts.map((p, i) => {
      if (i % 2 === 0) return esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      const inner = p.replace(/^\\\(|\\\)$|^\$\$|\$\$$|^\$|\$$/g, '');
      return '<span class="tex">' + texToHtml(inner) + '</span>';
    }).join('');
  }
  /* Таблица markdown → HTML-таблица со своей прокруткой. */
  function mdTable(md) {
    const rows = String(md).trim().split('\n').filter(r => r.trim().startsWith('|') && !/^\|\s*-{2,}/.test(r.trim().replace(/[:\s|]/g, m => m === '|' ? '|' : '')) && !/^\|[\s:|-]+\|$/.test(r.trim()));
    if (!rows.length) return '';
    const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const head = cells(rows[0]);
    return '<div class="tbl-wrap" tabindex="0"><table><thead><tr>' + head.map(c => '<th>' + richText(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.slice(1).map(r => '<tr>' + cells(r).map(c => '<td>' + richText(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  window.U = {esc, $, $$, uid, clamp, today, dayDiff, plural, P, icon, toast, texToHtml, richText, mdTable};
})();
