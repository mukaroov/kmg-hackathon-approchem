#!/usr/bin/env node
// Вход в Claude Code CLI для режима --provider cli:claude (один раз на компьютер):
//   node tools/claude-login.mjs          — открыть вход в браузере
//   node tools/claude-login.mjs status   — проверить, выполнен ли вход
// CLI ищется так же, как в конвейере: LLM_CLI_PATH, PATH, встроенный в приложение Claude для компьютера.
import { spawnSync } from 'node:child_process';
import { resolveCli } from '../pipeline/lib/local-llm.mjs';
import { loadConfig } from '../pipeline/lib/config.mjs';

const cfg = loadConfig();
const bin = resolveCli('claude', cfg.cli === 'claude' ? cfg.cliPath : '');
if (!bin) { console.error('claude не найден: установите Claude Code или задайте LLM_CLI_PATH в .env'); process.exit(1); }
console.log(`claude: ${bin}`);
if (process.argv[2] === 'status') {
  const r = spawnSync(bin, ['auth', 'status'], { encoding: 'utf8' });
  let j = {}; try { j = JSON.parse(r.stdout); } catch {}
  console.log(j.loggedIn ? `вход выполнен (${j.authMethod}, тариф ${j.planTier || j.subscriptionType || '—'}, до ${j.loginExpiresAt || '—'})` : 'вход не выполнен: node tools/claude-login.mjs');
  process.exit(j.loggedIn ? 0 : 1);
}
const r = spawnSync(bin, ['auth', 'login'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
