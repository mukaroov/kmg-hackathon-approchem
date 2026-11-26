// Модель без платного API: локальный агент вместо HTTP-поставщика.
//
//   LLM_PROVIDER=cli    — конвейер сам вызывает CLI агента на каждый запрос:
//                         LLM_CLI=claude → `claude -p --json-schema …` (Claude Code, нужен один вход: claude → /login);
//                         LLM_CLI=codex  → `codex exec --output-schema … --output-last-message …` (OpenAI Codex CLI).
//   LLM_PROVIDER=agent  — очередь файлов: конвейер кладёт запрос в work/agent-queue/<id>.prompt.md и ждёт
//                         <id>.response.json. Отвечает любой агент (Codex, Claude Code) по инструкции README.md в той же папке.
//
// Оба режима отдают ответ по той же JSON-схеме этапа и проходят те же проверки конвейера, что и ответ API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './config.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const QUEUE = path.join(ROOT, 'work', 'agent-queue');

const QUEUE_README = `# Очередь запросов конвейера к модели (LLM_PROVIDER=agent)

Конвейер «Глава → курс» сам не вызывает модель: каждый запрос он кладёт сюда, а отвечает агент (Codex, Claude Code или человек с ассистентом).

## Протокол
1. Запрос: \`<id>.prompt.md\` — системные правила, задание этапа и JSON-схема ответа. Те же данные машинно — \`<id>.request.json\` (поля system, user, schema).
2. Ответ: агент пишет \`<id>.response.json\` — один JSON-объект строго по схеме из запроса, без markdown и пояснений. Писать атомарно: сначала \`<id>.response.json.tmp\`, затем переименовать.
3. Конвейер забирает ответ, проверяет его (цитаты дословно на указанной странице, числа, задания, схема) и при ошибках кладёт новый запрос на исправление. Обработанные файлы переносятся в \`done/\`.
4. Если ответ не разобрался, рядом появляется \`<id>.error.txt\`: исправьте ответ и запишите его заново.

## Правила для агента
- Отвечать только по тексту главы из запроса; цитаты (поле quote) копировать дословно, символ в символ, с той страницы, после метки \`<!-- page N -->\` которой они стоят.
- Не читать и не менять файлы проекта, кроме ответа.
- По ТЗ правки человека и ассистента вне конвейера — ручной труд и пишутся в logs/manual_edits.csv. Ответы на запросы этой очереди — работа модели конвейера.
`;

// ---------- очередь файлов ----------
export async function agentJSON({ key, stage, name, system, user, schema, timeoutMin = 240, log = () => {} }) {
  fs.mkdirSync(path.join(QUEUE, 'done'), { recursive: true });
  if (!fs.existsSync(path.join(QUEUE, 'README.md'))) fs.writeFileSync(path.join(QUEUE, 'README.md'), QUEUE_README);
  const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${stage}-${name}-${key.slice(0, 8)}`;
  const f = ext => path.join(QUEUE, `${id}.${ext}`);
  fs.writeFileSync(f('request.json'), JSON.stringify({ id, stage, name, system, user, schema, created: new Date().toISOString() }, null, 1));
  fs.writeFileSync(f('prompt.md'), `<!-- запрос ${id}; ответ — ${id}.response.json, один JSON-объект по схеме в конце -->\n\n# Системные правила\n\n${system}\n\n# Задание\n\n${user}\n\n# JSON-схема ответа\n\n\`\`\`json\n${JSON.stringify(schema)}\n\`\`\`\n`);
  log(`запрос модели в очереди: work/agent-queue/${id}.prompt.md — ждём ${id}.response.json`);
  const t0 = Date.now();
  let lastErr = '';
  while (Date.now() - t0 < timeoutMin * 60000) {
    if (fs.existsSync(f('response.json'))) {
      const raw = fs.readFileSync(f('response.json'), 'utf8');
      try {
        const data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        for (const ext of ['request.json', 'prompt.md', 'response.json']) fs.renameSync(f(ext), path.join(QUEUE, 'done', `${id}.${ext}`));
        if (fs.existsSync(f('error.txt'))) fs.rmSync(f('error.txt'));
        return { data, usage: { in: Math.round((system.length + user.length) / 3.4), out: Math.round(raw.length / 3.4), estimated: true }, model: 'agent' };
      } catch (e) {
        if (e.message !== lastErr) { lastErr = e.message; fs.writeFileSync(f('error.txt'), `ответ не разобран как JSON: ${e.message}\n`); log(`ответ ${id} не разобран: ${e.message}`); }
      }
    }
    await sleep(1500);
  }
  throw new Error(`агент не ответил на ${id} за ${timeoutMin} мин (AGENT_TIMEOUT_MIN)`);
}

// ---------- какие модели доступны на этом компьютере ----------
// Путь к CLI: LLM_CLI_PATH, иначе команда из PATH, иначе Claude Code, встроенный в приложение Claude для компьютера.
function onPath(cmd) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) for (const e of exts) { const f = path.join(dir, cmd + e); if (dir && fs.existsSync(f)) return f; }
  return '';
}
function bundledClaude() {
  const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Claude-Data');
  if (!fs.existsSync(base)) return '';
  const found = [];
  for (const a of fs.readdirSync(base)) {
    const cc = path.join(base, a, 'claude-code');
    if (!fs.existsSync(cc)) continue;
    for (const ver of fs.readdirSync(cc)) for (const h of fs.readdirSync(path.join(cc, ver))) {
      const f = path.join(cc, ver, h, process.platform === 'win32' ? 'claude.exe' : 'claude');
      if (fs.existsSync(f)) found.push({ f, t: fs.statSync(f).mtimeMs });
    }
  }
  return found.sort((x, y) => y.t - x.t)[0]?.f || '';
}
export function resolveCli(cli, cliPath) {
  if (cliPath) return fs.existsSync(cliPath) ? cliPath : '';
  return onPath(cli) || (cli === 'claude' ? bundledClaude() : '');
}

