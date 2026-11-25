// Детерминированные проверки ответа модели по узлу — до записи в слой. Что можно исправить без модели, исправляется здесь
// (страница цитаты, нотация индексов в цитате); остальное уходит модели на исправление списком ошибок.
import { quoteOnPage, locateQuote, numbers, plain } from '../../build/lib/source.mjs';

export const words = s => (plain(s).match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-–][A-Za-zА-Яа-яЁё0-9]+)*/g) || []).length;
export const sentences = s => plain(s).split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z«(])/).map(x => x.trim()).filter(Boolean);

// Все числа текста узла, которые видит читатель, кроме разборов примеров, заданий и цитат (там допустимы расчётные числа и текст автора)
function readerNumbers(n) {
  const parts = [n.title, ...(n.essence || []), ...(n.how || []).map(h => h.text), ...(n.claims || []).map(c => c.text), ...(n.numbers || []).map(x => `${x.value} ${x.cond}`), ...(n.glossary || []).map(g => g.def), n.mistake?.right, n.mistake?.wrong, n.card?.back, n.layers?.mechanism, n.layers?.nuances];
  // ссылки «с. N», «рис. N», «табл. N», «скв. N» — не числа автора, их не проверяем
  const stripRefs = t => String(t).replace(/(с\.|стр\.|рис\.|табл\.|скв\.|пример|задач[аи]|формул[аы]|§)\s*\d+[\d.,\s–-]*/gi, ' ');
  return new Set(parts.filter(Boolean).map(stripRefs).flatMap(numbers).filter(x => !(Number.isInteger(+x) && +x <= 10)));
}

export function checkNode(n, { S, from, to, chapterNums }) {
  const hard = [], soft = [], fixes = [];
  const inCh = p => Number.isInteger(p) && p >= from && p <= to;
  const tw = words(n.title);
  if (tw < 3 || tw > 7) hard.push(`title «${n.title}» — ${tw} слов, нужно 3–7`);
  const es = (n.essence || []).flatMap(sentences).length;
  if (es < 2 || es > 3) hard.push(`essence — ${es} фраз, нужно 2–3`);
  const FORMATS = ['шортс', 'длинное видео', 'интерактив', 'практикум на данных', 'карточки', 'текст'];
  if (n.route && !FORMATS.includes(n.route.format)) hard.push(`route.format «${n.route.format}» — нужно одно из: ${FORMATS.join(', ')}`);

  // утверждения и цитаты
  const ids = new Set();
  for (const c of n.claims || []) {
    if (ids.has(c.id)) hard.push(`утверждение ${c.id} повторяется`); ids.add(c.id);
    if (!inCh(c.page)) { hard.push(`утверждение ${c.id}: страница ${c.page} вне главы (${from}–${to})`); continue; }
    if (words(c.quote) < 3) { hard.push(`утверждение ${c.id}: нет цитаты`); continue; }
    if (quoteOnPage(c.quote, S, c.page)) continue;
    const near = [c.page - 1, c.page + 1].find(p => inCh(p) && quoteOnPage(c.quote, S, p));
    if (near) { fixes.push(`${c.id}: страница цитаты ${c.page} → ${near}`); c.page = near; continue; }
    const L = locateQuote(c.quote, S, c.page);
    if (L && L.score >= 0.9 && inCh(L.page)) { fixes.push(`${c.id}: цитата заменена дословным текстом md (совпадение ${L.score})`); c.quote = L.text; c.page = L.page; continue; }
    hard.push(`утверждение ${c.id}: цитата «${String(c.quote).slice(0, 90)}…» не найдена дословно на с. ${c.page}${L ? ` (ближайшее совпадение ${L.score} на с. ${L.page})` : ''}`);
  }
  if (!(n.claims || []).length) hard.push('нет ни одного утверждения с цитатой');

  // абзацы
  if (!(n.how || []).length) hard.push('пустой блок how');
  (n.how || []).forEach((h, i) => {
    if (!inCh(h.page)) hard.push(`how[${i}]: страница ${h.page} вне главы`);
    for (const c of h.claims || []) if (!ids.has(c)) hard.push(`how[${i}] ссылается на несуществующее утверждение ${c}`);
    if (!(h.claims || []).length) soft.push(`how[${i}]: абзац без ссылки на утверждение`);
    for (const s of sentences(h.text)) if (words(s) > 20) soft.push(`how[${i}]: фраза длиннее 20 слов (${words(s)}): «${plain(s).slice(0, 60)}…» — разбей`);
  });

  // страницы остальных блоков
  const pg = (what, p) => { if (p != null && !inCh(p)) hard.push(`${what}: страница ${p} вне главы`); };
  (n.examples || []).forEach(e => pg(`пример ${e.title}`, e.page));
  (n.numbers || []).forEach(x => pg(`число ${x.name}`, x.page));
  (n.formulas || []).forEach(f => pg(`формула ${f.expr}`, f.page));
  (n.tables || []).forEach(t => pg(`таблица ${t.title}`, t.page));
  (n.glossary || []).forEach(g => pg(`термин ${g.term}`, g.page));
  (n.bookTasks || []).forEach(t => pg(`задача ${t.no}`, t.page));
  if ((n.procedure?.items || []).length) pg('procedure', n.procedure.page);

  // задания
  (n.tasks || []).forEach(t => {
    const w = `задание ${t.id} (${t.type})`;
    if (!ids.has(t.claim)) hard.push(`${w}: claim «${t.claim}» — нет такого утверждения`);
    const opts = t.options || [];
    if (t.type === 'single' && !(opts.length >= 2 && Number.isInteger(t.answerIndex) && opts[t.answerIndex] != null)) hard.push(`${w}: answerIndex вне вариантов`);
    if (t.type === 'multi' && !(opts.length >= 3 && (t.answerIndexes || []).length && t.answerIndexes.every(i => opts[i] != null))) hard.push(`${w}: answerIndexes вне вариантов`);
    if (t.type === 'order' && !((t.items || []).length >= 3)) hard.push(`${w}: для порядка нужно 3–6 пунктов items`);
    if (t.type === 'blank' && !(String(t.text || '').includes('___') && (t.answerText || []).length)) hard.push(`${w}: нужен text с ___ и answerText`);
    if (t.type === 'calc' && !Number.isFinite(t.answerNumber)) hard.push(`${w}: answerNumber должен быть числом`);
    if (sentences(t.explain).length !== 1) soft.push(`${w}: explain должен быть одной фразой`);
  });
  if (!(n.tasks || []).length) hard.push('нет заданий');

  // обязательные блоки
  if (!n.card?.front || !n.card?.back) hard.push('нет карточки card');
  if (!(n.glossary || []).length) soft.push('пустой glossary');
  if (!n.mistake?.wrong || !n.mistake?.right) soft.push('нет частой ошибки mistake');
  if (!n.analogy?.text || !n.analogy?.limit) soft.push('у аналогии нет текста или границы limit');
  if (!(n.data?.input || []).length || !(n.data?.output || []).length) soft.push('пустой мост к данным data');
  const f = n.figure || {};
  if (f.type === 'chain' && (f.items || []).length < 2) soft.push('figure chain: нужно 2–6 пунктов items');
  if (f.type === 'matrix' && !((f.rows || []).length && (f.cols || []).length)) soft.push('figure matrix: нужны cols и rows');

  // числа, которых нет в главе
  const absent = [...readerNumbers(n)].filter(x => !chapterNums.has(x));
  if (absent.length) soft.push(`числа ${absent.slice(0, 12).join(', ')} не найдены в тексте главы`);
  return { hard, soft, fixes };
}
