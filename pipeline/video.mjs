#!/usr/bin/env node
// Этап видео конвейера: шаг курса → спецификация сцены → кадры (video/video_engine.py) → озвучка → ролик в курсе.
//   node pipeline/video.mjs layer/<глава> <id шага> [--format 9:16|16:9] [--from-spec] [--no-voice]
// --from-spec  пересобрать ролик из сохранённой спецификации без модели (после правки факта или спецификации)
// --no-voice   без озвучки (только субтитры)
// Результат: layer/<глава>/assets/media/<шаг>/ — ролик, постер, субтитры .vtt, спецификация, паспорт (passport.schema.json);
// в узел шага добавляется запись media, курс пересобирается.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, loadConfig } from './lib/config.mjs';
import { createLLM } from './lib/llm.mjs';
import { tpl } from './lib/stages.mjs';
import { loadDomain } from './lib/jobs.mjs';
import { runBuild, layerHashes } from './lib/assemble.mjs';
import { validate } from '../build/lib/jsonschema.mjs';
import { plain } from '../build/lib/source.mjs';
import { synthesize, ttsSettings } from './lib/tts.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const [layerArg, nodeId] = args.filter((a, i) => !a.startsWith('--') && !/^--(format)$/.test(args[i - 1] || ''));
if (!layerArg || !nodeId) { console.log('Использование: node pipeline/video.mjs layer/<глава> <id шага> [--format 9:16|16:9] [--from-spec] [--no-voice]'); process.exit(2); }

const cfg = loadConfig();
const dir = path.resolve(ROOT, layerArg);
const ch = JSON.parse(fs.readFileSync(path.join(dir, 'chapter.json'), 'utf8'));
const nodeFile = path.join(dir, 'nodes', nodeId + '.json');
if (!fs.existsSync(nodeFile)) { console.error(`нет шага ${nodeId} в ${layerArg}`); process.exit(2); }
const node = JSON.parse(fs.readFileSync(nodeFile, 'utf8'));
const domain = loadDomain(ch.domain || 'geo');

// ---------- произношение из доменного пакета: обозначения читаются по таблице, ударения — по словарю (TTS_STRESS=1) ----------
function loadSpeech(domainId) {
  const read = n => { const p = path.join(ROOT, 'domain', domainId, n); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
  const rows = s => [...s.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|/gm)].map(m => [m[1].trim(), m[2].trim()]).filter(([a, b]) => a && b && !/^-+$/.test(a) && !/^(Пишется|Слово)$/.test(a));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pron = rows(read('pronunciation.md')).flatMap(([a, b]) => { const as = a.split(/,\s*/), bs = b.split(/,\s*/); return as.map((x, i) => [x, bs[i] || bs[0]]); });
  const stress = process.env.TTS_STRESS === '1' ? rows(read('stress_dictionary.md')) : [];
  const word = s => new RegExp('(?<![\\p{L}\\d])' + esc(s) + '(?![\\p{L}\\d])', 'gu');
  return text => {
    let t = String(text);
    for (const [a, b] of pron) t = t.replace(word(a), b);
    for (const [a, b] of stress) t = t.replace(new RegExp('(?<![\\p{L}])' + esc(a) + '(?![\\p{L}])', 'giu'), m => m[0] === m[0].toUpperCase() ? b[0].toUpperCase() + b.slice(1) : b);
    return t;
  };
}
const speakable = loadSpeech(ch.domain || 'geo');
const routeFmt = /шортс/.test(node.route?.format || '') ? '9:16' : '16:9';
const fmt = opt('format') || routeFmt;
const shorts = fmt === '9:16';
const work = path.join(ROOT, 'work', 'video', ch.id, nodeId);
fs.mkdirSync(work, { recursive: true });
const log = m => console.log('  ' + m);
const meter = {};

function run(cmd, argv, { input, env } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8', FFMPEG_PATH: cfg.ffmpegPath, ...env }, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', e => resolve({ code: -1, out, err: e.message }));
    p.on('close', code => resolve({ code, out, err }));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
const py = async (...a) => { const r = await run(cfg.pythonPath, [path.join(ROOT, 'video', 'render_scene.py'), ...a]); try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return { status: 'error', error: (r.err || r.out).slice(-800) || `код ${r.code}` }; } };
const ff = (...a) => run(cfg.ffmpegPath, ['-hide_banner', '-y', ...a]);
async function duration(f) { const r = await run(cfg.ffmpegPath, ['-hide_banner', '-i', f]); const m = r.err.match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; }
const words = s => (String(s).match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-–][A-Za-zА-Яа-яЁё0-9]+)*/g) || []).length;