let claudeAuth = { t: 0, v: null };
async function claudeLoggedIn(bin) {
  if (Date.now() - claudeAuth.t < 60000 && claudeAuth.bin === bin) return claudeAuth.v;
  let v = null;
  try { const r = await runProc(bin, ['auth', 'status'], null, 20000); v = !!JSON.parse(r.out).loggedIn; } catch { v = null; }
  claudeAuth = { t: Date.now(), bin, v };
  return v;
}

// Список для формы загрузки: id уходит в поле provider задачи.
export async function listProviders(cfg, apiCfgs) {
  const out = [];
  out.push({ id: 'agent', label: 'Claude в чате Claude Code (очередь файлов)', available: true,
    note: 'запросы ждут в work/agent-queue, пока Claude в открытом чате на них отвечает: напишите ему «ответь на очередь конвейера»' });
  const claudeBin = resolveCli('claude', cfg.cli === 'claude' ? cfg.cliPath : '');
  const logged = claudeBin ? await claudeLoggedIn(claudeBin) : null;
  out.push({ id: 'cli:claude', label: 'Claude Code CLI (сам, без чата)', available: !!claudeBin && logged === true,
    models: [{ id: '', label: 'по умолчанию' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }, { id: 'haiku', label: 'Haiku' }],
    note: !claudeBin ? 'claude не найден: установите Claude Code или задайте LLM_CLI_PATH'
      : logged === true ? 'запросы идут по вашей подписке Claude, без ключа API'
      : `нужен один вход: в терминале выполните "${claudeBin}" auth login` });
  const codexBin = resolveCli('codex', cfg.cli === 'codex' ? cfg.cliPath : '');
  out.push({ id: 'cli:codex', label: 'Codex CLI', available: !!codexBin, models: [{ id: '', label: 'по умолчанию' }],
    note: codexBin ? 'вход: codex login' : 'codex не найден: npm i -g @openai/codex или LLM_CLI_PATH' });
  for (const a of apiCfgs) out.push({ id: a.provider, label: `API: ${a.model}`, available: !!a.apiKey, note: a.apiKey ? a.baseUrl : `нет ключа ${a.provider === 'mistral' ? 'MISTRAL_API_KEY' : 'LLM_API_KEY'} в .env` });
  out.push({ id: 'stub', label: 'заглушка без модели (проверка сборки)', available: true });
  const current = cfg.provider === 'cli' ? `cli:${cfg.cli}` : cfg.provider;
  return { current, cliModel: cfg.cliModel || '', providers: out };
}

// ---------- CLI агента ----------
function runProc(cmd, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: os.tmpdir(), windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error(`${path.basename(cmd)}: таймаут ${Math.round(timeoutMs / 1000)} с`)); }, timeoutMs);
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(timer); reject(new Error(`не запускается ${cmd}: ${e.message} (LLM_CLI_PATH в .env)`)); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

export async function cliJSON({ cli, cliPath, model, system, user, schema, timeoutMs }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glava-'));
  try {
    if (cli === 'claude') {
      const sysFile = path.join(tmp, 'system.md'); fs.writeFileSync(sysFile, system);
      const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt-file', sysFile, '--json-schema', JSON.stringify(schema)];
      if (model && model !== 'default') args.push('--model', model);
      const r = await runProc(resolveCli('claude', cliPath) || 'claude', args, user, timeoutMs);
      let j; try { j = JSON.parse(r.out); } catch { throw new Error(`claude: ответ не JSON (код ${r.code}): ${(r.out || r.err).slice(0, 300)}`); }
      if (j.is_error) throw Object.assign(new Error(`claude: ${j.result || j.subtype}`), { status: /login/i.test(j.result || '') ? 401 : 500 });
      const data = j.structured_output ?? JSON.parse(String(j.result).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      const u = j.usage || {};
      return { data, usage: { in: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), out: u.output_tokens || 0 }, model: Object.keys(j.modelUsage || {})[0] || model || 'claude' };
    }
    if (cli === 'codex') {
      // Флаги Codex CLI (exec, --output-schema, --output-last-message) проверьте по `codex exec --help` своей версии.
      const schemaFile = path.join(tmp, 'schema.json'), outFile = path.join(tmp, 'answer.json');
      fs.writeFileSync(schemaFile, JSON.stringify(schema));
      const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--output-schema', schemaFile, '--output-last-message', outFile];
      if (model && model !== 'default') args.push('--model', model);
      args.push('-');
      const r = await runProc(resolveCli('codex', cliPath) || 'codex', args, `${system}\n\n${user}\n\nОтвет — один JSON-объект по заданной схеме.`, timeoutMs);
      if (!fs.existsSync(outFile)) throw new Error(`codex: нет ответа (код ${r.code}): ${(r.err || r.out).slice(-400)}`);
      const raw = fs.readFileSync(outFile, 'utf8');
      const data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      return { data, usage: { in: Math.round((system.length + user.length) / 3.4), out: Math.round(raw.length / 3.4), estimated: true }, model: model || 'codex' };
    }
    throw new Error(`LLM_CLI=${cli}: поддерживаются claude и codex`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
