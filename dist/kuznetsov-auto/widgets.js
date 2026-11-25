/* Интерактивные рисунки курса (классы A и B). Рисуются кодом в реальных пикселях контейнера,
   поэтому подписи не мельче 16 px и на телефоне. Цвета — переменные из legend.css (доменный пакет). */
(function () {
  'use strict';
  var REG = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(x, d) { if (!isFinite(x)) return '—'; var s = (d == null ? (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)) : x.toFixed(d)); return s.replace('.', ','); }
  function num(v) { return parseFloat(String(v).replace(',', '.')); }
  var FS = 16; // минимальный кегль подписей
  function T(x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || FS) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + ' style="fill:' + (o.color || 'var(--ink)') + '"' + (o.rot ? ' transform="rotate(' + o.rot + ' ' + x + ' ' + y + ')"' : '') + '>' + s + '</text>'; }
  function L(x1, y1, x2, y2, c, w, dash) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke:' + (c || 'var(--ink)') + '" stroke-width="' + (w || 1) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; }
  function P(d, c, w, fill, dash, extra) { return '<path d="' + d + '" style="stroke:' + (c || 'none') + ';fill:' + (fill || 'none') + '" stroke-width="' + (w || 1.5) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + (extra || '') + '/>'; }
  function R(x, y, w, h, fill, stroke, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) + '" style="fill:' + (fill || 'none') + ';stroke:' + (stroke || 'none') + '"' + (extra || '') + '/>'; }
  function svg(w, h, body, label) { return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '">' + body + '</svg>'; }
  function poly(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); }
  function interpLog(pts, x) { // кусочно-линейная интерполяция в лог-лог координатах
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i], t = (Math.log(x) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0])); return Math.exp(Math.log(a[1]) + t * (Math.log(b[1]) - Math.log(a[1]))); }
    return pts[pts.length - 1][1];
  }
  function width(el) { return Math.max(300, Math.min(760, Math.floor(el.clientWidth || 640))); }
  function ctrl(html) { return '<div class="ctrls">' + html + '</div>'; }

  // ---------- Рис. 69: палетка ρп = f(kп) ----------
  // Кривые сняты с рисунка книги (с. 98) по пикселям скана; обе оси на рисунке логарифмические.
  var F69 = {
    line1: [[14.2, 13.4], [15.06, 10.8], [15.5, 10.2], [16, 9.8], [16.6, 9.6], [17.25, 9.7], [18.05, 10.2], [18.6, 10.6], [19.2, 11.25], [19.76, 12.06], [20.06, 12.54], [20.67, 13.7], [21.3, 15.0], [21.96, 16.4], [22.63, 17.9], [23.68, 20.5], [24.78, 23.5], [25.54, 25.7], [27, 30.3], [28.5, 35.6], [30, 41.5]],
    star: [[17.75, 8.1], [20.06, 8.8], [22.46, 10.2], [26.1, 15.3], [30, 21.8]],
    star2: [[17.75, 7.2], [18.05, 6.9], [21.6, 5.2], [30, 2.84]],
    wet: function (k) { return Math.pow(29.6 / k, 3.46); },
    kcut: 17, kmin: 14, kmax: 30, rmin: 1, rmax: 50
  };
  function classify69(k, r) {
    if (k < F69.kcut) return { z: 'nonres', t: 'неколлектор (область А: k<sub>п</sub> &lt; k<sub>п</sub>* = 17 %)' };
    var l1 = interpLog(F69.line1, k), wet = F69.wet(k);
    if (k < F69.star[0][0]) return { z: 'nonres', t: 'у самой границы коллектора: кривые 3 на рисунке начинаются с k<sub>п</sub> ≈ 18 %' };
    var s1 = interpLog(F69.star, k), s2 = interpLog(F69.star2, k);
    if (r > l1 * 1.03) return { z: 'out', t: 'выше кривой 1 (ρ<sub>пmax</sub>): такого пласта на палетке нет, проверьте отсчёт' };
    if (r >= s1) return { z: 'oilClean', t: 'область I — безводная нефть' };
    if (r >= s2) return { z: 'oilWater', t: 'область II — нефть с водой' };
    if (r >= wet * 0.97) return { z: 'water', t: 'область III — вода' };
    return { z: 'water', t: 'ниже кривой 2 (ρ<sub>вп</sub>): водоносный пласт, P<sub>н</sub> &lt; 1' };
  }
  REG.crossplot69 = {
    init: function (w) {
      w.state = { k: 25, r: 20 };
      w.el.innerHTML = ctrl('<label>k<sub>п</sub>, % <input type="number" step="0.5" min="14" max="30" data-k value="25"></label><label>ρ<sub>п</sub>, Ом·м <input type="number" step="0.5" min="1" max="50" data-r value="20"></label><span class="ui">Примеры автора: <button type="button" class="linklike" data-ex="25,20">46</button>, <button type="button" class="linklike" data-ex="15,10">47а</button>, <button type="button" class="linklike" data-ex="20,10">47б</button>, <button type="button" class="linklike" data-ex="25,10">47в</button></span>') + '<div class="plot"></div><div class="readout" aria-live="polite"></div><p class="ui muted" style="margin:6px 0 0">Можно нажать или провести пальцем по палетке — точка переместится.</p>';
      var kI = w.el.querySelector('[data-k]'), rI = w.el.querySelector('[data-r]');
      function upd() { w.state.k = Math.min(30, Math.max(14, num(kI.value) || 14)); w.state.r = Math.min(50, Math.max(1, num(rI.value) || 1)); w.plot(); }
      kI.oninput = upd; rI.oninput = upd;
      w.el.querySelectorAll('[data-ex]').forEach(function (b) { b.onclick = function () { var v = b.dataset.ex.split(','); kI.value = v[0]; rI.value = v[1]; upd(); }; });
      w.setFromPlot = function (k, r) { kI.value = fmt(k, 1).replace(',', '.'); rI.value = fmt(r, 1).replace(',', '.'); upd(); };
    },
    plot: function (w) {
      var W = width(w.el), H = Math.round(Math.min(520, Math.max(360, W * 0.72))), m = { l: 58, r: 14, t: 14, b: 50 };
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var X = function (k) { return m.l + pw * (Math.log(k) - Math.log(F69.kmin)) / (Math.log(F69.kmax) - Math.log(F69.kmin)); };
      var Y = function (r) { return m.t + ph * (1 - (Math.log(r) - Math.log(F69.rmin)) / (Math.log(F69.rmax) - Math.log(F69.rmin))); };
      var s = '', ks = [], k;
      for (k = 14; k <= 30.001; k += 0.25) ks.push(k);
      var ksR = ks.filter(function (x) { return x >= F69.star[0][0]; });
      var c1 = function (x) { return interpLog(F69.line1, x); }, c3 = function (x) { return interpLog(F69.star, x); }, c4 = function (x) { return interpLog(F69.star2, x); };
      function band(fa, fb, fill) { var a = ksR.map(function (x) { return [X(x), Y(fa(x))]; }), b = ksR.slice().reverse().map(function (x) { return [X(x), Y(fb(x))]; }); return P(poly(a.concat(b)) + 'Z', 'none', 0, fill, '', ' fill-opacity="0.28"'); }
      s += band(c1, c3, 'var(--zn-oilClean)') + band(c3, c4, 'var(--zn-oilWater)') + band(c4, F69.wet, 'var(--zn-water)');
      // сетка
      [1, 2, 3, 5, 10, 20, 30, 50].forEach(function (r) { s += L(m.l, Y(r), W - m.r, Y(r), 'var(--rule)', 1) + T(m.l - 8, Y(r) + 5, String(r), { anchor: 'end', color: 'var(--muted)' }); });
      [14, 15, 17, 20, 25, 30].forEach(function (x) { s += L(X(x), m.t, X(x), H - m.b, 'var(--rule)', 1) + T(X(x), H - m.b + 22, String(x), { anchor: 'middle', color: 'var(--muted)' }); });
      s += T(m.l + pw / 2, H - 6, 'k<tspan baseline-shift="sub" font-size="13">п</tspan>, % (лог. шкала)', { anchor: 'middle', color: 'var(--ink-2)' });
      s += T(16, m.t + ph / 2, 'ρ<tspan baseline-shift="sub" font-size="13">п</tspan>, Ом·м', { anchor: 'middle', rot: -90, color: 'var(--ink-2)' });
      // кривые
      s += P(poly(ks.map(function (x) { return [X(x), Y(c1(x))]; })), 'var(--ink)', 2.2);
      s += P(poly(ks.map(function (x) { return [X(x), Y(F69.wet(x))]; })), 'var(--fl-water)', 2.2);
      s += P(poly(ksR.map(function (x) { return [X(x), Y(c3(x))]; })), 'var(--ink-2)', 1.6) + P(poly(ksR.map(function (x) { return [X(x), Y(c4(x))]; })), 'var(--ink-2)', 1.6);
      s += L(X(17), Y(4), X(17), Y(17), 'var(--ink-2)', 1.5, '8 4 2 4');
      s += T(X(29.3), Y(c1(29.3)) - 8, '1', { anchor: 'middle', weight: 700 }) + T(X(29), Y(F69.wet(29)) + 20, '2', { anchor: 'middle', weight: 700, color: 'var(--fl-water)' });
      s += T(X(15.2), Y(6.2), 'А', { weight: 700, color: 'var(--muted)' }) + T(X(17.6), Y(3), 'Б', { weight: 700, color: 'var(--muted)' });
      if (W > 420) s += T(X(26.2), Y(c1(26.2) * 0.82), 'I', { weight: 700 }) + T(X(26.6), Y(Math.sqrt(c3(26.6) * c4(26.6))), 'II', { weight: 700 }) + T(X(26.6), Y(Math.sqrt(c4(26.6) * F69.wet(26.6))), 'III', { weight: 700 });
      // точка
      var px = X(w.state.k), py = Y(w.state.r), res = classify69(w.state.k, w.state.r);
      s += L(px, H - m.b, px, py, 'var(--mark)', 1, '3 3') + L(m.l, py, px, py, 'var(--mark)', 1, '3 3') + '<circle cx="' + px + '" cy="' + py + '" r="7" style="fill:var(--mark);stroke:var(--paper)" stroke-width="2"/>';
      s += R(m.l, m.t, pw, ph, 'transparent', 'none', ' class="hit" style="cursor:crosshair"');
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Палетка ρп от kп: области безводной нефти, нефти с водой и воды');
      var hit = w.el.querySelector('.hit');
      var pick = function (e) { var b = hit.getBoundingClientRect(); var fx = (e.clientX - b.left) / b.width, fy = (e.clientY - b.top) / b.height; var kk = Math.exp(Math.log(F69.kmin) + fx * (Math.log(F69.kmax) - Math.log(F69.kmin))), rr = Math.exp(Math.log(F69.rmin) + (1 - fy) * (Math.log(F69.rmax) - Math.log(F69.rmin))); w.setFromPlot(kk, rr); };
      var down = false;
      hit.addEventListener('pointerdown', function (e) { down = true; hit.setPointerCapture(e.pointerId); pick(e); });
      hit.addEventListener('pointermove', function (e) { if (down) pick(e); });
      hit.addEventListener('pointerup', function () { down = false; });
      var wet = F69.wet(w.state.k);
      w.el.querySelector('.readout').innerHTML = 'Точка k<sub>п</sub> = <b>' + fmt(w.state.k, 1) + ' %</b>, ρ<sub>п</sub> = <b>' + fmt(w.state.r, 1) + ' Ом·м</b> → ' + '<b>' + res.t + '</b>.<br>Для этой пористости ρ<sub>вп</sub> ≈ ' + fmt(wet) + ' Ом·м, значит P<sub>н</sub> = ρ<sub>п</sub>/ρ<sub>вп</sub> ≈ ' + fmt(w.state.r / wet) + '.';
    }
  };

  // ---------- Рис. 70: Pн = f(kв) и фазовые проницаемости ----------
  // Опорные точки — числа автора из примера 49; через них Pн ≈ kв^(−1,95) (оценка модели).
  var F70 = { kvsv: 15, kv1: 30, kvkr: 56, kv2: 80, pn: function (kv) { return Math.pow(kv / 100, -1.95); }, kn: function (kv) { return kv >= 80 ? 0 : 0.8 * Math.pow((80 - kv) / 65, 2.76); }, kw: function (kv) { return kv <= 30 ? 0 : Math.pow((kv - 30) / 70, 3); } };
  REG.fig70 = {
    init: function (w) {
      w.state = { kv: 45 };
      w.el.innerHTML = ctrl('<label>k<sub>в</sub>, % <input type="range" min="15" max="100" step="1" value="45" data-kv aria-label="Коэффициент водонасыщения, процентов"> <b data-v>45</b></label>') + '<div class="plot"></div><div class="readout" aria-live="polite"></div>';
      var r = w.el.querySelector('[data-kv]');
      r.oninput = function () { w.state.kv = +r.value; w.el.querySelector('[data-v]').textContent = r.value; w.plot(); };
    },
    plot: function (w) {
      var W = width(w.el), H1 = Math.round(Math.min(300, Math.max(200, W * 0.48))), H2 = Math.round(Math.min(220, Math.max(160, W * 0.36))), m = { l: 56, r: 14, t: 34, b: 10 }, gap = 44, H = m.t + H1 + gap + H2 + 46;
      var pw = W - m.l - m.r;
      var X = function (kv) { return m.l + pw * (kv - 10) / 90; };
      var Y1 = function (p) { return m.t + H1 * (1 - Math.log(p) / Math.log(50)); };
      var top2 = m.t + H1 + gap, Y2 = function (v) { return top2 + H2 * (1 - v); };
      var s = '', kv = w.state.kv, k;
      // полосы областей
      var z = [[F70.kvsv, F70.kv1, 'var(--zn-oilClean)'], [F70.kv1, F70.kv2, 'var(--zn-oilWater)'], [F70.kv2, 100, 'var(--zn-water)']];
      z.forEach(function (q) { s += R(X(q[0]), m.t, X(q[1]) - X(q[0]), H1, q[2], 'none', ' fill-opacity="0.22"') + R(X(q[0]), top2, X(q[1]) - X(q[0]), H2, q[2], 'none', ' fill-opacity="0.22"'); });
      [1, 2, 3, 5, 10, 20, 40].forEach(function (p) { s += L(m.l, Y1(p), W - m.r, Y1(p), 'var(--rule)') + T(m.l - 8, Y1(p) + 5, String(p), { anchor: 'end', color: 'var(--muted)' }); });
      [0, 0.5, 1].forEach(function (v) { s += L(m.l, Y2(v), W - m.r, Y2(v), 'var(--rule)') + T(m.l - 8, Y2(v) + 5, String(v).replace('.', ','), { anchor: 'end', color: 'var(--muted)' }); });
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach(function (x) { s += T(X(x), H - 26, String(x), { anchor: 'middle', color: 'var(--muted)' }); });
      s += T(m.l + pw / 2, H - 4, 'k<tspan baseline-shift="sub" font-size="13">в</tspan>, %', { anchor: 'middle', color: 'var(--ink-2)' });
      s += T(m.l, 20, 'б) P<tspan baseline-shift="sub" font-size="13">н</tspan> = f(k<tspan baseline-shift="sub" font-size="13">в</tspan>), лог. шкала', { color: 'var(--ink-2)' });
      s += T(m.l + 6, top2 - 10, W < 460 ? 'а) фазовые проницаемости' : 'а) относительные фазовые проницаемости', { color: 'var(--ink-2)' });
      var pts = []; for (k = 15; k <= 100; k += 1) pts.push([X(k), Y1(F70.pn(k))]);
      s += P(poly(pts), 'var(--ink)', 2.2);
      var kn = [], kw = []; for (k = 15; k <= 100; k += 1) { kn.push([X(k), Y2(F70.kn(k))]); kw.push([X(k), Y2(F70.kw(k))]); }
      s += P(poly(kn), 'var(--fl-oil)', 2.2) + P(poly(kw), 'var(--fl-water)', 2.2);
      s += T(X(20), Y2(F70.kn(20)) - 8, 'по нефти', { color: 'var(--fl-oil)' }) + T(X(97), Y2(0.72), 'по воде', { anchor: 'end', color: 'var(--fl-water)' });
      // критические значения автора
      [[F70.kv1, 10, 'k<tspan baseline-shift="sub" font-size="13">в</tspan>* = 30'], [F70.kvkr, 3, 'k<tspan baseline-shift="sub" font-size="13">в.кр</tspan> = 56'], [F70.kv2, 1.5, 'k<tspan baseline-shift="sub" font-size="13">в</tspan>** = 80']].forEach(function (c, i) {
        s += L(X(c[0]), m.t, X(c[0]), top2 + H2, 'var(--ink-2)', 1, '4 4') + '<circle cx="' + X(c[0]) + '" cy="' + Y1(c[1]) + '" r="5" style="fill:var(--paper);stroke:var(--ink)" stroke-width="2"/>';
        if (W > 460 || i !== 1) s += T(X(c[0]) + 7, Y1(c[1]) - 8, 'P<tspan baseline-shift="sub" font-size="13">н</tspan> = ' + String(c[1]).replace('.', ','), {});
      });
      s += '<circle cx="' + X(F70.kvsv) + '" cy="' + Y1(40) + '" r="5" style="fill:var(--ink)"/>' + T(X(F70.kvsv) + 8, Y1(40) + 5, 'P<tspan baseline-shift="sub" font-size="13">н max</tspan> ≈ 40', {});
      // текущий kв
      s += L(X(kv), m.t, X(kv), top2 + H2, 'var(--mark)', 2) + '<circle cx="' + X(kv) + '" cy="' + Y1(F70.pn(kv)) + '" r="6" style="fill:var(--mark)"/>';
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Рисунок 70: параметр насыщения и фазовые проницаемости в зависимости от водонасыщения');
      var zone = kv <= 30 ? 'однофазное течение нефти — при испытании чистая нефть' : kv < 56 ? 'двухфазное течение, нефти больше, чем воды — промышленный приток нефти с водой' : kv < 80 ? 'двухфазное течение, воды больше — непромышленный приток' : 'однофазное течение воды — чистая вода';
      w.el.querySelector('.readout').innerHTML = 'k<sub>в</sub> = <b>' + kv + ' %</b> → P<sub>н</sub> ≈ <b>' + fmt(F70.pn(kv)) + '</b>; ' + zone + '.';
    }
  };

  // ---------- Табл. 22: глинистый коллектор, решение по Pн и αСП ----------
  var T22 = [
    { a: 1.0, s1: 10, s2: 1.6, kr: 2.9 },
    { a: 0.9, s1: 5, s2: 1.6, kr: 2.5 },
    { a: 0.8, s1: 3.1, s2: 1.55, kr: 2.1 },
    { a: 0.7, s1: 2.1, s2: 1.5, kr: 1.8 }
  ];
  function t22At(a) { // линейная интерполяция между строками таблицы (делает модель)
    a = Math.max(0.7, Math.min(1, a));
    for (var i = 0; i < T22.length - 1; i++) { var hi = T22[i], lo = T22[i + 1]; if (a <= hi.a && a >= lo.a) { var t = (a - lo.a) / (hi.a - lo.a); return { a: a, s1: lo.s1 + t * (hi.s1 - lo.s1), s2: lo.s2 + t * (hi.s2 - lo.s2), kr: lo.kr + t * (hi.kr - lo.kr), exact: t === 0 || t === 1 }; } }
    return T22[0];
  }
  function t22Class(pn, row) {
    if (pn >= row.s1) return ['oilClean', 'чистая нефть: коллектор нефтеносный'];
    if (pn >= row.kr) return ['oilWater', 'нефть с водой: промышленный приток'];
    if (pn >= row.s2) return ['oilWater', 'вода с признаками нефти: приток непромышленный'];
    return ['water', 'чистая вода'];
  }
  REG.table22 = {
    init: function (w) {
      w.state = { a: 0.9, pn: 10 };
      var ex = [['а', 0.9, 10], ['б', 0.8, 5], ['в', 0.95, 5], ['г', 0.7, 3], ['д', 0.9, 3], ['е', 0.9, 2]];
      w.el.innerHTML = ctrl('<label>α<sub>СП</sub> <input type="number" min="0.7" max="1" step="0.05" value="0.9" data-a></label><label>P<sub>н</sub> <input type="number" min="1" max="40" step="0.1" value="10" data-p></label>') +
        '<p class="ui" style="margin:4px 0">Пример 53: ' + ex.map(function (e) { return '<button type="button" class="linklike" data-e="' + e[1] + ',' + e[2] + '">' + e[0] + '</button>'; }).join(', ') + '</p><div class="plot"></div><div class="readout" aria-live="polite"></div>';
      var aI = w.el.querySelector('[data-a]'), pI = w.el.querySelector('[data-p]');
      function upd() { w.state.a = Math.max(0.7, Math.min(1, num(aI.value) || 0.7)); w.state.pn = Math.max(1, Math.min(40, num(pI.value) || 1)); w.plot(); }
      aI.oninput = upd; pI.oninput = upd;
      w.el.querySelectorAll('[data-e]').forEach(function (b) { b.onclick = function () { var v = b.dataset.e.split(','); aI.value = v[0]; pI.value = v[1]; upd(); }; });
    },
    plot: function (w) {
      var W = width(w.el), H = Math.round(Math.min(380, Math.max(300, W * 0.55))), m = { l: 56, r: 16, t: 12, b: 50 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      var X = function (a) { return m.l + pw * (a - 0.7) / 0.3; }, Y = function (p) { return m.t + ph * (1 - Math.log(p) / Math.log(40)); };
      var s = '', as = [0.7, 0.8, 0.9, 1.0];
      var line = function (key) { return T22.slice().reverse().map(function (r) { return [X(r.a), Y(r[key])]; }); };
      var top = [[X(0.7), Y(40)], [X(1), Y(40)]];
      var bandP = function (upper, lower, fill, op) { return P(poly(upper.concat(lower.slice().reverse())) + 'Z', 'none', 0, fill, '', ' fill-opacity="' + (op || 0.25) + '"'); };
      var lS1 = line('s1'), lKr = line('kr'), lS2 = line('s2'), bottom = [[X(0.7), Y(1)], [X(1), Y(1)]];
      // нефть / нефть с водой (промышленный приток) / вода с признаками нефти / вода
      s += bandP(top, lS1, 'var(--zn-oilClean)') + bandP(lS1, lKr, 'var(--zn-oilWater)') + bandP(lKr, lS2, 'var(--zn-water)', 0.12) + bandP(lS2, bottom, 'var(--zn-water)', 0.3);
      [1, 1.5, 2, 3, 5, 10, 20, 40].forEach(function (p) { s += L(m.l, Y(p), W - m.r, Y(p), 'var(--rule)') + T(m.l - 8, Y(p) + 5, String(p).replace('.', ','), { anchor: 'end', color: 'var(--muted)' }); });
      as.forEach(function (a) { s += L(X(a), m.t, X(a), H - m.b, 'var(--rule)') + T(X(a), H - m.b + 22, String(a).replace('.', ','), { anchor: 'middle', color: 'var(--muted)' }); });
      s += P(poly(lS1), 'var(--ink)', 2) + P(poly(lKr), 'var(--ink)', 2, '', '7 4') + P(poly(lS2), 'var(--ink-2)', 2);
      T22.forEach(function (r) { ['s1', 'kr', 's2'].forEach(function (k) { s += '<circle cx="' + X(r.a) + '" cy="' + Y(r[k]) + '" r="3.5" style="fill:var(--ink)"/>'; }); });
      s += T(X(0.72), Y(T22[3].s1) - 10, 'P<tspan baseline-shift="sub" font-size="13">н</tspan>*', { weight: 700 }) + T(X(0.985), Y(T22[0].kr) - 8, 'P<tspan baseline-shift="sub" font-size="13">н.кр</tspan>', { anchor: 'end', weight: 700 }) + T(X(0.72), Y(T22[3].s2) + 20, 'P<tspan baseline-shift="sub" font-size="13">н</tspan>**', { weight: 700 });
      s += T(m.l + pw / 2, H - 6, 'α<tspan baseline-shift="sub" font-size="13">СП</tspan> — чем меньше, тем глинистее', { anchor: 'middle', color: 'var(--ink-2)' });
      var row = t22At(w.state.a), c = t22Class(w.state.pn, row), px = X(row.a), py = Y(w.state.pn);
      s += '<circle cx="' + px + '" cy="' + py + '" r="7" style="fill:var(--mark);stroke:var(--paper)" stroke-width="2"/>';
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Критические значения параметра насыщения из таблицы 22 в зависимости от αСП');
      w.el.querySelector('.readout').innerHTML = 'α<sub>СП</sub> = ' + fmt(row.a, 2) + ': P<sub>н</sub>* = ' + fmt(row.s1) + ', P<sub>н.кр</sub> = ' + fmt(row.kr) + ', P<sub>н</sub>** = ' + fmt(row.s2) + (row.exact === false ? ' <span class="tag hyp">интерполяция модели между строками таблицы</span>' : '') + '<br>При P<sub>н</sub> = <b>' + fmt(w.state.pn, 1) + '</b> → <b>' + c[1] + '</b>.';
    }
  };

  // ---------- ВНК в переходной зоне: линейный закон ρп(H) ----------
  REG.transitionZone = {
    init: function (w) {
      w.state = { hk: 1520, hp: 1532, rmax: 40, rw: 4, rc: 12 };
      var f = function (k, lab, v, st) { return '<label>' + lab + ' <input type="number" step="' + st + '" value="' + v + '" data-f="' + k + '"></label>'; };
      w.el.innerHTML = ctrl(f('hk', 'H<sub>к</sub>, м', 1520, 0.5) + f('hp', 'H<sub>п</sub>, м', 1532, 0.5) + f('rmax', 'ρ<sub>пmax</sub>, Ом·м', 40, 1) + f('rw', 'ρ<sub>вп</sub>, Ом·м', 4, 0.5) + f('rc', 'критерий ρ<sub>п.кр</sub>, Ом·м', 12, 0.5)) + '<p class="ui muted" style="margin:0">Числа по умолчанию — учебные, их нет в книге. Порядок действий — авторский (с. 101).</p><div class="plot"></div><div class="readout" aria-live="polite"></div>';
      w.el.querySelectorAll('[data-f]').forEach(function (i) { i.oninput = function () { var v = num(i.value); if (isFinite(v)) { w.state[i.dataset.f] = v; w.plot(); } }; });
    },
    plot: function (w) {
      var st = w.state, W = width(w.el), H = 360, m = { l: 70, r: 16, t: 16, b: 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      var h0 = Math.min(st.hk, st.hp) - 4, h1 = Math.max(st.hk, st.hp) + 4, rmin = 1, rmax = Math.max(st.rmax * 1.5, 10);
      var X = function (r) { return m.l + pw * Math.log(r / rmin) / Math.log(rmax / rmin); }, Y = function (h) { return m.t + ph * (h - h0) / (h1 - h0); };
      var s = '';
      s += R(m.l, Y(h0), pw, Y(st.hk) - Y(h0), 'var(--zn-oilClean)', 'none', ' fill-opacity=".22"') + R(m.l, Y(st.hk), pw, Y(st.hp) - Y(st.hk), 'var(--zn-oilWater)', 'none', ' fill-opacity=".22"') + R(m.l, Y(st.hp), pw, Y(h1) - Y(st.hp), 'var(--zn-water)', 'none', ' fill-opacity=".22"');
      [1, 2, 5, 10, 20, 50, 100].filter(function (r) { return r <= rmax; }).forEach(function (r) { s += L(X(r), m.t, X(r), H - m.b, 'var(--rule)') + T(X(r), H - m.b + 22, String(r), { anchor: 'middle', color: 'var(--muted)' }); });
      var step = (h1 - h0) > 30 ? 10 : (h1 - h0) > 12 ? 4 : 2;
      for (var h = Math.ceil(h0 / step) * step; h <= h1; h += step) s += L(m.l, Y(h), W - m.r, Y(h), 'var(--rule)') + T(m.l - 8, Y(h) + 5, String(h), { anchor: 'end', color: 'var(--muted)' });
      s += T(m.l + pw / 2, H - 6, 'ρ<tspan baseline-shift="sub" font-size="13">п</tspan>, Ом·м (лог.)', { anchor: 'middle', color: 'var(--ink-2)' }) + T(16, m.t + ph / 2, 'глубина H, м', { anchor: 'middle', rot: -90, color: 'var(--ink-2)' });
      // кривая: выше переходной зоны ρmax, ниже ρвп, в зоне — линейно по H (как у автора)
      var pts = [[X(st.rmax), Y(h0)], [X(st.rmax), Y(st.hk)], [X(st.rw), Y(st.hp)], [X(st.rw), Y(h1)]];
      s += P(poly(pts), 'var(--cv-res)', 2.4);
      var ok = st.rc < st.rmax && st.rc > st.rw && st.hp > st.hk;
      var hv = ok ? st.hk + (st.rmax - st.rc) / (st.rmax - st.rw) * (st.hp - st.hk) : NaN;
      s += L(X(st.rc), m.t, X(st.rc), H - m.b, 'var(--mark)', 1.4, '5 4');
      if (ok) s += L(m.l, Y(hv), W - m.r, Y(hv), 'var(--mark)', 2.4) + T(W - m.r - 4, Y(hv) - 7, 'ВНК ' + fmt(hv, 1) + ' м', { anchor: 'end', weight: 700, color: 'var(--mark)' });
      s += T(m.l + 6, Y(st.hk) - 6, 'кровля переходной зоны', { color: 'var(--ink-2)' }) + T(m.l + 6, Y(st.hp) + 20, 'зеркало воды', { color: 'var(--ink-2)' });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Определение ВНК в переходной зоне по линейному закону изменения сопротивления');
      w.el.querySelector('.readout').innerHTML = ok ? 'ВНК проводим на глубине <b>' + fmt(hv, 1) + ' м</b>: здесь линия ρ<sub>п</sub>(H) пересекает критерий ρ<sub>п.кр</sub> = ' + fmt(st.rc, 1) + ' Ом·м. Расчёт: H = H<sub>к</sub> + (ρ<sub>пmax</sub> − ρ<sub>п.кр</sub>) / (ρ<sub>пmax</sub> − ρ<sub>вп</sub>) · (H<sub>п</sub> − H<sub>к</sub>).' : 'Критерий должен лежать между ρ<sub>вп</sub> и ρ<sub>пmax</sub>, а H<sub>п</sub> — ниже H<sub>к</sub>.';
    }
  };

  // ---------- Пачка с прослоями: формулы (63)–(65) ----------
  REG.layeredPack = {
    init: function (w) {
      w.state = { h: 18, rp: 7.3, rgl: 2.2, rnp: 25, rpl: 38, xpl: 0 };
      var f = function (k, lab, v, st) { return '<label>' + lab + ' <input type="number" step="' + st + '" value="' + v + '" data-f="' + k + '"></label>'; };
      w.el.innerHTML = ctrl(f('h', 'h<sub>п</sub>, м', 18, 0.5) + f('rp', 'ρ<sub>п</sub> пачки, Ом·м', 7.3, 0.1) + f('rgl', 'ρ<sub>гл</sub>, Ом·м', 2.2, 0.1) + f('rnp', 'ρ<sub>нп</sub>, Ом·м', 25, 0.5) + f('rpl', 'ρ<sub>пл</sub>, Ом·м', 38, 1) + f('xpl', 'доля плотных χ<sub>пл</sub>', 0, 0.05)) + '<p class="ui muted" style="margin:0">По умолчанию — числа задачи 100 (с. 104); χ<sub>пл</sub> = 0 соответствует формуле (63).</p><div class="plot"></div><div class="readout" aria-live="polite"></div>';
      w.el.querySelectorAll('[data-f]').forEach(function (i) { i.oninput = function () { var v = num(i.value); if (isFinite(v)) { w.state[i.dataset.f] = v; w.plot(); } }; });
    },
    plot: function (w) {
      var st = w.state, xpl = Math.max(0, Math.min(0.9, st.xpl));
      // (65): 1/ρп = χгл/ρгл + χпл/ρпл + (1 − χгл − χпл)/ρнп  →  χгл
      var xgl = (1 / st.rp - xpl / st.rpl - (1 - xpl) / st.rnp) / (1 / st.rgl - 1 / st.rnp);
      var valid = isFinite(xgl) && xgl >= 0 && xgl + xpl <= 1;
      var heff = st.h * (1 - xgl - xpl);
      var W = width(w.el), H = 110, s = '', bw = W - 20, x = 10;
      if (valid) {
        var parts = [[xgl, 'var(--rk-clay)', 'глины'], [xpl, 'var(--rk-dense)', 'плотные'], [1 - xgl - xpl, 'var(--zn-oilClean)', 'коллектор']];
        parts.forEach(function (p) { var ww = bw * p[0]; if (ww > 0.5) { s += R(x, 16, ww, 40, p[1], 'var(--paper)'); if (ww > 90) s += T(x + ww / 2, 42, p[2] + ' ' + Math.round(p[0] * 100) + ' %', { anchor: 'middle', color: 'var(--ink)' }); } x += ww; });
        s += T(10, 84, 'h<tspan baseline-shift="sub" font-size="13">эф</tspan> = ' + fmt(heff, 1) + ' м из ' + fmt(st.h, 1) + ' м', { weight: 700 });
      } else s += T(10, 40, 'При таких числах уравнение не имеет смысла: проверьте ρ<tspan baseline-shift="sub" font-size="13">гл</tspan> < ρ<tspan baseline-shift="sub" font-size="13">п</tspan> < ρ<tspan baseline-shift="sub" font-size="13">нп</tspan>.', { color: 'var(--mark)' });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Состав пачки по толщине: глины, плотные прослои, коллектор');
      w.el.querySelector('.readout').innerHTML = valid ? 'χ<sub>гл</sub> = <b>' + fmt(xgl, 3) + '</b>, h<sub>эфΣ</sub> = h<sub>п</sub>(1 − χ<sub>гл</sub>' + (xpl ? ' − χ<sub>пл</sub>' : '') + ') = <b>' + fmt(heff, 1) + ' м</b>.' + (xpl ? ' <span class="tag hyp">вычитание χ<sub>пл</sub> — прямое следствие (65), формулы в книге нет</span>' : '') : '—';
    }
  };

  // ---------- Раствор: корка и зона проникновения (класс B, масштаб условный) ----------
  REG.mudInvasion = {
    init: function (w) {
      w.state = { q: 6 };
      w.el.innerHTML = ctrl('<label>Водоотдача, см³/ч <input type="range" min="4" max="24" step="1" value="6" data-q aria-label="Водоотдача раствора"> <b data-v>6</b></label>') + '<div class="plot"></div><div class="readout" aria-live="polite"></div>';
      var r = w.el.querySelector('[data-q]'); r.oninput = function () { w.state.q = +r.value; w.el.querySelector('[data-v]').textContent = r.value; w.plot(); };
    },
    plot: function (w) {
      var q = w.state.q, W = width(w.el), H = 230, s = '';
      var t = Math.max(0, Math.min(1, (q - 4) / 16)); // 4 → хорошо, 20 → плохо
      var cake = q <= 8 ? 1 : 1 + (Math.min(q, 20) - 8) / 12 * 2.5; // см: ≤1 в хороших условиях, 3–4 при плохом растворе
      var wellR = 40, cx = 20, cy = H / 2, scale = 12; // 1 см корки = 12 px (условно, ради видимости)
      var inv = wellR + 30 + t * (W - 140);
      // пласт
      s += R(0, 18, W, H - 36, 'var(--rk-sand)', 'none', ' fill-opacity=".55"');
      s += R(cx, cy - (H - 36) / 2, inv, H - 36, 'var(--fl-filtrate)', 'none', ' fill-opacity=".55"');
      s += R(cx, 18, wellR + cake * scale, H - 36, 'var(--rk-cake)', 'none');
      s += R(0, 18, cx + wellR, H - 36, 'var(--fl-mud)', 'none', ' fill-opacity=".9"');
      s += L(cx + wellR, 18, cx + wellR, H - 18, 'var(--ink)', 2, '6 4');
      s += T(8, 44, 'скважина', { color: 'var(--paper)', weight: 700 }) + T(cx + wellR + cake * scale + 8, 44, 'зона проникновения фильтрата', { color: 'var(--ink)' }) + T(Math.min(W - 8, cx + inv + 8), H - 30, 'неизменённый пласт', { anchor: cx + inv + 170 > W ? 'end' : 'start', color: 'var(--ink)' });
      s += T(cx + wellR + 4, H - 30, 'корка ' + (q <= 8 ? '≤ 1 см' : fmt(cake, 1) + ' см'), { color: 'var(--paper)', weight: 700, size: 16 });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Схема: глинистая корка и зона проникновения растут с водоотдачей раствора');
      var txt = q <= 8 ? '<b>Оптимальная водоотдача (4–8 см³/ч).</b> Проникновение и корка минимальны: электрометрия видит неизменённую часть пласта, а ГГМ, МБК и ЯМР — сам коллектор.' : q < 20 ? '<b>Водоотдача растёт.</b> Корка толще, проникновение глубже: условия для ГИС ухудшаются.' : '<b>Высокая водоотдача (20 см³/ч и выше).</b> Глубокое проникновение мешает самым глубинным методам (ИК, большие зонды), а толстая корка закрывает коллектор от ГГМ, МБК и ЯМР.';
      w.el.querySelector('.readout').innerHTML = txt + ' <span class="muted">Числа на схеме — только авторские (водоотдача, толщина корки); ширина зоны проникновения условная.</span>';
    }
  };

  // ---------- Четыре группы методов (схема по тексту §18) ----------
  REG.methodGroups = {
    init: function (w) { w.el.innerHTML = '<div class="plot"></div>'; },
    plot: function (w) {
      var W = width(w.el), groups = [
        ['Выделение коллекторов', 'микрозонды, каверномер, ЯМР', 'фильтрация есть или нет', 'var(--fl-filtrate)'],
        ['Пористость', 'ГГМ, АК, нейтронные', 'сколько пор', 'var(--cv-density)'],
        ['Глинистость', 'СП, ГМ', 'сколько глины', 'var(--cv-gr)'],
        ['Продуктивность', 'БЭЗ, БК, ИК + пористость + ρ<tspan baseline-shift="sub" font-size="13">в</tspan>', 'P<tspan baseline-shift="sub" font-size="13">н</tspan> = ρ<tspan baseline-shift="sub" font-size="13">п</tspan>/ρ<tspan baseline-shift="sub" font-size="13">вп</tspan> > 1 ?', 'var(--fl-oil)']
      ];
      var two = W >= 560, cw = two ? (W - 30) / 2 : W - 20, ch = 96, s = '';
      groups.forEach(function (g, i) {
        var col = two ? i % 2 : 0, row = two ? Math.floor(i / 2) : i, x = 10 + col * (cw + 10), y = 10 + row * (ch + 10);
        s += R(x, y, cw, ch, 'var(--paper)', 'var(--rule-2)', ' rx="6"') + R(x, y, 6, ch, g[3], 'none') + T(x + 18, y + 26, (i + 1) + '. ' + g[0], { weight: 700 }) + T(x + 18, y + 52, g[1], { color: 'var(--ink-2)' }) + T(x + 18, y + 78, 'вопрос: ' + g[2], { color: 'var(--muted)' });
      });
      var H = 10 + (two ? 2 : 4) * (ch + 10);
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Четыре группы методов ГИС по задачам: выделение коллекторов, пористость, глинистость, продуктивность');
    }
  };

  // ---------- Признаки пород по табл. 21: учебная колонка ----------
  var LITH = [
    { k: 'clay', name: 'Глина', res: 0.2, sp: 1.0, cal: 1.25, micro: [0.15, 0.15], gr: 0.95, nt: 0.1, sign: 'низкое сопротивление, СП и ГМ максимальны, каверна (d_c > d_н), микрозонды низкие и совпадают' },
    { k: 'sand', fluid: 'water', name: 'Песчаник с солёной водой', res: 0.12, sp: 0.15, cal: 0.85, micro: [0.4, 0.55], gr: 0.45, nt: 0.5, sign: 'минимальное сопротивление, СП минимальны, корка (d_c < d_н), микрозонды расходятся' },
    { k: 'sand', fluid: 'oil', name: 'Песчаник с нефтью', res: 0.55, sp: 0.15, cal: 0.85, micro: [0.4, 0.55], gr: 0.45, nt: 0.5, sign: 'сопротивление среднее, остальные признаки как у водоносного песчаника' },
    { k: 'limestone', name: 'Плотный известняк, ангидрит', res: 0.95, sp: 0.2, cal: 1.0, micro: [0.9, 0.95], gr: 0.1, nt: 0.95, sign: 'максимальное сопротивление, номинальный диаметр, ГМ минимальны, нейтронные максимальны' },
    { k: 'salt', name: 'Каменная соль', res: null, sp: null, cal: 1.5, micro: [0.1, 0.1], gr: 0.05, nt: 0.6, sign: 'ГМ очень низкие; диаметр номинален только при насыщенном солью растворе' }
  ];
  REG.lithoColumn = {
    init: function (w) { w.state = { sel: 2 }; w.el.innerHTML = '<div class="plot"></div><div class="readout" aria-live="polite"></div>'; },
    plot: function (w) {
      var W = width(w.el), lh = 64, H = 40 + LITH.length * lh + 10, s = '';
      var narrow = W < 520, colW = narrow ? 64 : 110, tracks = narrow ? ['sp', 'res', 'gr'] : ['cal', 'sp', 'res', 'micro', 'gr', 'nt'];
      var names = { cal: 'кавер.', sp: 'СП', res: 'ρ', micro: 'микрозонды', gr: 'ГМ', nt: 'НГМ' };
      var cols = { cal: 'var(--cv-caliper)', sp: 'var(--cv-sp)', res: 'var(--cv-res)', micro: 'var(--cv-resShallow)', gr: 'var(--cv-gr)', nt: 'var(--cv-neutron)' };
      var tw = (W - colW - 10) / tracks.length, top = 34;
      tracks.forEach(function (t, i) { var x = colW + 10 + i * tw; s += R(x, top, tw - 6, LITH.length * lh, 'none', 'var(--rule)') + T(x + (tw - 6) / 2, 22, names[t], { anchor: 'middle', color: cols[t], weight: 700 }); });
      LITH.forEach(function (l, j) {
        var y = top + j * lh, sel = j === w.state.sel;
        s += R(0, y, colW, lh - 2, 'var(--rk-' + l.k + ')', sel ? 'var(--mark)' : 'var(--rule)', ' stroke-width="' + (sel ? 3 : 1) + '"');
        if (l.fluid) s += R(colW - 14, y + 4, 10, lh - 10, 'var(--fl-' + l.fluid + ')', 'none');
        s += T(6, y + 22, l.name.split(' ')[0], { weight: 700, color: 'var(--ink)' });
        if (l.name.split(' ').length > 1) s += T(6, y + 44, l.name.split(' ').slice(1).join(' ').slice(0, narrow ? 7 : 14) + (l.name.split(' ').slice(1).join(' ').length > (narrow ? 7 : 14) ? '…' : ''), { color: 'var(--ink-2)' });
        tracks.forEach(function (t, i) {
          var x0 = colW + 10 + i * tw + 4, ww = tw - 14;
          if (t === 'micro') { var a = l.micro[0], b = l.micro[1]; s += L(x0 + a * ww, y + 6, x0 + a * ww, y + lh - 8, 'var(--cv-res)', 2.2) + L(x0 + b * ww, y + 6, x0 + b * ww, y + lh - 8, cols.micro, 2.2, '5 3'); return; }
          var v = l[t]; if (v == null) { s += T(x0 + ww / 2, y + lh / 2 + 5, '—', { anchor: 'middle', color: 'var(--muted)' }); return; }
          if (t === 'cal') { s += L(x0 + ww * 0.5, y + 6, x0 + ww * 0.5, y + lh - 8, 'var(--rule-2)', 1, '2 3') + L(x0 + ww * 0.5 * v, y + 6, x0 + ww * 0.5 * v, y + lh - 8, cols.cal, 2.4); return; }
          s += L(x0 + v * ww, y + 6, x0 + v * ww, y + lh - 8, cols[t], 2.6);
        });
        s += R(0, y, W, lh - 2, 'transparent', 'none', ' data-j="' + j + '" style="cursor:pointer" tabindex="0" role="button" aria-label="' + esc(l.name) + '"');
      });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Учебная колонка: типичные показания методов против разных пород по таблице 21');
      w.el.querySelectorAll('[data-j]').forEach(function (r) { var go = function () { w.state.sel = +r.dataset.j; w.plot(); }; r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
      var l = LITH[w.state.sel];
      w.el.querySelector('.readout').innerHTML = '<b>' + esc(l.name) + '.</b> ' + esc(l.sign).replace(/d_c/g, 'd<sub>с</sub>').replace(/d_н/g, 'd<sub>н</sub>') + '.' + (narrow ? ' <span class="muted">На широком экране видны все шесть методов.</span>' : '') + ' <span class="muted">Нажмите на пласт, чтобы прочитать его признаки.</span>';
    }
  };

  // ---------- Нормализация: ρк против метода пористости (учебные данные) ----------
  REG.normalization = {
    init: function (w) {
      w.state = { on: true };
      w.el.innerHTML = ctrl('<label><input type="checkbox" data-on checked> Привести шкалы к единому масштабу</label>') + '<div class="plot"></div><div class="readout" aria-live="polite"></div>';
      var c = w.el.querySelector('[data-on]'); c.onchange = function () { w.state.on = c.checked; w.plot(); };
    },
    plot: function (w) {
      // Интервалы: [толщина, kп %, тип]; ρвп по Арчи-подобной связи, ρп = Pн·ρвп. Это учебная модель, не данные рис. 76.
      var lay = [[6, 2, 'dense'], [5, 12, 'oil'], [2, 3, 'dense'], [6, 15, 'oil'], [4, 13, 'water'], [5, 16, 'water'], [4, 2, 'dense']];
      var W = width(w.el), H = 380, m = { l: 56, r: 12, t: 30, b: 14 }, ph = H - m.t - m.b, tot = lay.reduce(function (a, l) { return a + l[0]; }, 0);
      var Y = function (d) { return m.t + ph * d / tot; }, s = '', d = 0, colW = 46, x0 = m.l + colW + 10, tw = W - x0 - m.r;
      var rho = [], por = [];
      lay.forEach(function (l) {
        var k = l[1] / 100, rwp = 0.05 / Math.pow(k, 2), pn = l[2] === 'oil' ? 9 : 1, rp = rwp * pn;
        s += R(m.l, Y(d), colW, Y(d + l[0]) - Y(d), l[2] === 'dense' ? 'var(--rk-limestone)' : 'var(--rk-limestone)', 'var(--paper)') + (l[2] !== 'dense' ? R(m.l + colW - 12, Y(d) + 2, 10, Y(d + l[0]) - Y(d) - 4, l[2] === 'oil' ? 'var(--fl-oil)' : 'var(--fl-water)', 'none') : '');
        for (var z = 0; z <= l[0]; z += 0.5) { rho.push([d + z, Math.min(2000, rp)]); por.push([d + z, l[1]]); }
        d += l[0];
      });
      s += T(m.l + colW / 2, 20, 'порода', { anchor: 'middle', color: 'var(--muted)' });
      // шкалы: ρ — логарифмическая; пористость — линейная, при нормализации переводится в ρвп той же связью
      var lr0 = Math.log(1), lr1 = Math.log(2000);
      var Xr = function (r) { return x0 + tw * (Math.log(r) - lr0) / (lr1 - lr0); };
      var Xp = w.state.on ? function (kp) { return Xr(0.05 / Math.pow(kp / 100, 2)); } : function (kp) { return x0 + tw * (1 - kp / 20); };
      s += R(x0, m.t, tw, ph, 'none', 'var(--rule)');
      // заливка расхождения
      var pr = rho.map(function (p) { return [Xr(p[1]), Y(p[0])]; }), pp = por.map(function (p) { return [Xp(p[1]), Y(p[0])]; });
      if (w.state.on) s += P(poly(pr.concat(pp.slice().reverse())) + 'Z', 'none', 0, 'var(--fl-oil)', '', ' fill-opacity=".3"');
      s += P(poly(pp), 'var(--cv-neutron)', 2.4) + P(poly(pr), 'var(--cv-res)', 2.4);
      s += T(x0 + 4, 20, 'ρ', { color: 'var(--cv-res)', weight: 700 }) + T(x0 + 30, 20, w.state.on ? 'НГМ → ρвп' : 'НГМ (своя шкала)', { color: 'var(--cv-neutron)', weight: 700 });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Схема нормализации: кривая сопротивления и кривая метода пористости совпадают в неколлекторах и водоносных пластах и расходятся против продуктивных');
      w.el.querySelector('.readout').innerHTML = w.state.on ? 'После приведения шкал кривые совпадают в плотных породах и водоносных пластах. <b>Расхождение (заливка)</b> — признак продуктивного коллектора: там ρ<sub>п</sub> > ρ<sub>вп</sub>.' : 'Без нормализации кривые нарисованы каждая в своём масштабе, и сравнивать их нельзя.';
    }
  };

  // ---------- Табл. 23: kп* карбонатных коллекторов ----------
  REG.table23 = {
    init: function (w) { w.el.innerHTML = '<div class="plot"></div>'; },
    plot: function (w) {
      var rows = [['Рифовые отложения (Башкирия, пермь)', 1], ['Крупнозернистые известняки (Башкирия, карбон)', 3], ['Крупнозернистые доломиты (Белоруссия, девон)', 3], ['Оренбургское газовое месторождение (пермь)', 7], ['Мелоподобные известняки (верхний мел)', 13]];
      var W = width(w.el), rowH = W < 520 ? 58 : 40, lab = W < 520 ? 0 : Math.min(330, W * 0.48), H = 30 + rows.length * rowH + 30, s = '';
      var x0 = lab + 10, bw = W - x0 - 40, X = function (v) { return x0 + bw * v / 14; };
      s += R(X(6), 10, X(8) - X(6), rows.length * rowH + 10, 'var(--note-bg)', 'none') + T(X(7), H - 6, 'типично 6–8 %', { anchor: 'middle', color: 'var(--ink-2)' });
      rows.forEach(function (r, i) {
        var y = 20 + i * rowH;
        if (lab) s += T(0, y + rowH / 2 + 5, r[0], { color: 'var(--ink)' });
        else s += T(x0, y + 14, r[0].length > 38 ? r[0].slice(0, 37) + '…' : r[0], { color: 'var(--ink)' });
        var by = lab ? y + 8 : y + 24;
        s += R(x0, by, X(r[1]) - x0, lab ? rowH - 16 : 22, 'var(--rk-limestone)', 'var(--ink-2)') + T(X(r[1]) + 6, by + (lab ? rowH - 16 : 22) / 2 + 5, r[1] + ' %', { weight: 700 });
      });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Нижний предел пористости для разных карбонатных коллекторов по таблице 23: от 1 до 13 процентов');
    }
  };

  // разметка слоя (_{низ}, ^{верх}) → tspan внутри SVG
  function svgMd(s) { return esc(s).replace(/_\{([^}]*)\}/g, '<tspan baseline-shift="sub" font-size="13">$1</tspan>').replace(/\^\{([^}]*)\}/g, '<tspan baseline-shift="super" font-size="13">$1</tspan>'); }
  function htmlMd(s) { return esc(s).replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>'); }

  // ---------- Цепочка шагов (пункты берутся из рисунка в слое: fig.items) ----------
  REG.chain = {
    init: function (w) { w.el.innerHTML = '<div class="plot"></div>'; },
    plot: function (w) {
      var items = w.fig.items || [], W = width(w.el), s = '', H, bh = 48, gap = 20;
      // по вертикали: подписи не мельче 16 px на любой ширине
      H = items.length * (bh + gap) - gap + 4;
      items.forEach(function (t, i) {
        var y = 2 + i * (bh + gap), x = 10, bw = W - 20;
        s += R(x, y, bw, bh, 'var(--paper)', 'var(--rule-2)', ' rx="6"') + R(x, y, 5, bh, 'var(--ink)', 'none') + T(x + 18, y + 30, '<tspan font-weight="700">' + (i + 1) + '.</tspan> ' + svgMd(t), {});
        if (i < items.length - 1) { var cx = x + 34, y1 = y + bh, y2 = y + bh + gap; s += L(cx, y1, cx, y2 - 1, 'var(--ink-2)', 2) + P('M' + (cx - 5) + ' ' + (y2 - 7) + ' L' + cx + ' ' + y2 + ' L' + (cx + 5) + ' ' + (y2 - 7), 'var(--ink-2)', 2); }
      });
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, w.fig.alt || 'Цепочка шагов');
    }
  };

  // ---------- Таблица применимости (строки и столбцы — из рисунка в слое) ----------
  var MARK = { best: ['●', 'var(--ok)'], yes: ['●', 'var(--ink-2)'], low: ['◐', 'var(--mark)'], no: ['○', 'var(--muted)'] };
  REG.matrix = {
    init: function (w) { w.el.innerHTML = '<div class="plot"></div>'; },
    plot: function (w) {
      var f = w.fig, lg = f.legend || {};
      var cell = function (v) { var star = /\*$/.test(v), k = v.replace('*', ''), m = MARK[k] || ['?', 'var(--ink)']; return '<td style="text-align:center"><span style="color:' + m[1] + ';font-size:22px;line-height:1" aria-hidden="true">' + m[0] + '</span><span class="sr">' + esc(lg[k] || k) + '</span>' + (star ? '<sup>*</sup>' : '') + '</td>'; };
      var h = '<div class="tscroll" tabindex="0" role="region" aria-label="' + esc(f.alt || '') + '"><table><thead><tr><th></th>' + (f.cols || []).map(function (c) { return '<th style="text-align:center">' + htmlMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (f.rows || []).map(function (r) { return '<tr><th scope="row">' + htmlMd(r[0]) + '</th>' + r.slice(1).map(cell).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="legend-row">' + Object.keys(lg).map(function (k) { var m = MARK[k] || ['?', '']; return '<span><b style="color:' + m[1] + ';font-size:20px" aria-hidden="true">' + m[0] + '</b> ' + esc(lg[k]) + '</span>'; }).join('') + '</p>' + (f.note ? '<p class="tnote">' + htmlMd(f.note) + '</p>' : '');
      w.el.querySelector('.plot').innerHTML = h;
    }
  };

  // ---------- Pн = ρп / ρвп: сравнение с водонасыщенным пластом ----------
  REG.pnBars = {
    init: function (w) {
      w.state = { rp: 12, pp: 40, rv: 0.08 };
      var f = function (k, lab, v, st) { return '<label>' + lab + ' <input type="number" step="' + st + '" value="' + v + '" data-f="' + k + '"></label>'; };
      w.el.innerHTML = ctrl(f('rp', 'ρ<sub>п</sub> (метод сопротивления), Ом·м', 12, 0.5) + f('pp', 'P<sub>п</sub> (из пористости)', 40, 1) + f('rv', 'ρ<sub>в</sub> пластовой воды, Ом·м', 0.08, 0.01)) + '<p class="ui muted" style="margin:0">Числа учебные. Формулы — авторские (с. 92, 97).</p><div class="plot"></div><div class="readout" aria-live="polite"></div>';
      w.el.querySelectorAll('[data-f]').forEach(function (i) { i.oninput = function () { var v = num(i.value); if (isFinite(v) && v > 0) { w.state[i.dataset.f] = v; w.plot(); } }; });
    },
    plot: function (w) {
      var st = w.state, rvp = st.pp * st.rv, pn = st.rp / rvp, W = width(w.el), H = 150, s = '', x0 = 10, bw = W - 40, narrow = W < 520;
      var mx = Math.max(st.rp, rvp) * 1.15, X = function (v) { return x0 + bw * v / mx; };
      s += T(x0, 22, 'ρ<tspan baseline-shift="sub" font-size="13">вп</tspan> = ' + (narrow ? '' : 'P<tspan baseline-shift="sub" font-size="13">п</tspan>·ρ<tspan baseline-shift="sub" font-size="13">в</tspan> = ') + fmt(rvp) + ' Ом·м' + (narrow ? ' (с водой)' : ' — каким был бы пласт с водой'), { color: 'var(--ink-2)' }) + R(x0, 30, X(rvp) - x0, 26, 'var(--fl-water)', 'none');
      s += T(x0, 84, 'ρ<tspan baseline-shift="sub" font-size="13">п</tspan> = ' + fmt(st.rp) + ' Ом·м' + (narrow ? ' (замер)' : ' — что измерили'), { color: 'var(--ink-2)' }) + R(x0, 92, X(st.rp) - x0, 26, 'var(--cv-res)', 'none');
      s += L(X(rvp), 26, X(rvp), 124, 'var(--fl-water)', 1.5, '4 3');
      w.el.querySelector('.plot').innerHTML = svg(W, H, s, 'Сравнение измеренного сопротивления с сопротивлением того же пласта в водонасыщенном состоянии');
      w.el.querySelector('.readout').innerHTML = 'P<sub>н</sub> = ρ<sub>п</sub> / ρ<sub>вп</sub> = <b>' + fmt(pn) + '</b>. ' + (pn > 1.05 ? 'P<sub>н</sub> > 1: в порах есть нефть или газ (k<sub>в</sub> < 1). Будет ли приток — решают критические значения (шаги 11–12).' : pn >= 0.95 ? 'P<sub>н</sub> ≈ 1: пласт ведёт себя как водоносный.' : 'P<sub>н</sub> < 1: так быть не должно у чистого пласта — проверьте ρ<sub>в</sub> и пористость.');
    }
  };

  // ---------- монтирование ----------
  var mounted = [];
  function mount(el, def, fig, C, step) {
    var w = { el: el, fig: fig || {}, C: C, step: step, state: {} };
    w.plot = function () { try { def.plot(w); } catch (e) { el.innerHTML = '<p class="ui">Рисунок не построился: ' + esc(e.message) + '</p>'; } };
    def.init(w); w.plot();
    var lastW = el.clientWidth;
    if ('ResizeObserver' in window) { var t; var ro = new ResizeObserver(function () { if (Math.abs(el.clientWidth - lastW) < 8) return; lastW = el.clientWidth; clearTimeout(t); t = setTimeout(w.plot, 120); }); ro.observe(el); w.ro = ro; }
    mounted.push(w);
  }
  window.WIDGETS = {
    list: Object.keys(REG),
    mountAll: function (root, C, step) {
      mounted.forEach(function (w) { if (w.ro) w.ro.disconnect(); }); mounted = [];
      root.querySelectorAll('[data-widget]').forEach(function (el) {
        var def = REG[el.dataset.widget], fig = (step.figures || []).filter(function (f) { return f.id === el.dataset.fig; })[0];
        if (def) mount(el, def, fig, C, step); else el.innerHTML = '<p class="ui">Нет шаблона рисунка «' + esc(el.dataset.widget) + '».</p>';
      });
    },
    redrawAll: function () { mounted.forEach(function (w) { w.plot(); }); }
  };
})();
