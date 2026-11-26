// Озвучка сценария ролика. Поставщики перебираются по цепочке TTS_PROVIDER (через запятую):
//   gemini  — Gemini TTS (бесплатная модель gemini-3.8-flash-tts; ключ GEMINI_API_KEY или LLM_API_KEY при LLM_BASE_URL от Google);
//   fish    — Fish Audio (бесплатная модель s2.1-pro-free; ключ FISH_API_KEY с fish.audio → API Keys; голос — FISH_VOICE);
//   windows — голоса Microsoft на этом компьютере (video/tts.ps1), без сети и ключей.
// Если поставщик не справился хотя бы с одним сегментом, весь ролик озвучивает следующий: голос в ролике один.
// Готовые фразы кешируются в cache/tts: повторная сборка не тратит лимит и звучит так же.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT, loadConfig } from './config.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
const CACHE = path.join(ROOT, 'cache', 'tts');

function readEnv() {
  const file = path.join(ROOT, '.env'), out = {};
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return k => process.env[k] ?? out[k] ?? '';
}

export function ttsSettings() {
  const env = readEnv();
  const llm = loadConfig({ LLM_PROVIDER: 'openai-compatible' });
  const googleLLM = /googleapis\.com/.test(llm.baseUrl || '');
  return {
    chain: (env('TTS_PROVIDER') || 'windows').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    gemini: {
      key: env('GEMINI_API_KEY') || (googleLLM ? llm.apiKey : ''),
      model: env('GEMINI_TTS_MODEL') || 'gemini-3.8-flash-tts',
      voice: env('GEMINI_TTS_VOICE') || 'Charon',
      style: env('GEMINI_TTS_STYLE') || 'спокойный ясный голос преподавателя, уверенный темп чуть быстрее обычного, без театральности',
    },
    fish: {
      key: env('FISH_API_KEY'),
      model: env('FISH_MODEL') || 's2.1-pro-free',
      voice: env('FISH_VOICE'),
      speed: Number(env('FISH_SPEED') || 1.1),
    },
    windows: { voices: env('TTS_VOICES') || 'Microsoft Irina Desktop,Microsoft Pavel', rate: env('TTS_RATE') || '2' },
  };
}

async function retrying(fn, label, log) {
  let last;
  for (let i = 0; i < 5; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e.noRetry || ![429, 500, 502, 503, 504].includes(e.status)) throw e;
      const wait = e.retryMs || Math.min(60000, 4000 * 2 ** i);
      log(`${label}: API ${e.status}, повтор через ${Math.round(wait / 1000)} с`);
      await sleep(wait);
    }
  }
  throw last;
}

export const GEMINI_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];

const PROVIDERS = {
  gemini: {
    ready: s => s.gemini.key ? '' : 'нет ключа GEMINI_API_KEY',
    label: s => `Gemini ${s.gemini.model}, голос ${s.gemini.voice}`,
    cacheKey: s => [s.gemini.model, s.gemini.voice, s.gemini.style],
    async speak(text, s) {
      const body = {
        model: s.gemini.model,
        input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: s.gemini.style ? [{ type: 'speech_metadata', style: s.gemini.style }] : [] }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: s.gemini.voice }] },
      };
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': s.gemini.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      const txt = await r.text();
      if (!r.ok) {
        const m = txt.match(/"retryDelay":\s*"(\d+)s"/);
        // дневной лимит бесплатной модели (10 запросов в сутки) повтором не обойти — сразу к следующему поставщику
        const daily = /per day|requests per day|PerDay/i.test(txt);
        throw Object.assign(new Error(`Gemini TTS ${r.status}: ${txt.slice(0, 300)}`), { status: r.status, noRetry: daily, retryMs: m ? (+m[1] + 1) * 1000 : 0 });
      }
      const j = JSON.parse(txt);
      let audio = null, mime = '';
      for (const st of j.steps || []) for (const c of st.content || []) if (c.type === 'audio' && c.data) { audio = c.data; mime = c.mime_type || ''; }
      if (!audio) throw new Error('Gemini TTS: в ответе нет звука');
      let buf = Buffer.from(audio, 'base64');
      if (!/wav/.test(mime) || buf.subarray(0, 4).toString() !== 'RIFF') buf = wavFromPcm(buf, 24000); // старые модели отдают сырой PCM 24 кГц
      return buf;
    },
    // весь сценарий одним запросом: реплики разделены паузой, звук режется по самым длинным паузам
    async batch(segs, s, log) {
      const buf = await this.speak(segs.map(x => x.text).join(' <long pause> '), s);
      const parts = splitBySilence(buf, segs.map(x => x.text.length));
      if (!parts) { log('gemini: общий звук не удалось разрезать по паузам, озвучиваю по фразам'); return null; }
      return parts;
    },
  },
  fish: {
    ready: s => s.fish.key ? '' : 'нет ключа FISH_API_KEY',
    label: s => `Fish Audio ${s.fish.model}${s.fish.voice ? ', голос ' + s.fish.voice : ', голос по умолчанию'}`,
    cacheKey: s => [s.fish.model, s.fish.voice, s.fish.speed],
    async speak(text, s) {
      const body = { text, format: 'wav', sample_rate: 44100, normalize: true, latency: 'normal', language: 'ru', prosody: { speed: s.fish.speed, volume: 0 } };
      if (s.fish.voice) body.reference_id = s.fish.voice;
      const r = await fetch('https://api.fish.audio/v1/tts', { method: 'POST', headers: { Authorization: `Bearer ${s.fish.key}`, 'Content-Type': 'application/json', model: s.fish.model }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw Object.assign(new Error(`Fish Audio ${r.status}: ${(await r.text()).slice(0, 300)}${r.status === 402 ? ' (на счёте API нет кредита; бесплатна модель s2.1-pro-free)' : ''}`), { status: r.status });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.subarray(0, 4).toString() !== 'RIFF') throw new Error('Fish Audio: ответ не WAV');
      return buf;
    },
  },
};

