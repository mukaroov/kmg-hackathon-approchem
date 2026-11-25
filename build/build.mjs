#!/usr/bin/env node
// Сборка демо-курсов из учебного слоя.
//   node build/build.mjs                 — собрать все главы из layer/*
//   node build/build.mjs layer/latyshova-v — собрать одну главу
//   node build/build.mjs --check          — только проверить слой, ничего не писать
// Вход: layer/<глава>/chapter.json + layer/<глава>/nodes/*.json + layer/<глава>/assets/
//       domain/<домен>/legend.json (доменный пакет)
// Выход: dist/<глава>/index.html (открывается двойным щелчком, без сервера) и dist/index.html со списком глав.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportChapter } from './lib/export.mjs';
import { loadConfig } from '../pipeline/lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const targets = args.filter(a => !a.startsWith('--'));
const layerDirs = targets.length ? targets.map(t => path.resolve(ROOT, t)) : fs.readdirSync(path.join(ROOT, 'layer')).map(d => path.join(ROOT, 'layer', d)).filter(d => fs.existsSync(path.join(d, 'chapter.json')));

const ENGINE = path.join(ROOT, 'engine');
const DIST = path.join(ROOT, 'dist');
const TASK_TYPES = { single: 'один ответ', multi: 'несколько ответов', order: 'порядок', blank: 'пропуск в тексте', calc: 'расчёт' };
const LIMIT_MB = 30;

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${path.relative(ROOT, f)}: ${e.message}`); } };
const plain = s => String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a).replace(/[_^]\{([^}]*)\}/g, '$1').replace(/\*\*/g, '');
const words = s => (plain(s).match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-–][A-Za-zА-Яа-яЁё0-9]+)*/g) || []).length;
const sentences = s => plain(s).split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z«(])/).map(x => x.trim()).filter(Boolean);
const walkText = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => walkText(x, out)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['id', 'src', 'poster', 'widget', 'kind', 'class', 'place', 'claim', 'claims', 'type', 'part', 'layers', 'ref', 'sourceKind', 'quoteMd', 'units'].includes(k)) walkText(x, out); }); return out; };
function dirSize(d, skip = /\.mp4$/i) { let n = 0; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) n += dirSize(p, skip); else if (!skip.test(f.name)) n += fs.statSync(p).size; } return n; }
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a, { withFileTypes: true })) { const s = path.join(a, f.name), t = path.join(b, f.name); if (f.isDirectory()) copyDir(s, t); else fs.copyFileSync(s, t); } }
const pageRange = p => { const m = String(p).match(/(\d+)\s*[–-]\s*(\d+)/); return m ? [+m[1], +m[2]] : [+p, +p]; };

function legendCSS(L) {
  const groups = { fluids: 'fl', rocks: 'rk', curves: 'cv', zones: 'zn' };
  const out = { light: [], dark: [] };
  for (const [g, pre] of Object.entries(groups)) for (const [k, v] of Object.entries(L[g] || {})) { out.light.push(`--${pre}-${k}:${v.light}`); out.dark.push(`--${pre}-${k}:${v.dark}`); }
  return `/* Собрано из доменного пакета ${L.id} v${L.version}. Не править вручную. */\n:root{${out.light.join(';')}}\n:root[data-theme=dark]{${out.dark.join(';')}}\n`;
}

// Устойчивая топологическая сортировка: порядок из слоя сохраняется, пока не нарушает связи «предпосылка».
function topoOrder(ids, edges) {
  const pos = new Map(ids.map((id, i) => [id, i]));
  const indeg = new Map(ids.map(id => [id, 0])), out = new Map(ids.map(id => [id, []]));
  for (const e of edges) if (e.type === 'base' && pos.has(e.from) && pos.has(e.to)) { indeg.set(e.to, indeg.get(e.to) + 1); out.get(e.from).push(e.to); }
  const ready = ids.filter(id => indeg.get(id) === 0), order = [];
  while (ready.length) {
    ready.sort((a, b) => pos.get(a) - pos.get(b));
    const id = ready.shift(); order.push(id);
    for (const t of out.get(id)) { indeg.set(t, indeg.get(t) - 1); if (indeg.get(t) === 0) ready.push(t); }
  }
  return order.length === ids.length ? order : null;
}

function buildChapter(dir, legend) {
  const ch = readJSON(path.join(dir, 'chapter.json'));
  const nodesDir = path.join(dir, 'nodes');
  const nodes = {};
  for (const f of fs.readdirSync(nodesDir).filter(f => f.endsWith('.json'))) { const n = readJSON(path.join(nodesDir, f)); nodes[n.id] = n; }
  const checks = [], warnings = [], errors = [];
  const ok = (cond, msg) => { checks.push({ ok: !!cond, msg }); return cond; };
  const [p0, p1] = pageRange(ch.book.pages);

  // 1. Структура: все узлы из частей существуют, нет лишних
  const listed = ch.parts.flatMap(p => p.nodes);
  for (const id of listed) if (!nodes[id]) errors.push(`узел ${id} указан в части, но файла nodes/${id}.json нет`);
  for (const id of Object.keys(nodes)) if (!listed.includes(id)) warnings.push(`узел ${id} не включён ни в одну часть — в курс не попадёт`);
  for (const e of ch.edges) if (!nodes[e.from] || !nodes[e.to]) errors.push(`связь ${e.from} → ${e.to}: узла нет`);
  const order = topoOrder(listed.filter(id => nodes[id]), ch.edges);
  ok(order, 'Граф связей без циклов, все связи указывают на существующие шаги');
  if (!order) errors.push('в связях «предпосылка» есть цикл');
  const ord = order || listed;
  const moved = ord.some((id, i) => id !== listed[i]);
  if (moved) warnings.push('порядок шагов изменён по графу связей (предпосылка раньше следствия)');

  // 2. Узлы
  const steps = [];
  let n = 0;
  const missingBlocks = [];
  const typeCount = {}; let tasks = 0, noClaim = 0, longExpl = 0, longSent = 0, noPage = 0, badTitle = [], badEssence = [], noFig = [], noCard = [], badQuote = 0, outPage = 0, badAnalogy = [];
  const partOf = {}; ch.parts.forEach(p => p.nodes.forEach(id => partOf[id] = p.id));
  for (const id of ord) {
    const s = structuredClone(nodes[id]); s.part = partOf[id]; s.n = ++n;
    const claims = new Set((s.claims || []).map(c => c.id));
    const tw = words(s.title); if (tw < 3 || tw > 7) badTitle.push(`${s.n} «${s.title}» — ${tw} сл.`);
    const es = (s.essence || []).flatMap(sentences).length; if (es < 2 || es > 3) badEssence.push(`${s.n}: ${es} фраз`);
    for (const p of s.how || []) {
      if (!p.page) noPage++;
      if (p.page && (p.page < p0 || p.page > p1)) outPage++;
      for (const sen of sentences(p.text)) if (words(sen) > 20) { longSent++; warnings.push(`шаг ${s.n}: фраза длиннее 20 слов (${words(sen)}): «${plain(sen).slice(0, 70)}…»`); }
      for (const c of p.claims || []) if (!claims.has(c)) errors.push(`шаг ${s.n}: абзац ссылается на несуществующее утверждение ${c}`);
    }
    for (const c of s.claims || []) { if (!c.quote || !c.page) badQuote++; if (c.page && (c.page < p0 || c.page > p1)) outPage++; }
    for (const t of s.tasks || []) {
      tasks++; typeCount[t.type] = (typeCount[t.type] || 0) + 1;
      if (!TASK_TYPES[t.type]) errors.push(`шаг ${s.n}, задание ${t.id}: неизвестный тип ${t.type}`);
      if (!t.claim || !claims.has(t.claim)) { noClaim++; warnings.push(`шаг ${s.n}, задание ${t.id}: нет ссылки на утверждение шага`); }
      if (!t.explain || sentences(t.explain).length > 1) { longExpl++; warnings.push(`шаг ${s.n}, задание ${t.id}: пояснение должно быть одной фразой`); }
      if ((t.type === 'single') && !(t.options && t.options[t.answer] != null)) errors.push(`шаг ${s.n}, задание ${t.id}: ответ вне вариантов`);
      if ((t.type === 'multi') && !(Array.isArray(t.answer) && t.answer.every(i => t.options[i] != null))) errors.push(`шаг ${s.n}, задание ${t.id}: ответ вне вариантов`);
      if (t.type === 'order' && !(Array.isArray(t.items) && t.items.length >= 3)) errors.push(`шаг ${s.n}, задание ${t.id}: для порядка нужно 3+ пункта`);
      if (t.type === 'blank' && !String(t.text || '').includes('___')) errors.push(`шаг ${s.n}, задание ${t.id}: в тексте нет пропуска ___`);
      if (t.type === 'calc' && typeof t.answer !== 'number') errors.push(`шаг ${s.n}, задание ${t.id}: ответ расчёта должен быть числом`);
    }
    if (!(s.figures || []).length) noFig.push(s.n);
    for (const f of s.figures || []) {
      if (!f.alt) warnings.push(`шаг ${s.n}, рисунок ${f.id}: нет альтернативного текста`);
      if ((f.kind === 'scan' || f.kind === 'image') && !fs.existsSync(path.join(dir, f.src))) errors.push(`шаг ${s.n}: нет файла ${f.src}`);
    }
    for (const m of s.media || []) if (!fs.existsSync(path.join(dir, m.src))) errors.push(`шаг ${s.n}: нет ролика ${m.src}`);
    if (!s.card || !s.card.front || !s.card.back) noCard.push(s.n);
    // блоки, которые есть у любого шага (условные — примеры, таблицы, формулы, задачи — проверяются по наличию в главе)
    const REQ = { bookTitle: 'название из книги', essence: 'суть', how: 'как это работает', glossary: 'новые понятия', mistake: 'частая ошибка', data: 'что значит для данных', analogy: 'аналогия', claims: 'источник' };
    const miss = Object.entries(REQ).filter(([k]) => !s[k] || (Array.isArray(s[k]) && !s[k].length)).map(([, v]) => v);
    if (miss.length) missingBlocks.push(`${s.n}: ${miss.join(', ')}`);
    if (s.analogy && !s.analogy.limit) badAnalogy.push(s.n);
    // время на шаг: чтение новичком ~130 слов/мин + задания + интерактив + таблицы + ролики
    const textWords = walkText({ ...s, tasks: undefined, card: undefined }).reduce((a, x) => a + words(x), 0);
    const widgets = (s.figures || []).filter(f => f.kind === 'widget').length;
    const media = (s.media || []).reduce((a, m) => a + (m.duration || 60), 0) / 60;
    s.minutes = Math.max(3, Math.ceil(textWords / 130 + (s.tasks || []).length * 1 + widgets * 2 + (s.tables || []).length * 1.5 + media));
    s.words = textWords;
    steps.push(s);
  }
  const types = Object.keys(typeCount).filter(t => TASK_TYPES[t]);
  ok(tasks >= 15, `Заданий в главе: ${tasks} (нужно не меньше 15)`);
  ok(types.length >= 4, `Типов заданий: ${types.length} из 5 (${types.map(t => TASK_TYPES[t] + ' — ' + typeCount[t]).join(', ')}); нужно не меньше 4`);
  ok(noClaim === 0, noClaim ? `${noClaim} заданий без ссылки на утверждение узла` : 'У каждого задания есть ссылка на утверждение узла');
  ok(longExpl === 0, longExpl ? `${longExpl} пояснений длиннее одной фразы` : 'Пояснение к каждому заданию — одна фраза');
  ok(!noCard.length, noCard.length ? `Нет карточки у шагов: ${noCard.join(', ')}` : `Карточки повторения есть на всех ${steps.length} узлах`);
  ok(!noFig.length, noFig.length ? `Нет иллюстрации у шагов: ${noFig.join(', ')}` : 'Не меньше одной иллюстрации на шаг');
  for (const p of ch.parts) { const has = p.nodes.some(id => (nodes[id]?.figures || []).some(f => f.class === 'A' || f.class === 'B')); ok(has, `Часть «${p.short || p.title}»: ${has ? 'есть' : 'нет'} рисунка класса A или B`); }
  ok(!missingBlocks.length, missingBlocks.length ? `Не хватает обязательных блоков — шаги ${missingBlocks.join('; ')}` : 'Во всех шагах есть обязательные блоки: суть, как это работает, понятия, частая ошибка, данные, аналогия, источник');
  ok(!badTitle.length, badTitle.length ? `Заголовки не в 3–7 слов: ${badTitle.join('; ')}` : 'Заголовки для новичка: 3–7 слов, название из книги рядом');
  ok(!badEssence.length, badEssence.length ? `Суть не в 2–3 фразы: ${badEssence.join('; ')}` : 'Суть шага: 2–3 фразы');
  ok(noPage === 0, noPage ? `${noPage} абзацев без страницы` : '«с. N» у каждого абзаца «Как это работает»');
  ok(longSent === 0, longSent ? `${longSent} фраз длиннее 20 слов (см. замечания)` : 'Фразы в «Как это работает» не длиннее 20 слов');
  ok(badQuote === 0, badQuote ? `${badQuote} утверждений без цитаты или страницы` : 'У каждого утверждения есть дословная цитата автора и страница');
  ok(outPage === 0, outPage ? `${outPage} ссылок на страницы вне главы (${ch.book.pages})` : `Все ссылки на страницы — в пределах главы (с. ${ch.book.pages})`);
  ok(!badAnalogy.length, badAnalogy.length ? `Аналогия без границы: шаги ${badAnalogy.join(', ')}` : 'У каждой аналогии названа граница, где она ломается');
  const decision = steps.some(s => s.dataDecision);
  ok(decision, decision ? 'Есть шаг «решение на данных»' : 'Нет шага «решение на данных»');

  // 3. Экспорт в форматы организаторов и сверка с выданным md главы
  const ex = exportChapter({ root: ROOT, dir, ch, steps, schemas: SCHEMAS });
  ex.checks.forEach(c => checks.push(c));
  ex.warnings.forEach(w => warnings.push(w));
  if (!CHECK_ONLY && ex.layer) {
    const exDir = path.join(ROOT, 'export', ch.id);
    fs.mkdirSync(exDir, { recursive: true });
    fs.writeFileSync(path.join(exDir, 'layer.json'), JSON.stringify(ex.layer, null, 1));
    fs.writeFileSync(path.join(exDir, 'coverage.json'), JSON.stringify(ex.coverage, null, 1));
    if (ex.routing) fs.writeFileSync(path.join(exDir, 'routing.json'), JSON.stringify(ex.routing, null, 1));
    if (ex.tasks) fs.writeFileSync(path.join(exDir, 'tasks.json'), JSON.stringify(ex.tasks, null, 1));
    if (ex.illustrations) fs.writeFileSync(path.join(exDir, 'illustrations.json'), JSON.stringify(ex.illustrations, null, 1));
  }

  const out = path.join(DIST, ch.id);
  const report = { built: new Date().toISOString(), checks, warnings, errors };
  if (errors.length) { console.error(`\n✗ ${ch.id}: ошибки слоя\n  - ` + errors.join('\n  - ')); }
  if (!CHECK_ONLY && !errors.length) {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const f of ['course.css', 'course.js', 'widgets.js']) fs.copyFileSync(path.join(ENGINE, f), path.join(out, f));
    copyDir(path.join(ENGINE, 'fonts'), path.join(out, 'fonts'));
    if (fs.existsSync(path.join(dir, 'assets'))) copyDir(path.join(dir, 'assets'), path.join(out, 'assets'));
    fs.writeFileSync(path.join(out, 'legend.css'), legendCSS(legend));
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = fs.readFileSync(path.join(ENGINE, 'index.html'), 'utf8').replaceAll('{{TITLE}}', esc(ch.title)).replaceAll('{{SUBTITLE}}', esc(ch.subtitle || '')).replaceAll('{{DESCRIPTION}}', esc(ch.description || ''));
    fs.writeFileSync(path.join(out, 'index.html'), html);
    const sizeMB = dirSize(out) / 1048576;
    ok(sizeMB <= LIMIT_MB, `Размер курса без видео: ${sizeMB.toFixed(1)} МБ (нужно не больше ${LIMIT_MB} МБ)`);
    const parts = ch.parts.map(p => ({ id: p.id, title: p.title, short: p.short, sub: p.sub, steps: ord.filter(id => p.nodes.includes(id)) }));
    const course = { id: ch.id, schema: ch.schema, layerVersion: ch.version, title: ch.title, subtitle: ch.subtitle, description: ch.description, intro: ch.intro, book: ch.book, difficulty: ch.difficulty, parts, steps, edges: ch.edges, errata: (ch.errata || []).slice().sort((a, b) => a.page - b.page), legend, report };
    fs.writeFileSync(path.join(out, 'course-data.js'), '/* Собрано build/build.mjs из layer/' + path.basename(dir) + '. Не править вручную: правьте учебный слой и пересоберите. */\nwindow.COURSE = ' + JSON.stringify(course) + ';\n');
    fs.writeFileSync(path.join(out, 'build-report.json'), JSON.stringify(report, null, 2));
  }
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${errors.length ? '✗' : '✓'} ${ch.id} — ${steps.length} шагов, ${tasks} заданий, ${failed ? failed + ' проверок не пройдено' : 'все проверки пройдены'}${CHECK_ONLY ? ' (только проверка)' : ' → dist/' + ch.id + '/index.html'}`);
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '!'} ${c.msg}`);
  if (warnings.length) console.log(`  замечаний: ${warnings.length} (полный список — в dist/${ch.id}/build-report.json и на странице «Источник»)`);
  return { id: ch.id, title: ch.title, book: ch.book, steps: steps.length, tasks, minutes: steps.reduce((a, s) => a + s.minutes, 0), ok: !errors.length, complete: ch.complete !== false };
}

const legend = readJSON(path.join(ROOT, 'domain', 'geo', 'legend.json'));
const SCHEMAS = { node: readJSON(path.join(ROOT, 'schemas', 'node.schema.json')), coverage: readJSON(path.join(ROOT, 'schemas', 'coverage.schema.json')), routing: readJSON(path.join(ROOT, 'schemas', 'routing.schema.json')), task: readJSON(path.join(ROOT, 'schemas', 'task.schema.json')), illustration: readJSON(path.join(ROOT, 'schemas', 'illustration.schema.json')) };
const built = [];
let failed = false;
for (const d of layerDirs) { try { const r = buildChapter(d, legend); built.push(r); if (!r.ok) failed = true; } catch (e) { failed = true; console.error(`✗ ${path.relative(ROOT, d)}: ${e.message}`); } }

// Блок «Собрать курс из своей главы»: список открыт как файл, а конвейер — локальный сервер. Страница проверяет,
// отвечает ли сервер (запрос без чтения ответа, CORS не нужен), и даёт кнопку загрузки или подсказку, как его запустить.
function addChapterBlock() {
  const c = loadConfig(), url = `http://${c.host}:${c.port}/`;
  return `<section class="add" aria-labelledby="add-h"><h2 id="add-h">Собрать курс из своей главы</h2>
<p>Загрузите главу книги в формате .md или .pdf: конвейер отправит её модели, проверит учебный слой и соберёт новый курс в этот же список.</p>
<p id="srv" aria-live="polite">Проверяю, запущен ли конвейер…</p></section>
<script>(function(){var u=${JSON.stringify(url)},el=document.getElementById('srv');
function off(){el.innerHTML='Загрузка работает через локальный конвейер. Если он не запущен, запустите его двойным щелчком по <code>start.cmd</code> в папке проекта (macOS и Linux: <code>./start.sh</code>) или командой <code>node pipeline/server.mjs --open</code>. <a class="btn" href="'+u+'">Открыть загрузку главы →</a>';}
var t=setTimeout(off,2500);
fetch(u+'api/health',{mode:'no-cors',cache:'no-store'}).then(function(){clearTimeout(t);el.innerHTML='Конвейер запущен. <a class="btn" href="'+u+'">Открыть загрузку главы →</a>';}).catch(function(){clearTimeout(t);off();});})();</script>`;
}