// ---------- проверки спецификации по ТЗ ----------
function checkSpec(s) {
  const e = [];
  const claims = new Map((node.claims || []).map(c => [c.id, c]));
  const segs = s.timeline_segments || [];
  const total = segs.reduce((a, x) => a + (x.duration_sec || 0), 0);
  const [lo, hi] = shorts ? [40, 90] : [90, 180];
  if (total < lo || total > hi) e.push(`длительность ${total.toFixed(1)} с вне диапазона ${lo}–${hi} с для формата ${fmt}`);
  if (s.video_format !== fmt) e.push(`video_format должен быть «${fmt}»`);
  if (s.node_id !== nodeId) e.push(`node_id должен быть «${nodeId}»`);
  if (segs[0] && segs[0].duration_sec > 3) e.push('первый сегмент — крючок, по ТЗ он должен уложиться в первые 3 секунды');
  if (!segs.some(x => x.is_prediction_pause)) e.push('нет сегмента с is_prediction_pause: true (пауза на предсказание)');
  segs.forEach(x => {
    const c = claims.get(x.claim_id);
    if (!c) e.push(`${x.segment_id}: claim_id «${x.claim_id}» — нет такого утверждения в шаге`);
    else if (c.page !== x.page_ref) e.push(`${x.segment_id}: page_ref ${x.page_ref}, а утверждение ${c.id} на с. ${c.page}`);
    if (words(x.screen_caption) > 8) e.push(`${x.segment_id}: подпись длиннее 8 слов`);
    if (/[α-ωΑ-Ω$\\]/.test(x.screen_caption || '')) e.push(`${x.segment_id}: в подписи формулы или греческие буквы`);
    if (/\d/.test(x.narration_script || '')) e.push(`${x.segment_id}: в тексте озвучки цифры — числа нужно писать словами`);
    if (words(x.narration_script) > 18) e.push(`${x.segment_id}: фраза озвучки длиннее 18 слов`);
    if (words(x.narration_script) > 2.3 * x.duration_sec + 0.5) e.push(`${x.segment_id}: ${words(x.narration_script)} слов не уложатся в ${x.duration_sec} с при темпе до 140 слов в минуту — удлините сегмент или сократите фразу`);
  });
  if (!(s.ask_options || []).length || !Number.isInteger(s.ask_answer) || !(s.ask_options || [])[s.ask_answer]) e.push('нужны ask_options и ask_answer — варианты ответа на вопрос-предсказание');
  return e;
}