// ---------- WAV: разбор и резка по паузам ----------
function parseWav(buf) {
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)); break; }
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16 || fmt.ch !== 1) return null;
  return { rate: fmt.rate, pcm: data };
}

// weights — длины реплик в символах: по ним проверяется, что куски легли на свои реплики
export function splitBySilence(wav, weights, { minSilence = 0.15 } = {}) {
  const n = weights.length;
  const w = parseWav(wav);
  if (!w) return null;
  if (n === 1) return [wav];
  const hop = Math.round(w.rate / 100), frames = Math.floor(w.pcm.length / 2 / hop);
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) { let acc = 0; for (let i = 0; i < hop; i++) { const v = w.pcm.readInt16LE((f * hop + i) * 2); acc += v * v; } rms[f] = Math.sqrt(acc / hop); }
  const sorted = [...rms].sort((a, b) => a - b), loud = sorted[Math.floor(frames * 0.95)] || 1;
  const quiet = loud * 0.03;
  const runs = [];
  for (let f = 0, start = -1; f <= frames; f++) {
    const q = f < frames && rms[f] < quiet;
    if (q && start < 0) start = f;
    if (!q && start >= 0) { if (start > 0 && f < frames && (f - start) / 100 >= minSilence) runs.push({ a: start, b: f }); start = -1; }
  }
  if (runs.length < n - 1) return null;
  const cuts = runs.sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, n - 1).sort((x, y) => x.a - y.a);
  const bounds = [0, ...cuts.map(c => Math.round((c.a + c.b) / 2)), frames];
  // куски: от середины паузы до середины следующей, края подрезаны до речи с запасом 80 мс
  const pieces = [];
  for (let i = 0; i < n; i++) {
    let a = bounds[i], b = bounds[i + 1];
    while (a < b && rms[a] < quiet) a++;
    while (b > a && rms[b - 1] < quiet) b--;
    a = Math.max(bounds[i], a - 8); b = Math.min(bounds[i + 1], b + 8);
    pieces.push({ a, b });
  }
  const speech = pieces.reduce((t, p) => t + p.b - p.a, 0), wsum = weights.reduce((t, x) => t + x, 0);
  for (const [i, p] of pieces.entries()) { const r = (p.b - p.a) / (speech * weights[i] / wsum); if (!(r > 0.4 && r < 2.5)) return null; }
  return pieces.map(p => wavFromPcm(w.pcm.subarray(p.a * hop * 2, p.b * hop * 2), w.rate));
}

function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function windowsTTS(segFile, outDir, s) {
  return new Promise(resolve => {
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'video', 'tts.ps1'), '-In', segFile, '-OutDir', outDir, '-Voices', s.windows.voices, '-Rate', s.windows.rate], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', e => resolve({ status: 'error', error: e.message }));
    p.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ status: 'error', error: (err || out).slice(-300) }); } });
  });
}