// Список курсов — по всем собранным главам в dist/, а не только по собранным сейчас: курс, который собрал конвейер
// по одной главе, тоже попадает в dist/index.html.
function listBuilt() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(DIST, d.name, 'course-data.js'))).map(d => {
    try {
      const js = fs.readFileSync(path.join(DIST, d.name, 'course-data.js'), 'utf8');
      const c = JSON.parse(js.slice(js.indexOf('window.COURSE = ') + 16).replace(/;\s*$/, ''));
      const ch = path.join(ROOT, 'layer', d.name, 'chapter.json');
      const complete = fs.existsSync(ch) ? readJSON(ch).complete !== false : true;
      return { id: c.id, title: c.title, book: c.book, steps: c.steps.length, tasks: c.steps.reduce((a, x) => a + (x.tasks || []).length, 0), minutes: c.steps.reduce((a, x) => a + (x.minutes || 0), 0), ok: true, complete, auto: fs.existsSync(path.join(ROOT, 'layer', d.name, 'pipeline-run.json')) };
    } catch { return null; }
  }).filter(Boolean);
}

if (!CHECK_ONLY) {
  const listed = listBuilt();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const first = listed[0];
  const items = listed.map(b => `<li><a href="${b.id}/index.html"><b>${esc(b.title)}</b></a><span>${esc(b.book.author)}. ${esc(b.book.title)}, ${esc(b.book.year)}. ${esc(b.book.chapter)}, с. ${esc(b.book.pages)}</span><span class="m">${b.steps} шагов · ${b.tasks} заданий · около ${Math.round(b.minutes / 60 * 10) / 10} ч${b.auto ? ' · собран конвейером' : ''}${b.complete ? '' : (b.auto ? ' · <em>есть неисправленные замечания конвейера</em>' : ' · <em>слой неполный: перенесён из старой версии</em>')}</span></li>`).join('');
  fs.writeFileSync(path.join(DIST, 'index.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Демо-курсы по главам</title>
<script>try{var t=localStorage.getItem('strata-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}</script>
<link rel="stylesheet" href="${first ? first.id : ''}/course.css"><style>ul.c{list-style:none;padding:0;margin:24px 0}ul.c li{border-top:1px solid var(--rule);padding:16px 0}ul.c a{font-size:22px}ul.c span{display:block;font:16px/1.45 var(--sans);color:var(--ink-2)}ul.c .m{color:var(--muted)}section.add{border:1px solid var(--rule);border-radius:8px;padding:4px 18px 10px;margin:8px 0 24px}section.add h2{font-size:22px}section.add p{font:16px/1.5 var(--sans)}section.add .btn{display:inline-block;margin-left:6px;padding:8px 14px;border-radius:6px;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:600}</style></head>
<body><main class="wrap"><div class="page"><p class="kicker">Глава → курс</p><h1>Демо-курсы по главам</h1><p>Каждый курс открывается в браузере без сервера и без входа. Прогресс сохраняется в этом браузере.</p><ul class="c">${items}</ul>${addChapterBlock()}<p class="ui muted">Собрано ${new Date().toLocaleString('ru')} командой <code>node build/build.mjs</code>.</p></div></main></body></html>`);
  console.log('\n→ dist/index.html');
}
process.exit(failed ? 1 : 0);