// ---------- 1. спецификация сцены ----------
const specFile = path.join(work, 'spec.json');
let spec;
if (args.includes('--from-spec') && fs.existsSync(specFile)) { spec = JSON.parse(fs.readFileSync(specFile, 'utf8')); log('спецификация из файла (без модели)'); }
else {
  const llm = createLLM(cfg, { log, meter });
  const engineSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'video', 'scene.schema.json'), 'utf8'));
  const schema = { ...engineSchema, properties: { ...engineSchema.properties,
    course_title: { type: 'string' }, ask_options: { type: 'array', items: { type: 'string' } }, ask_answer: { type: 'integer' }, ask_feedback: { type: 'array', items: { type: 'string' } },
    physics_checklist: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, answer: { enum: ['да', 'нет', 'н/п'] }, note: { type: 'string' } }, required: ['item', 'answer'] } } },
    required: [...(engineSchema.required || []), 'course_title', 'ask_options', 'ask_answer', 'ask_feedback', 'physics_checklist'] };
  const checklist = domain.physicsChecklist ? JSON.parse(fs.readFileSync(path.join(ROOT, 'domain', domain.id, domain.physicsChecklist), 'utf8')) : [];
  const nodeBrief = { title: node.title, essence: node.essence, how: (node.how || []).map(h => ({ text: plain(h.text), page: h.page })), claims: (node.claims || []).map(c => ({ id: c.id, page: c.page, text: plain(c.text), quote: c.quote })), numbers: node.numbers, tables: node.tables, examples: node.examples, figures: (node.figures || []).map(f => f.caption), decision: node.decision, data: node.data };
  const sys = tpl('system', { domain: { ...domain, hints: (domain.hints || []).map(h => '- ' + h) } });
  const user = tpl('scene', { format: shorts ? 'шортс 9:16 — один механизм, крючок, пауза на предсказание, вопрос на перенос' : 'разбор 16:9 — решение на данных, синхронные виды рядом', duration: shorts ? '40–75 секунд (максимум 90)' : '90–180 секунд', title: node.title, bookTitle: node.bookTitle, pages: (node.pages || []).join('–'), difficulty: (node.difficulty || []).join(', '), route: JSON.stringify(node.route || {}), nodeId, videoFormat: fmt, node: JSON.stringify(nodeBrief), checklist: checklist.map(c => `${c.id} — ${c.item}`) });
  let errs = [];
  for (let round = 0; round <= cfg.repairRounds; round++) {
    const u = round === 0 ? user : `${user}\n\nТвой прошлый ответ:\n${JSON.stringify(spec)}\n\nОшибки проверки:\n- ${errs.join('\n- ')}\nВерни спецификацию целиком, исправив ошибки.`;
    spec = (await llm.json({ stage: 'video', name: 'scene', system: sys, user: u, schema, task: { stage: 'scene' } })).data;
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 1));
    const v = await py('--validate', specFile);
    errs = [...(v.status === 'invalid' ? v.errors.map(x => `${x.loc}: ${x.msg}`) : v.status === 'error' ? [v.error] : []), ...checkSpec(spec)];
    if (!errs.length) break;
    log(`спецификация: ${errs.length} замечаний${round < cfg.repairRounds ? ', модель исправляет' : ''}`);
  }
  if (errs.length) { console.error('✗ спецификация не прошла проверки:\n  - ' + errs.join('\n  - ')); process.exit(1); }
}

// ---------- 2. кадры ----------
log(`рендер ${fmt}: ${spec.scene_params.template_type}, ${spec.timeline_segments.length} сегментов`);
const t0 = Date.now();
const styleFile = path.join(ROOT, 'domain', domain.id, 'video_style.json');
const res = await py(specFile, path.join(ROOT, 'work', 'video', ch.id), ...(fs.existsSync(styleFile) ? [styleFile] : []));
if (res.status !== 'ok') { console.error('✗ движок: ' + JSON.stringify(res).slice(0, 800)); process.exit(1); }
const silent = path.resolve(ROOT, res.video_path);
const sync = JSON.parse(fs.readFileSync(path.resolve(ROOT, res.timeline_sync_json), 'utf8'));
const total = res.total_duration_sec;
log(`кадры готовы за ${Math.round((Date.now() - t0) / 1000)} с`);