// segments: [{ id, text }] → outDir/<id>.wav. Ответ: { status, provider, voice, engine, tried: [{ provider, error }] }
export async function synthesize(segments, outDir, { log = () => {}, chain } = {}) {
  const s = ttsSettings();
  const tried = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of chain || s.chain) {
    if (name === 'windows') {
      const segFile = path.join(outDir, '..', 'segments.tts.json');
      fs.writeFileSync(segFile, JSON.stringify(segments));
      const r = await windowsTTS(segFile, outDir, s);
      if (r.status === 'ok') return { status: 'ok', provider: 'windows', voice: r.voice, engine: `Windows ${r.engine}`, tried };
      tried.push({ provider: 'windows', error: r.error }); log(`озвучка windows не удалась: ${r.error}`);
      continue;
    }
    const P = PROVIDERS[name];
    if (!P) { tried.push({ provider: name, error: 'неизвестный поставщик (gemini, fish, windows)' }); continue; }
    const why = P.ready(s);
    if (why) { tried.push({ provider: name, error: why }); log(`озвучка ${name} пропущена: ${why}`); continue; }
    try {
      fs.mkdirSync(CACHE, { recursive: true });
      let fresh = 0;
      const cacheOf = seg => path.join(CACHE, `${name}-${sha(JSON.stringify([...P.cacheKey(s), seg.text]))}.wav`);
      const missing = segments.filter(seg => !fs.existsSync(cacheOf(seg)));
      if (P.batch && missing.length > 1) {
        const parts = await retrying(() => P.batch(missing, s, log), `${name} весь сценарий`, log);
        if (parts) for (const [i, seg] of missing.entries()) { fs.writeFileSync(cacheOf(seg) + '.tmp', parts[i]); fs.renameSync(cacheOf(seg) + '.tmp', cacheOf(seg)); fresh++; }
      }
      for (const seg of segments) {
        const cached = cacheOf(seg);
        if (!fs.existsSync(cached)) {
          const buf = await retrying(() => P.speak(seg.text, s), `${name} ${seg.id}`, log);
          fs.writeFileSync(cached + '.tmp', buf); fs.renameSync(cached + '.tmp', cached); fresh++;
        }
        fs.copyFileSync(cached, path.join(outDir, `${seg.id}.wav`));
      }
      log(`озвучка: ${P.label(s)}; новых фраз ${fresh}, из кеша ${segments.length - fresh}`);
      return { status: 'ok', provider: name, voice: P.label(s), engine: name === 'gemini' ? 'Gemini API' : 'Fish Audio API', tried };
    } catch (e) {
      tried.push({ provider: name, error: e.message }); log(`озвучка ${name} не удалась: ${e.message}; пробую следующего поставщика`);
    }
  }
  return { status: 'error', error: tried.map(t => `${t.provider}: ${t.error}`).join('; '), tried };
}

// CLI: node pipeline/lib/tts.mjs "текст" [out.wav] [--provider gemini]  — проверка голоса
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const a = process.argv.slice(2);
  if (a.includes('--voices')) {
    const s = ttsSettings();
    console.log(`Цепочка сейчас: ${s.chain.join(' → ')} (TTS_PROVIDER)\n`);
    console.log(`gemini (GEMINI_TTS_VOICE, сейчас ${s.gemini.voice}):\n  ${GEMINI_VOICES.join(', ')}\n`);
    console.log(`fish (FISH_VOICE, сейчас ${s.fish.voice || 'голос по умолчанию'}): id голоса из адреса fish.audio/m/<id>\n`);
    const r = await new Promise(res => { const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'video', 'tts.ps1'), '-List'], { windowsHide: true }); let o = ''; p.stdout.on('data', d => o += d); p.on('close', () => res(o)); p.on('error', () => res('')); });
    let list = []; try { list = JSON.parse(r.trim().split('\n').pop()); } catch {}
    console.log(`windows (TTS_VOICES, сейчас ${s.windows.voices}):\n  ${list.length ? list.map(v => `${v.name} [${v.lang}]`).join('\n  ') : 'нет голосов или не Windows'}`);
    process.exit(0);
  }
  const pi = a.indexOf('--provider'); const chain = pi >= 0 ? a.splice(pi, 2)[1].split(',') : undefined;
  const [text = 'Проверка голоса: давление в пласте восстанавливается после остановки скважины.', out = 'tts-test.wav'] = a;
  const dir = path.join(ROOT, 'work', 'tts-test');
  const r = await synthesize([{ id: 'test', text }], dir, { log: console.log, chain });
  if (r.status === 'ok') { fs.copyFileSync(path.join(dir, 'test.wav'), out); console.log(`готово: ${out} (${r.voice})`); }
  else { console.error(r.error); process.exit(1); }
}
