// Работа с выданным md главы: страницы по меткам <!-- page N -->, сверка цитат и чисел, деление на единицы главы.
import fs from 'node:fs';

export function readSource(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const pages = {};
  let cur = 0;
  for (const line of raw.split('\n')) {
    const m = line.match(/<!-- page (\d+) -->/);
    if (m) { cur = +m[1]; pages[cur] = pages[cur] || ''; continue; }
    if (cur) pages[cur] += line + '\n';
  }
  return { file, pages };
}

// Правило организаторов: цитата дословная, при сверке не учитываются пробелы, переносы строк и регистр.
export const strictNorm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
export const quoteOnPage = (quote, src, page) => !!quote && strictNorm(src.pages[page] || '').includes(strictNorm(quote));

// Разметка учебного слоя → обычный текст
export const plain = s => String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a).replace(/[_^]\{([^}]*)\}/g, '$1').replace(/\*\*/g, '');

// Слова для нечёткой привязки: буквенные токены от 3 знаков и числа; индексы формул (ρп, kв) отбрасываются,
// потому что распознавание md часто путает кириллические и латинские индексы.
function tokens(s) {
  const out = [], re = /[A-Za-zА-Яа-яЁё]{3,}|\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0].toLowerCase().replace(/ё/g, 'е').replace(',', '.'), a: m.index, b: m.index + m[0].length });
  return out;
}

// Находит в md страницы фрагмент, который дословно соответствует цитате слоя (с поправкой на нотацию индексов).
// Возвращает { page, text, score } или null.
function alignSegment(seg, text) {
  const q = tokens(plain(seg)).map(x => x.t);
  if (q.length < 3) return null;
  const T = tokens(text);
  let best = null;
  const heads = new Set(q.slice(0, 8));
  for (let i = 0; i < T.length; i++) {
    if (!heads.has(T[i].t)) continue;
    const W = T.slice(i, i + Math.ceil(q.length * 1.6) + 4);
    // LCS между цитатой и окном, с восстановлением первого и последнего совпадения
    const n = q.length, m = W.length, D = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let a = 1; a <= n; a++) for (let b = 1; b <= m; b++) D[a][b] = q[a - 1] === W[b - 1].t ? D[a - 1][b - 1] + 1 : Math.max(D[a - 1][b], D[a][b - 1]);
    const score = D[n][m] / n;
    if (best && score <= best.score) continue;
    let a = n, b = m, first = -1, last = -1;
    while (a > 0 && b > 0) {
      if (q[a - 1] === W[b - 1].t) { if (last < 0) last = b - 1; first = b - 1; a--; b--; }
      else if (D[a - 1][b] >= D[a][b - 1]) a--; else b--;
    }
    if (first >= 0) best = { score, a: W[first].a, b: W[last].b };
  }
  return best;
}

export function locateQuote(quote, src, page) {
  const segs = String(quote).split(/…|\.\.\./).map(s => s.trim()).filter(s => tokens(plain(s)).length >= 3);
  if (!segs.length) return null;
  let res = null;
  // Ищем на стыке двух соседних страниц: цитата может переходить со страницы на страницу.
  // Если найденный фрагмент пересекает границу, оставляем его бо́льшую часть: цитата должна лежать на одной странице.
  for (const p of [page, page - 1]) {
    if (src.pages[p] == null && src.pages[p + 1] == null) continue;
    const left = src.pages[p] || '', text = left + '\n' + (src.pages[p + 1] || ''), border = left.length;
    const found = segs.map(s => alignSegment(s, text));
    if (found.some(f => !f || f.score < 0.8)) continue;
    const score = found.reduce((x, f) => x + f.score, 0) / found.length;
    let a = Math.min(...found.map(f => f.a)), b = Math.max(...found.map(f => f.b));
    if (b - a > 900) { const f = found.slice().sort((x, y) => (y.b - y.a) - (x.b - x.a))[0]; a = f.a; b = f.b; }
    let onPage = p;
    if (a < border && b > border) {
      const l = tokens(text.slice(a, border)).length, r = tokens(text.slice(border, b)).length;
      if (l >= r) b = border; else { a = border + 1; onPage = p + 1; }
    } else if (a > border) onPage = p + 1;
    const cand = { page: onPage, text: text.slice(a, b).replace(/\s+/g, ' ').trim(), score: Math.round(score * 100) / 100 };
    const better = !res || (cand.page === page) > (res.page === page) || ((cand.page === page) === (res.page === page) && cand.score > res.score);
    if (better) res = cand;
  }
  return res;
}

