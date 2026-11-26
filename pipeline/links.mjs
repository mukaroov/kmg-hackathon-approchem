#!/usr/bin/env node
// Этап связей для готового слоя: node pipeline/links.mjs layer/<глава> [--no-build]
// Добавляет связи «пример», «переход к данным» и заблуждения шагов, затем пересобирает курс.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig, providerOverrides } from './lib/config.mjs';
import { createLLM } from './lib/llm.mjs';
import { loadDomain } from './lib/jobs.mjs';
import { runBuild } from './lib/assemble.mjs';
import { linkStage } from './lib/links.mjs';

const args = process.argv.slice(2);
const layerArg = args.find((a, i) => !a.startsWith('--') && !/^--(provider|cli-model)$/.test(args[i - 1] || ''));
if (!layerArg) { console.log('Использование: node pipeline/links.mjs layer/<глава> [--no-build]'); process.exit(2); }
const dir = path.resolve(ROOT, layerArg);
const ch = JSON.parse(fs.readFileSync(path.join(dir, 'chapter.json'), 'utf8'));
// --provider agent|cli:claude|openai-compatible|… и --cli-model sonnet|opus — как у pipeline/run.mjs; без них — модель из .env
const cfg = (a => { const o = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; }; return loadConfig(providerOverrides(o('provider'), o('cli-model'), loadConfig().model)); })(process.argv.slice(2));
const log = m => console.log('  ' + m);
const r = await linkStage({ dir, llm: createLLM(cfg, { log, meter: {} }), domain: loadDomain(ch.domain || 'geo'), log });
r.warnings.forEach(w => log('! ' + w));
if (!args.includes('--no-build')) { const b = await runBuild(ch.id); console.log(b.ok ? `✓ курс пересобран: dist/${ch.id}/index.html` : '✗ сборка не прошла\n' + b.log.slice(-800)); }
