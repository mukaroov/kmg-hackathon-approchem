// Настройки конвейера: файл .env в корне проекта и переменные окружения (окружение важнее файла).
// Модель и поставщик меняются здесь, код конвейера от поставщика не зависит.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const DEFAULTS = {
  LLM_PROVIDER: 'mistral',              // mistral | openai-compatible | cli | agent | stub
  LLM_CLI: 'claude',                    // для LLM_PROVIDER=cli: claude (Claude Code) или codex (OpenAI Codex CLI)
  LLM_CLI_MODEL: '',                    // для LLM_PROVIDER=cli: модель CLI (--model); пусто — модель CLI по умолчанию
  LLM_CLI_PATH: '',                     // путь к исполняемому файлу CLI, если его нет в PATH
  AGENT_TIMEOUT_MIN: '240',             // для LLM_PROVIDER=agent: сколько ждать ответа на запрос из очереди
  PYTHON_PATH: 'python',                // Python для видеодвижка (numpy, matplotlib, pydantic 2)
  FFMPEG_PATH: 'ffmpeg',                // ffmpeg для сборки роликов
  LLM_MODEL: 'mistral-medium-2604',    // модель для слоя, заданий и проверки
  LLM_FALLBACK_MODELS: '',              // резервные модели через запятую: на них уходит запрос, если основная перегружена (503) или без квоты (429)
  OUTLINE_TEXT_LIMIT: '40000',          // полный текст главы идёт в запрос плана, только если он короче (знаков); иначе — список единиц с началами
  LLM_VISION_MODEL: 'mistral-medium-2604', // описание рисунков из PDF (модель с поддержкой изображений)
  LLM_BASE_URL: '',                     // для openai-compatible; у mistral — https://api.mistral.ai/v1
  LLM_API_KEY: '',                      // ключ для openai-compatible
  MISTRAL_API_KEY: '',
  OCR_MODEL: 'mistral-ocr-latest',
  LLM_TEMPERATURE: '0',
  LLM_MAX_TOKENS: '12000',
  LLM_SCHEMA_MODE: 'json_schema',       // json_schema (строгая схема) | json_object (схема в промпте)
  LLM_RPS: '1',                         // запросов в секунду: бесплатный план Mistral — 1
  LLM_CONCURRENCY: '2',
  LLM_RETRIES: '6',
  LLM_TIMEOUT_S: '240',
  LLM_CACHE: '1',                       // 1 — ответы модели кешируются в cache/llm: повторный прогон воспроизводим и бесплатен
  LLM_PRICE_IN: '0',                    // долларов за 1 млн входных токенов, для metrics.csv
  LLM_PRICE_OUT: '0',
  OCR_PRICE_PAGE: '0',                  // долларов за страницу распознавания
  REPAIR_ROUNDS: '2',                   // сколько раз модель исправляет ответ по замечаниям проверок
  VERIFY: '1',                          // 1 — смысловая проверка утверждений моделью (модуль проверки)
  DESCRIBE_FIGURES: '1',                // 1 — для PDF описывать рисунки моделью с поддержкой изображений
  PORT: '8787',
  HOST: '127.0.0.1',
  CORS_ORIGINS: 'http://localhost:*,http://127.0.0.1:*',
  MAX_UPLOAD_MB: '60',
};

export function loadConfig(overrides = {}) {
  const file = readEnvFile(path.join(ROOT, '.env'));
  const env = {};
  for (const k of Object.keys(DEFAULTS)) env[k] = overrides[k] ?? process.env[k] ?? file[k] ?? DEFAULTS[k];
  const num = k => Number(env[k]);
  const provider = env.LLM_PROVIDER;
  return {
    provider,
    model: env.LLM_MODEL,
    cli: env.LLM_CLI,
    cliPath: env.LLM_CLI_PATH,
    cliModel: env.LLM_CLI_MODEL,
    modelLabel: provider === 'agent' ? 'агент через очередь файлов work/agent-queue' : provider === 'cli' ? `${env.LLM_CLI} CLI${env.LLM_CLI_MODEL ? ', модель ' + env.LLM_CLI_MODEL : ', модель CLI по умолчанию'}` : env.LLM_MODEL,
    agentTimeoutMin: num('AGENT_TIMEOUT_MIN'),
    pythonPath: env.PYTHON_PATH,
    ffmpegPath: env.FFMPEG_PATH,
    fallbackModels: env.LLM_FALLBACK_MODELS.split(',').map(x => x.trim()).filter(Boolean),
    outlineTextLimit: num('OUTLINE_TEXT_LIMIT'),
    visionModel: env.LLM_VISION_MODEL,
    ocrModel: env.OCR_MODEL,
    baseUrl: env.LLM_BASE_URL || (provider === 'mistral' ? 'https://api.mistral.ai/v1' : ''),
    apiKey: provider === 'mistral' ? env.MISTRAL_API_KEY : env.LLM_API_KEY,
    mistralKey: env.MISTRAL_API_KEY,
    temperature: num('LLM_TEMPERATURE'),
    maxTokens: num('LLM_MAX_TOKENS'),
    schemaMode: env.LLM_SCHEMA_MODE,
    rps: num('LLM_RPS'),
    concurrency: Math.max(1, num('LLM_CONCURRENCY')),
    retries: num('LLM_RETRIES'),
    timeoutMs: num('LLM_TIMEOUT_S') * 1000,
    cache: env.LLM_CACHE === '1',
    price: { in: num('LLM_PRICE_IN'), out: num('LLM_PRICE_OUT'), ocrPage: num('OCR_PRICE_PAGE') },
    repairRounds: num('REPAIR_ROUNDS'),
    verify: env.VERIFY === '1',
    describeFigures: env.DESCRIBE_FIGURES === '1',
    port: num('PORT'),
    host: env.HOST,
    corsOrigins: env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
    maxUploadBytes: num('MAX_UPLOAD_MB') * 1048576,
  };
}

// Для отчёта и манифеста: настройки без ключей
export function publicConfig(cfg) {
  const { apiKey, mistralKey, ...rest } = cfg;
  return { ...rest, apiKey: apiKey ? 'задан' : 'нет', mistralKey: mistralKey ? 'задан' : 'нет' };
}

// Выбор модели в форме загрузки → поправки к .env для одной задачи.
// provider: agent | cli:claude | cli:codex | mistral | openai-compatible | stub; cliModel — модель CLI (sonnet, opus…).
export const MISTRAL_DEFAULT_MODEL = 'mistral-medium-2604';
export function providerOverrides(provider, cliModel, baseModel = '') {
  const o = {};
  if (provider) {
    const [p, cli] = String(provider).split(':');
    o.LLM_PROVIDER = p;
    if (p === 'cli' && cli) o.LLM_CLI = cli;
    // в .env модель может быть другого поставщика (например, gemini для openai-compatible)
    if (p === 'mistral') {
      o.LLM_BASE_URL = 'https://api.mistral.ai/v1';
      if (!/^(mistral|magistral|ministral|open-mistral)/.test(baseModel)) o.LLM_MODEL = MISTRAL_DEFAULT_MODEL;
    }
  }
  if (cliModel != null && cliModel !== '') o.LLM_CLI_MODEL = cliModel === 'default' ? '' : cliModel;
  return o;
}