// Числа: «1,5», «10^{−3}», «4–8» → {1.5, 10, 3, 4, 8}
export function numbers(s) {
  const t = plain(s).replace(/\\[a-zA-Z]+/g, ' ').replace(/[−–—]/g, ' ');
  return [...new Set((t.match(/\d+(?:[.,]\d+)?/g) || []).map(x => String(parseFloat(x.replace(',', '.')))))];
}
export function pageNumbers(src, pages) {
  const set = new Set();
  for (const p of pages) for (const n of numbers(src.pages[p] || '')) set.add(n);
  return set;
}

// Деление главы на единицы: абзац, рисунок, формула, таблица, разобранный пример, задача, заголовок.
// Описание рисунка, которое при извлечении вставила модель («----\n━━━ FORMAT …\n----»), — не текст автора,
// а часть рисунка: такой блок становится одной единицей «рисунок» и привязывается к ближайшей подписи «Рис. N».
// Начало описания — блок с «━━━ FORMAT», конец — разделитель «----» или строка «KEYWORDS:».
const DESC_START = /^(-{3,}\s*)?━━━/, DESC_END = b => /^-{3,}$/.test(b) || /(^|\n)KEYWORDS:/.test(b) || /\n-{3,}\s*$/.test(b);
const excerptOf = b => plain(b).replace(/[#|*$\\━]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' ');

export function splitUnits(src, from, to, startRe, endRe) {
  const units = [];
  let started = !startRe, ended = false;
  let desc = null; // открытое описание рисунка
  for (let p = from; p <= to; p++) {
    const blocks = (src.pages[p] || '').replace(/<!--[\s\S]*?-->/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    let k = 0;
    for (const b of blocks) {
      if (!started) { if (startRe.test(b)) started = true; else continue; }
      if (endRe && endRe.test(b)) { ended = true; break; }
      if (DESC_START.test(b)) {
        k++;
        desc = { unit_id: `p${String(p).padStart(3, '0')}.${String(k).padStart(2, '0')}`, kind: 'figure', page_pdf: p, excerpt: 'описание рисунка, сделанное моделью при извлечении: ' + excerptOf(b.replace(/^-+\s*/, '')), text: b, description: true };
        units.push(desc);
        if (DESC_END(b.replace(/^-{3,}\s*/, ''))) desc = null;
        continue;
      }
      if (desc) { desc.text += '\n\n' + b; if (DESC_END(b)) desc = null; continue; }
      if (/^\d{1,4}$/.test(b) || /^-{3,}$/.test(b)) continue; // номер печатной страницы, разделитель
      const prev = units[units.length - 1];
      // подписи и заголовки на русском и английском: тестовые главы могут быть на другом языке
      const kind = /^#{1,6}\s*(Рис\.|Fig\.|Figure\s)|^(Рис\.|Fig\.|Figure)\s*\d/i.test(b) ? 'figure'
        : /^!\[[^\]]*\]\([^)]*\)\s*$/.test(b) ? 'figure'
        : /^#{1,6}\s/.test(b) ? 'heading'
        : /^\|/.test(b) || /^#*\s*(Таблица|Table)\s+\d/i.test(b) ? 'table'
        : /^(Пример|Example)\s+\d+/i.test(b) ? 'worked_example'
        : /^\d{2,3}\.\s+[A-ZА-ЯЁ]/.test(b) ? 'task'
        : /^(\$\$|\\\[)/.test(b) ? 'formula'
        : 'paragraph';
      // строки таблицы, разорванные пустой строкой или страницей, и абзац, продолженный со строчной буквы, склеиваем
      if (prev && ((kind === 'table' && prev.kind === 'table' && /^\|/.test(b)) || (kind === 'paragraph' && /^[а-яёa-z]/.test(b) && !prev.description))) { prev.text += '\n' + b; continue; }
      k++;
      units.push({ unit_id: `p${String(p).padStart(3, '0')}.${String(k).padStart(2, '0')}`, kind, page_pdf: p, excerpt: excerptOf(b), text: b });
    }
    if (ended) break;
  }
  // описанию рисунка — номер ближайшей подписи «Рис. N» на той же странице
  units.forEach((u, i) => {
    if (!u.description) return;
    let best = null;
    units.forEach((v, j) => { const m = !v.description && v.kind === 'figure' && v.page_pdf === u.page_pdf && v.text.match(/(?:Рис\.|Fig\.|Figure)\s*(\d+(?:\.\d+)?)/i); if (m && (!best || Math.abs(j - i) < best.d)) best = { d: Math.abs(j - i), no: m[1] }; });
    if (best) u.figNo = best.no;
  });
  return units;
}

export { tokens };