// ---------- 3. озвучка и звук ----------
const final = path.join(work, `${nodeId}.mp4`);
const audio = { voice: null, wpm: null, lufs: null, max_sync_offset_sec: null, segments_sped_up: [] };
if (!args.includes('--no-voice')) {
  const segFile = path.join(work, 'segments.json');
  fs.writeFileSync(segFile, JSON.stringify(sync.map(s => ({ id: s.segment_id, text: speakable(s.narration_script) }))));
  // поставщик голоса — цепочка TTS_PROVIDER (gemini, fish, windows): pipeline/lib/tts.mjs
  const t = await synthesize(JSON.parse(fs.readFileSync(segFile, 'utf8')), path.join(work, 'tts'), { log });
  audio.tts = t;
  if (t.status !== 'ok') log(`озвучка не удалась (${t.error}); ролик будет без голоса, с субтитрами`);
  else {
    audio.voice = t.voice;
    // проверка дорожки распознаванием речи (локально; если распознавателя нет — так и пишется в паспорт)
    const asr = await run(cfg.pythonPath, [path.join(ROOT, 'video', 'asr_check.py'), segFile, path.join(work, 'tts')]);
    try { audio.asr = JSON.parse(asr.out.trim().split('\n').pop()); } catch { audio.asr = { status: 'error', reason: (asr.err || '').slice(-200) }; }
    log(audio.asr.status === 'ok' ? `распознавание речи: совпадение слов ${audio.asr.mean_match}, ниже порога ${audio.asr.below_threshold.length} сегментов` : `распознавание речи не выполнено: ${audio.asr.reason}`);
    const inputs = [], filters = [];
    let spoken = 0, wordsTotal = 0, maxOff = 0;
    for (const [i, s] of sync.entries()) {
      const wav = path.join(work, 'tts', s.segment_id + '.wav');
      let d = await duration(wav);
      let tempo = 1;
      if (d > s.duration_sec - 0.15) { tempo = Math.min(1.35, d / Math.max(0.5, s.duration_sec - 0.2)); audio.segments_sped_up.push({ segment: s.segment_id, tempo: +tempo.toFixed(2) }); d /= tempo; }
      maxOff = Math.max(maxOff, Math.max(0, d - s.duration_sec));
      spoken += d; wordsTotal += words(s.narration_script);
      inputs.push('-i', wav);
      filters.push(`[${i + 1}:a]${tempo > 1 ? `atempo=${tempo.toFixed(3)},` : ''}adelay=${Math.round(s.start_sec * 1000 + 100)}|${Math.round(s.start_sec * 1000 + 100)}[a${i}]`);
    }
    audio.wpm = Math.round(wordsTotal / (spoken / 60));
    audio.max_sync_offset_sec = +maxOff.toFixed(2);
    const mix = `${filters.join(';')};${sync.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sync.length}:normalize=0,apad,atrim=0:${total},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
    const r = await ff('-i', silent, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final);
    if (r.code !== 0) { log('сведение звука не удалось: ' + r.err.slice(-300)); }
    else {
      const m = (await run(cfg.ffmpegPath, ['-hide_banner', '-i', final, '-af', 'ebur128', '-f', 'null', '-'])).err.match(/I:\s+(-?[\d.]+) LUFS/g);
      audio.lufs = m ? +m[m.length - 1].match(/-?[\d.]+/)[0] : null;
      log(`голос ${t.voice}: ${audio.wpm} слов/мин, громкость ${audio.lufs} LUFS, макс. сдвиг ${audio.max_sync_offset_sec} с`);
    }
  }
}
if (!fs.existsSync(final)) fs.copyFileSync(silent, final);

// ---------- 4. субтитры, постер, паспорт ----------
const ts = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const vtt = 'WEBVTT\n\n' + sync.map((s, i) => `${i + 1}\n${ts(s.start_sec)} --> ${ts(s.end_sec)}\n${s.narration_script}\n`).join('\n');
const poster = path.join(work, 'poster.jpg');
await ff('-ss', String(Math.min(total - 0.5, sync[0].end_sec + 0.5)), '-i', final, '-frames:v', '1', '-q:v', '3', poster);

const claims = new Map((node.claims || []).map(c => [c.id, c]));
const checklist = domain.physicsChecklist ? JSON.parse(fs.readFileSync(path.join(ROOT, 'domain', domain.id, domain.physicsChecklist), 'utf8')) : [];
const pcGiven = new Map((spec.physics_checklist || []).map(x => [x.item, x]));
const short = nodeId.split('.').pop();
const mediaDir = path.join(dir, 'assets', 'media', short);
const passport = {
  video_id: `${nodeId}.${shorts ? 'shorts' : 'explainer'}`,
  node_id: nodeId,
  node_card: { title: node.title, book_title: node.bookTitle, pages: node.pages, essence: (node.essence || []).map(plain), difficulty: node.difficulty, route: node.route },
  script: sync.map(s => ({ t_start: s.start_sec, t_end: s.end_sec, text: s.narration_script, claim_id: s.claim_id, is_analogy: false, on_screen: s.screen_caption })),
  sources: [...new Set(sync.map(s => s.claim_id))].map(id => ({ claim_id: id, page_or_dataset: `с. ${claims.get(id)?.page}`, quote: claims.get(id)?.quote || '' })),
  scene_spec: `assets/media/${short}/spec.json`,
  frames: [{ t: 0, class: spec.frame_class, label: spec.origin_label }, ...(spec.scene_params.show_true_scale_at_end ? [{ t: +(total * 0.8).toFixed(1), class: spec.frame_class, label: spec.origin_label }] : [])],
  exaggerations: spec.is_true_scale ? [] : [spec.exaggeration_note],
  true_scale: spec.is_true_scale ? 'весь ролик' : spec.scene_params.show_true_scale_at_end ? `кадр в истинном масштабе с ${(total * 0.8).toFixed(1)} с` : 'нет',
  assumptions: spec.assumptions,
  hook_question: spec.hook_question,
  prediction_question: spec.prediction_question,
  transfer_question: spec.transfer_question,
  data_it_bridge: spec.data_bridge_text,
  physics_checklist: checklist.map(c => pcGiven.get(c.id) ? { item: c.id, answer: pcGiven.get(c.id).answer, note: pcGiven.get(c.id).note || '' } : { item: c.id, answer: 'н/п', note: 'модель не отметила пункт' }),
  audio_check: { voice: audio.voice || 'без голоса', fallback_voices: ttsSettings().chain.filter(x => x !== audio.tts?.provider), loudness_lufs: audio.lufs, words_per_minute: audio.wpm, max_sync_offset_sec: audio.max_sync_offset_sec, segments_sped_up: audio.segments_sped_up, asr_check: audio.asr ? (audio.asr.status === 'ok' ? { model: audio.asr.model, mean_match: audio.asr.mean_match, threshold: audio.asr.threshold, below_threshold: audio.asr.below_threshold } : 'не выполнено: ' + audio.asr.reason) : 'не выполнено: ролик без голоса', subtitles: `assets/media/${short}/subs.vtt` },
  generated_by: { engine: 'video/video_engine.py', spec_model: Object.keys(meter).length ? cfg.model : 'из файла', provider: cfg.provider, tts: audio.tts?.status === 'ok' ? `${audio.tts.engine}: ${audio.tts.voice}` : 'без голоса' },
};
const pschema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'passport.schema.json'), 'utf8'));
const perrs = validate(passport, pschema);
if (perrs.length) log('паспорт: расхождения со схемой — ' + perrs.slice(0, 5).join('; '));

fs.rmSync(mediaDir, { recursive: true, force: true });
fs.mkdirSync(mediaDir, { recursive: true });
fs.copyFileSync(final, path.join(mediaDir, 'video.mp4'));
fs.copyFileSync(poster, path.join(mediaDir, 'poster.jpg'));
fs.copyFileSync(specFile, path.join(mediaDir, 'spec.json'));
fs.writeFileSync(path.join(mediaDir, 'subs.vtt'), vtt);
fs.writeFileSync(path.join(mediaDir, 'passport.json'), JSON.stringify(passport, null, 1));

// ---------- 5. ролик в шаге курса ----------
const pause = sync.find(s => s.is_prediction_pause) || sync[Math.floor(sync.length / 2)];
const entry = {
  kind: shorts ? 'short' : 'explainer', src: `assets/media/${short}/video.mp4`, poster: `assets/media/${short}/poster.jpg`, subtitles: `assets/media/${short}/subs.vtt`, passport: `assets/media/${short}/passport.json`,
  title: spec.course_title || node.title, format: shorts ? 'вертикальный ролик' : 'горизонтальный разбор', duration: Math.round(total), page: sync[0].page_ref, vertical: shorts, hook: spec.hook_question,
  ask: { at: Math.round(pause.end_sec), q: spec.prediction_question, options: spec.ask_options, answer: spec.ask_answer, feedback: spec.ask_feedback },
};
node.media = [...(node.media || []).filter(m => !String(m.src).startsWith(`assets/media/${short}/`)), entry];
fs.writeFileSync(nodeFile, JSON.stringify(node, null, 2) + '\n');
const runFile = path.join(dir, 'pipeline-run.json');
if (fs.existsSync(runFile)) { const pr = JSON.parse(fs.readFileSync(runFile, 'utf8')); pr.hashes = layerHashes(dir); pr.video = { ...(pr.video || {}), [nodeId]: new Date().toISOString() }; fs.writeFileSync(runFile, JSON.stringify(pr, null, 2) + '\n'); }

const b = await runBuild(ch.id);
const v = meter.video || { in: 0, out: 0 };
fs.appendFileSync(path.join(ROOT, 'logs', 'metrics.csv'), [ch.id, 'video', 1, v.in || 0, v.out || 0, 0, 0, 0, Math.round(total), 0].join(',') + '\n');
console.log(`\n${b.ok ? '✓' : '✗'} ролик ${fmt}, ${Math.round(total)} с → ${path.relative(ROOT, path.join(mediaDir, 'video.mp4'))}; паспорт ${perrs.length ? 'с расхождениями' : 'соответствует'} passport.schema.json; курс ${b.ok ? 'пересобран' : 'не собрался'}`);
