#!/usr/bin/env node
// Сборка доменного пакета для новой области по главе книги (например, бурения):
//   node pipeline/domain.mjs <глава.md> --id drilling [--pages 10-30] [--hint "бурение"] [--provider agent|cli:claude|…] [--force]
// Пишет domain/<id>/: domain.json, misconceptions.json, physics_checklist.json, glossary_seed.json, glossary.md,
// pronunciation.md, stress_dictionary.md, it_bridges.md (заготовка), стили кадров (копия из --from, по умолчанию geo), README.md
// со временем сборки и build.json. Код конвейера не меняется: дальше
//   node pipeline/run.mjs <глава.md> --domain <id> …   и   node tools/domain-collect.mjs --domain <id>
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig, providerOverrides } from './lib/config.mjs';
import { createLLM } from './lib/llm.mjs';
import { tpl } from './lib/stages.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !/^--/.test(args[i - 1] || ''));
const id = opt('id');
if (!file || !id) { console.log('Использование: node pipeline/domain.mjs <глава.md> --id drilling [--pages 10-30] [--hint "бурение"] [--from geo] [--provider …] [--force]'); process.exit(2); }
if (!/^[a-z0-9_-]+$/.test(id)) { console.error('id пакета — латиница, цифры, _ и -'); process.exit(2); }
const from = opt('from') || 'geo';
const dir = path.join(ROOT, 'domain', id), src = path.join(ROOT, 'domain', from);
if (fs.existsSync(path.join(dir, 'domain.json')) && !args.includes('--force')) { console.error(`domain/${id} уже есть; --force — собрать заново`); process.exit(2); }

const t0 = Date.now(), started = new Date().toISOString();
const log = m => console.log('  ' + m);
const meter = {};
const cfg = loadConfig(providerOverrides(opt('provider'), opt('cli-model'), loadConfig().model));
const llm = createLLM(cfg, { log, meter });

// ---------- текст главы ----------
const raw = fs.readFileSync(file, 'utf8');
const pages = new Map();
let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/<!--\s*page\s+(\d+)\s*-->/i);
  if (m) { cur = +m[1]; pages.set(cur, ''); continue; }
  if (cur != null) pages.set(cur, pages.get(cur) + line + '\n');
}
let text;
if (pages.size) {
  const [a, b] = (opt('pages') || '').split('-').map(Number);
  const pick = [...pages.keys()].filter(p => !opt('pages') || (p >= a && p <= (b || a)));
  text = pick.map(p => `<!-- page ${p} -->\n${pages.get(p).trim()}\n`).join('\n');
} else text = raw;
const LIMIT = 90000;
if (text.length > LIMIT) { log(`текст главы ${text.length} символов, модели уходит первые ${LIMIT}`); text = text.slice(0, LIMIT); }
const pageNums = [...text.matchAll(/<!-- page (\d+) -->/g)].map(m => +m[1]);

// ---------- запрос модели ----------
const TEMPLATES = {
  pressure_wave_2d: 'поле давления вокруг скважины: вид сверху и профиль, волна депрессии, режим давления или дебита',
  formula_dynamic_plot: 'график зависимости по формуле: параметр меняется во времени, формула и подписи на экране',
  well_log_sync: 'кривые по глубине синхронно с разрезом и прибором в стволе: глубина прибора двигает и прибор, и точку кривой',
  crossplot_cutoff: 'кроссплот двух величин с граничным значением (отсечкой) и классами точек',
  geological_evolution: 'разрез, который развивается во времени: накопление слоёв, размыв, деформация',
};
const KEYS = ['М', 'В', 'И', 'Ф', 'П', 'Пр', 'Н', 'Р'];
const str = { type: 'string' };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'audience', 'notation', 'hints', 'difficulty', 'misconceptions', 'physicsChecklist', 'pronunciation', 'stress', 'glossary', 'sceneTemplates', 'newTemplates', 'dataSources'],
  properties: {
    name: str, audience: str, notation: str,
    hints: { type: 'array', items: str },
    difficulty: { type: 'object', additionalProperties: false, required: KEYS, properties: Object.fromEntries(KEYS.map(k => [k, str])) },
    misconceptions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'page'], properties: { id: str, text: str, page: { type: ['integer', 'null'] } } } },
    physicsChecklist: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'group', 'item'], properties: { id: str, group: str, item: str } } },
    pronunciation: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sym', 'read'], properties: { sym: str, read: str } } },
    stress: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'stressed'], properties: { word: str, stressed: str } } },
    glossary: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['term', 'en', 'def', 'page'], properties: { term: str, en: str, def: str, page: { type: ['integer', 'null'] } } } },
    sceneTemplates: { type: 'object', additionalProperties: false, required: KEYS, properties: Object.fromEntries(KEYS.map(k => [k, { type: 'array', items: { type: 'string', enum: Object.keys(TEMPLATES) } }])) },
    newTemplates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'what'], properties: { type: str, what: str } } },
    dataSources: { type: 'array', items: str },
  },
};
const system = 'Ты — этап конвейера «глава книги → учебный слой → демо-курс»: собираешь доменный пакет новой области нефтегаза. Пиши по-русски, коротко и проверяемо. Ответ — один JSON-объект по заданной схеме, без пояснений вокруг.';
const user = tpl('domain', { id, hint: opt('hint') || 'не задана — определи по тексту', templates: Object.entries(TEMPLATES).map(([k, v]) => `- ${k}: ${v}`), text });

