// Адаптер модели. Конвейер вызывает только llm.json(), llm.vision() и llm.ocr(); поставщик выбирается в .env.
// Здесь же: ограничение частоты запросов (бесплатный план Mistral — 1 запрос в секунду), повтор при 429 и сбоях,
// кеш ответов (повторный прогон той же главы воспроизводим и не тратит токены) и учёт токенов по этапам.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './config.mjs';
import { stubJSON } from './stub.mjs';
import { agentJSON, cliJSON } from './local-llm.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

export class LLMError extends Error {
  constructor(msg, { status, retryable, body } = {}) { super(msg); this.status = status; this.retryable = retryable; this.body = body; }
}

function limiter(rps, concurrency) {
  const gap = rps > 0 ? 1000 / rps : 0;
  let last = 0, active = 0;
  const queue = [];
  const pump = () => {
    if (active >= concurrency || !queue.length) return;
    const wait = Math.max(0, last + gap - Date.now());
    if (wait > 0) { setTimeout(pump, wait); return; }
    last = Date.now(); active++;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => { active--; pump(); });
    pump();
  };
  return fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); });
}

export function createLLM(cfg, { log = () => {}, meter } = {}) {
  const run = limiter(cfg.rps, cfg.concurrency);
  const cacheDir = path.join(ROOT, 'cache', 'llm');
  let schemaMode = cfg.schemaMode;
  const stub = cfg.provider === 'stub';
  const local = cfg.provider === 'agent' || cfg.provider === 'cli'; // модель без HTTP API: очередь файлов или CLI агента
  if (!stub && !local && !cfg.apiKey) throw new LLMError(`нет ключа API: задайте ${cfg.provider === 'mistral' ? 'MISTRAL_API_KEY' : 'LLM_API_KEY'} в файле .env (образец — .env.example)`);
  if (!stub && !local && !cfg.baseUrl) throw new LLMError('не задан LLM_BASE_URL для поставщика openai-compatible');

  async function http(url, body, { key = cfg.apiKey, retries = cfg.retries } = {}) {
    let attempt = 0;
    for (;;) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      let res, text;
      try {
        res = await run(() => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctrl.signal }));
        text = await res.text();
      } catch (e) {
        clearTimeout(timer);
        if (attempt++ < retries) { const w = Math.min(60000, 2000 * 2 ** attempt); log(`сеть: ${e.name === 'AbortError' ? 'таймаут' : e.message}; повтор через ${Math.round(w / 1000)} с`); await sleep(w); continue; }
        throw new LLMError(`запрос к ${url} не прошёл: ${e.message}`, { retryable: true });
      }
      clearTimeout(timer);
      if (res.ok) { try { return JSON.parse(text); } catch { throw new LLMError('ответ API — не JSON', { body: text.slice(0, 500) }); } }
      if (res.status === 401) throw new LLMError('API 401: ключ не принят — проверьте MISTRAL_API_KEY в .env', { status: 401, body: text });
      if (res.status === 402) throw new LLMError('API 402: у организации ключа не подключён план. В консоли Mistral (console.mistral.ai → Admin → Subscriptions / Billing) выберите бесплатный план Experiment или платный Scale, затем повторите. Список моделей при этом отдаётся, а запросы к моделям — нет', { status: 402, body: text });
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt++ < retries) {
        const ra = Number(res.headers.get('retry-after'));
        const w = ra > 0 ? ra * 1000 : Math.min(60000, 1500 * 2 ** attempt + Math.random() * 500);
        log(`API ${res.status}${res.status === 429 ? ' (лимит запросов)' : ''}; повтор через ${Math.round(w / 1000)} с`);
        await sleep(w); continue;
      }
      throw new LLMError(`API ${res.status}: ${text.slice(0, 400)}`, { status: res.status, retryable, body: text });
    }
  }

  function account(stage, usage, cached, ms) {
    if (!meter) return;
    const m = meter[stage] ||= { calls: 0, cached: 0, in: 0, out: 0, ms: 0, pages: 0 };
    m.calls++; if (cached) m.cached++; else { m.in += usage.in || 0; m.out += usage.out || 0; }
    m.ms += ms; if (usage.pages) m.pages += usage.pages;
  }

  function cacheGet(key) {
    if (!cfg.cache) return null;
    const f = path.join(cacheDir, key.slice(0, 2), key + '.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  }
  function cachePut(key, val) {
    if (!cfg.cache) return;
    const d = path.join(cacheDir, key.slice(0, 2)); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, key + '.json'), JSON.stringify(val));
  }

  const parseContent = c => {
    const s = Array.isArray(c) ? c.map(x => x.text || '').join('') : String(c || '');
    const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(t);
  };

  // Ответ строго в JSON по схеме. task — структурированный вход этапа (нужен заглушке без модели и для журнала).
  async function json({ stage, name, system, user, schema, task, model = cfg.model }) {
    const t0 = Date.now();
    const key = sha(JSON.stringify({ p: cfg.provider, model, name, system, user, schema, t: cfg.temperature, mt: cfg.maxTokens, task: stub ? task : undefined }));
    const hit = cacheGet(key);
    if (hit) { account(stage, hit.usage, true, Date.now() - t0); return { data: hit.data, usage: hit.usage, cached: true, model: hit.model }; }
    if (stub) {
      const data = stubJSON(task);
      const usage = { in: 0, out: 0 };
      cachePut(key, { data, usage, model: 'stub' }); account(stage, usage, false, Date.now() - t0);
      return { data, usage, cached: false, model: 'stub' };
    }
    if (local) {
      const r = await run(() => cfg.provider === 'agent'
        ? agentJSON({ key, stage, name, system, user, schema, timeoutMin: cfg.agentTimeoutMin, log })
        : cliJSON({ cli: cfg.cli, cliPath: cfg.cliPath, model: cfg.cliModel, system, user, schema, timeoutMs: cfg.timeoutMs }));
      cachePut(key, { data: r.data, usage: r.usage, model: r.model }); account(stage, r.usage, false, Date.now() - t0);
      return { data: r.data, usage: r.usage, cached: false, model: r.model };
    }
    let lastErr, maxTokens = cfg.maxTokens, temperature = cfg.temperature;
    const fallbacks = (cfg.fallbackModels || []).filter(m => m !== model);
    for (let attempt = 0; attempt < 3; attempt++) {
      const mode = schemaMode;
      const sys = mode === 'json_schema' ? system : `${system}\n\nОтвет — один JSON-объект строго по этой JSON-схеме, без пояснений и без markdown:\n${JSON.stringify(schema)}`;
      const body = {
        model, temperature, max_tokens: maxTokens,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        response_format: mode === 'json_schema' ? { type: 'json_schema', json_schema: { name, schema, strict: true } } : { type: 'json_object' },
      };
      let r;
      try { r = await http(`${cfg.baseUrl}/chat/completions`, body, { retries: fallbacks.length ? 3 : cfg.retries }); }
      catch (e) {
        // модель перегружена или кончилась её квота — переходим на следующую резервную модель (LLM_FALLBACK_MODELS)
        if ((e.status === 503 || e.status === 429) && fallbacks.length) { const next = fallbacks.shift(); log(`модель ${model} недоступна (API ${e.status}); запрос уходит на резервную ${next}`); model = next; lastErr = e; attempt--; continue; }
        // поставщик не принял схему — переходим на json_object со схемой в промпте и запоминаем это до конца прогона
        if (e.status === 400 && mode === 'json_schema' && /schema|response_format|json/i.test(e.body || '')) { log(`поставщик не принял строгую схему (${e.message.slice(0, 160)}); дальше — json_object со схемой в промпте`); schemaMode = 'json_object'; lastErr = e; continue; }
        throw e;
      }
      // у «думающих» моделей рассуждения входят в total_tokens, но не в completion_tokens: считаем их как выход
      const usage = { in: r.usage?.prompt_tokens || 0, out: Math.max(r.usage?.completion_tokens || 0, (r.usage?.total_tokens || 0) - (r.usage?.prompt_tokens || 0)) };
      const choice = r.choices?.[0];
      try {
        const data = parseContent(choice?.message?.content);
        cachePut(key, { data, usage, model: r.model || model });
        account(stage, usage, false, Date.now() - t0);
        return { data, usage, cached: false, model: r.model || model, finish: choice?.finish_reason };
      } catch (e) {
        account(stage, usage, false, Date.now() - t0);
        const cut = choice?.finish_reason === 'length';
        lastErr = new LLMError(`этап ${stage}/${name}: модель вернула не JSON${cut ? ` (ответ обрезан на ${maxTokens} токенах)` : ''}: ${e.message}`);
        // тот же запрос с той же температурой дал бы тот же ответ: обрезанный — повторяем с бо́льшим лимитом, битый — с небольшой температурой
        if (cut) maxTokens = Math.min(65000, maxTokens * 2); else temperature = Math.max(temperature, 0.3);
        log(lastErr.message.slice(0, 200) + '; повтор');
      }
    }
    throw lastErr;
  }

  // Описание изображения моделью с поддержкой картинок
  async function vision({ stage, prompt, image, model = cfg.visionModel }) {
    const t0 = Date.now();
    const key = sha(JSON.stringify({ p: cfg.provider, model, prompt, img: sha(image) }));
    const hit = cacheGet(key);
    if (hit) { account(stage, hit.usage, true, Date.now() - t0); return hit; }
    if (stub) return { text: '', usage: { in: 0, out: 0 } };
    const r = await http(`${cfg.baseUrl}/chat/completions`, { model, temperature: cfg.temperature, max_tokens: 1500, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: image }] }] });
    const usage = { in: r.usage?.prompt_tokens || 0, out: r.usage?.completion_tokens || 0 };
    const out = { text: String(r.choices?.[0]?.message?.content || '').trim(), usage, model: r.model || model };
    cachePut(key, out); account(stage, usage, false, Date.now() - t0);
    return out;
  }

  // Распознавание PDF (Mistral OCR). Возвращает страницы в markdown и картинки.
  async function ocr({ stage = 'ocr', pdf, pages }) {
    const t0 = Date.now();
    if (!cfg.mistralKey) throw new LLMError('для PDF нужен MISTRAL_API_KEY: распознавание идёт через Mistral OCR. Без ключа загрузите md главы.');
    const key = sha(JSON.stringify({ ocr: cfg.ocrModel, pdf: sha(pdf.toString('base64')), pages }));
    const hit = cacheGet(key);
    if (hit) { account(stage, { pages: hit.pages.length }, true, Date.now() - t0); return hit; }
    const body = { model: cfg.ocrModel, document: { type: 'document_url', document_url: 'data:application/pdf;base64,' + pdf.toString('base64') }, include_image_base64: true };
    if (pages) body.pages = pages;
    const r = await http('https://api.mistral.ai/v1/ocr', body, { key: cfg.mistralKey });
    const out = { model: r.model || cfg.ocrModel, pages: r.pages || [], usage: r.usage_info || {} };
    cachePut(key, out); account(stage, { pages: out.pages.length }, false, Date.now() - t0);
    return out;
  }

  return { json, vision, ocr, get schemaMode() { return schemaMode; }, provider: cfg.provider, model: cfg.model };
}
