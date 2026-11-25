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
      const r = await runProc(cliPath || 'claude', args, user, timeoutMs);
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
      const r = await runProc(cliPath || 'codex', args, `${system}\n\n${user}\n\nОтвет — один JSON-объект по заданной схеме.`, timeoutMs);
      if (!fs.existsSync(outFile)) throw new Error(`codex: нет ответа (код ${r.code}): ${(r.err || r.out).slice(-400)}`);
      const raw = fs.readFileSync(outFile, 'utf8');
      const data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
      return { data, usage: { in: Math.round((system.length + user.length) / 3.4), out: Math.round(raw.length / 3.4), estimated: true }, model: model || 'codex' };
    }
    throw new Error(`LLM_CLI=${cli}: поддерживаются claude и codex`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