let data, problems = [];
const models = new Set();
for (let round = 0; round <= 2; round++) {
  const r = await llm.json({ stage: 'domain', name: round ? `domain-fix${round}` : 'domain', system, user: round ? `${user}\n\n# Исправь ответ\n\nПрошлый ответ:\n${JSON.stringify(data)}\n\nЗамечания проверки:\n${problems.map(p => '- ' + p).join('\n')}` : user, schema, task: { stage: 'domain', id, pages: pageNums } });
  data = r.data; if (r.model) models.add(r.model);
  problems = check(data);
  if (!problems.length) break;
  log(`замечания к пакету (${problems.length}): ${problems.slice(0, 5).join('; ')}`);
}

function check(d) {
  const e = [];
  const uniq = (arr, key, re, what) => { const seen = new Set(); for (const x of arr || []) { if (!re.test(x[key])) e.push(`${what} ${x[key]}: id вида ${re.source}`); if (seen.has(x[key])) e.push(`${what} ${x[key]} повторяется`); seen.add(x[key]); } };
  uniq(d.misconceptions, 'id', /^misc\.[a-z0-9_]+$/, 'заблуждение');
  uniq(d.physicsChecklist, 'id', /^pc\.[a-z0-9_]+$/, 'пункт чек-листа');
  if ((d.misconceptions || []).length < 5) e.push('заблуждений меньше 5');
  if ((d.physicsChecklist || []).length < 8) e.push('пунктов чек-листа меньше 8');
  if ((d.glossary || []).length < 10) e.push('терминов глоссария меньше 10');
  const pset = new Set(pageNums);
  for (const g of d.glossary || []) if (g.page != null && pset.size && !pset.has(g.page)) e.push(`термин «${g.term}»: страницы ${g.page} нет в главе`);
  for (const m of d.misconceptions || []) if (m.page != null && pset.size && !pset.has(m.page)) e.push(`заблуждение ${m.id}: страницы ${m.page} нет в главе`);
  for (const s of d.stress || []) if (!s.stressed.includes('́') || s.stressed.replace(/́/g, '').toLowerCase() !== s.word.toLowerCase()) e.push(`ударение «${s.stressed}»: нужен знак U+0301 в том же слове «${s.word}»`);
  for (const p of d.pronunciation || []) if (/\d/.test(p.read)) e.push(`произношение «${p.sym}»: в чтении не должно быть цифр`);
  return e;
}

// ---------- файлы пакета ----------
fs.mkdirSync(dir, { recursive: true });
const W = (f, s) => fs.writeFileSync(path.join(dir, f), typeof s === 'string' ? s : JSON.stringify(s, null, 1) + '\n');
const copied = [];
for (const f of ['styleguide.json', 'video_style.json', 'legend.json']) if (fs.existsSync(path.join(src, f))) { fs.copyFileSync(path.join(src, f), path.join(dir, f)); copied.push(f); }
const domainJson = {
  id, name: data.name, audience: data.audience, notation: data.notation,
  hints: [...data.hints, `Типичные источники данных области: ${data.dataSources.join('; ')}.`],
  difficulty: data.difficulty,
  misconceptions: 'misconceptions.json', physicsChecklist: 'physics_checklist.json',
  legend: copied.includes('legend.json') ? 'legend.json' : `../${from}/legend.json`,
  glossary: 'glossary.md', itBridges: 'it_bridges.md', styleguide: 'styleguide.json', videoStyle: 'video_style.json',
  pronunciation: 'pronunciation.md', stressDictionary: 'stress_dictionary.md',
  sceneTemplates: data.sceneTemplates,
};
W('domain.json', domainJson);
W('misconceptions.json', data.misconceptions.map(m => ({ id: m.id, text: m.text, ...(m.page != null ? { page: m.page } : { note: 'знание модели, в главе не опровергается' }) })));
W('physics_checklist.json', data.physicsChecklist);
W('glossary_seed.json', data.glossary);
const who = path.basename(file);
W('glossary.md', `# Глоссарий RU/EN (домен ${id})\n\nЗаготовка из главы ${who} (этап pipeline/domain.mjs, определения пишет модель). После прогона глав \`node tools/domain-collect.mjs --domain ${id}\` дополняет его терминами слоёв. ${data.glossary.length} терминов.\n\n| Термин | EN | Определение | Где |\n| --- | --- | --- | --- |\n${data.glossary.map(g => `| ${g.term} | ${g.en || '—'} | ${g.def} | с. ${g.page ?? '—'} |`).join('\n')}\n`);
W('it_bridges.md', `# ИТ-мосты и где они ломаются (домен ${id})\n\nСобираются из учебных слоёв: \`node tools/domain-collect.mjs --domain ${id}\` после прогона глав.\n`);
W('pronunciation.md', `# Произношение обозначений и аббревиатур (домен ${id})\n\nСобрано по главе ${who}. Этап видео заменяет обозначение в тексте озвучки на колонку «Читается»; субтитры остаются как в сценарии.\n\n## Обозначения и аббревиатуры\n\n| Обозначение | Читается |\n| --- | --- |\n${data.pronunciation.map(p => `| ${p.sym} | ${p.read} |`).join('\n')}\n`);
W('stress_dictionary.md', `# Ударения в терминах (домен ${id})\n\nУдарение — знак U+0301 после ударной гласной. Этап видео ставит ударения в текст озвучки при TTS_STRESS=1.\n\n## Ударения\n\n| Слово | С ударением |\n| --- | --- |\n${data.stress.map(s => `| ${s.word} | ${s.stressed} |`).join('\n')}\n`);

const seconds = Math.round((Date.now() - t0) / 1000);
const usage = Object.values(meter).reduce((a, m) => ({ in: a.in + (m.in || 0), out: a.out + (m.out || 0), calls: a.calls + (m.calls || 0), cached: a.cached + (m.cached || 0) }), { in: 0, out: 0, calls: 0, cached: 0 });
const build = { id, source: who, pages: pageNums.length ? `${Math.min(...pageNums)}–${Math.max(...pageNums)}` : 'все', started, finished: new Date().toISOString(), seconds, provider: cfg.provider, model: cfg.provider === 'stub' ? 'заглушка' : [...models].join(', ') || cfg.modelLabel || cfg.model, usage, unresolved: problems, copiedFrom: from, copied };
W('build.json', build);
const fitting = KEYS.filter(k => data.sceneTemplates[k].length).map(k => `| ${k} ${data.difficulty[k]} | ${data.sceneTemplates[k].map(t => '`' + t + '`').join(', ')} |`);
W('README.md', `# Доменный пакет \`${id}\`: ${data.name}

Собран командой \`node pipeline/domain.mjs ${who} --id ${id}\` по главе ${who} (с. ${build.pages}). Код конвейера при этом не менялся: пакет подключается по имени (\`--domain ${id}\`).

## Время сборки пакета

- Этап модели: **${seconds} с** (${new Date(started).toLocaleString('ru-RU')}), модель — ${build.model}, запросов ${usage.calls}, токены: вход ${usage.in}, выход ${usage.out}.
- Ручной работы: 0 минут. Правки человека, если будут, пишутся в \`logs/manual_edits.csv\`.
- Глоссарий и ИТ-мосты дополняются из слоёв после прогона глав: \`node tools/domain-collect.mjs --domain ${id}\` (секунды).
${problems.length ? `- Не исправлено моделью за 2 круга: ${problems.join('; ')}\n` : ''}
## Состав

| Файл | Что внутри | Откуда |
| --- | --- | --- |
| \`domain.json\` | Область, читатель, нотация, подсказки, 8 типов трудности, шаблоны сцен | модель по главе |
| \`misconceptions.json\` | ${data.misconceptions.length} заблуждений \`misc.*\` | модель; со страницей — опровергается главой, без — гипотеза модели |
| \`physics_checklist.json\` | ${data.physicsChecklist.length} пунктов \`pc.*\` | модель |
| \`glossary.md\`, \`glossary_seed.json\` | ${data.glossary.length} терминов RU/EN со страницами | модель по главе, затем слои |
| \`pronunciation.md\` | ${data.pronunciation.length} обозначений | модель по главе |
| \`stress_dictionary.md\` | ${data.stress.length} слов | модель |
| \`it_bridges.md\` | ИТ-аналогии и где ломаются | из слоёв (\`domain-collect\`) |
| ${copied.map(f => '`' + f + '`').join(', ')} | цвета, метки происхождения кадров, легенда курса | скопированы из \`domain/${from}\` без изменений |

## Шаблоны сцен по типам трудности

| Тип | Подходят без изменений |
| --- | --- |
${fitting.join('\n') || '| — | ни один шаблон движка не подошёл |'}

Не хватает в движке:
${data.newTemplates.length ? data.newTemplates.map(t => `- ${t.type}: ${t.what}`).join('\n') : '- ничего'}

## Источники данных области

${data.dataSources.map(s => '- ' + s).join('\n')}
`);

// метрика для журнала
const mf = path.join(ROOT, 'logs', 'metrics.csv');
if (fs.existsSync(mf)) fs.appendFileSync(mf, `domain:${id},domain,0,${usage.in},${usage.out},0,0,0,0,0\n`);
console.log(`\n✓ domain/${id}/ собран за ${seconds} с: ${data.misconceptions.length} заблуждений, ${data.physicsChecklist.length} пунктов чек-листа, ${data.glossary.length} терминов${problems.length ? `; не исправлено замечаний: ${problems.length}` : ''}`);
console.log(`  дальше: node pipeline/run.mjs ${file} --domain ${id} …   затем  node tools/domain-collect.mjs --domain ${id}`);
