#!/usr/bin/env node
// Пересборка после правки факта одной командой: курс главы и ролики шагов.
//   node pipeline/rebuild.mjs layer/<глава> [<id шага>] [--respec]
// Без id шага пересобираются курс и все ролики главы. Ролик пересобирается из сохранённой спецификации;
// если спецификация ссылается на утверждения, которых в узле больше нет или у которых сменилась страница,
// или задан --respec, спецификация пишется заново моделью (этап видео целиком).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/config.mjs';
import { runBuild } from './lib/assemble.mjs';

const args = process.argv.slice(2);
const [layerArg, only] = args.filter(a => !a.startsWith('--'));
if (!layerArg) { console.log('Использование: node pipeline/rebuild.mjs layer/<глава> [<id шага>] [--respec]'); process.exit(2); }
const dir = path.resolve(ROOT, layerArg);
const ch = JSON.parse(fs.readFileSync(path.join(dir, 'chapter.json'), 'utf8'));
const ids = (ch.parts || []).flatMap(p => p.nodes || p.steps || []).filter(id => !only || id === only);
if (only && !ids.length) { console.error(`нет шага ${only} в ${layerArg}`); process.exit(2); }

let failed = 0;
for (const id of ids) {
  const node = JSON.parse(fs.readFileSync(path.join(dir, 'nodes', id + '.json'), 'utf8'));
  for (const m of node.media || []) {
    const specFile = path.join(ROOT, 'work', 'video', ch.id, id, 'spec.json');
    const fmt = m.vertical ? '9:16' : '16:9';
    let respec = args.includes('--respec') || !fs.existsSync(specFile);
    if (!respec) {
      const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
      const claims = new Map((node.claims || []).map(c => [c.id, c]));
      const stale = (spec.timeline_segments || []).filter(s => !claims.has(s.claim_id) || claims.get(s.claim_id).page !== s.page_ref);
      if (stale.length) { console.log(`  ${id}: спецификация ссылается на изменённые утверждения (${stale.map(s => s.segment_id).join(', ')}) — пишем её заново`); respec = true; }
    }
    console.log(`  ${id}: ролик ${fmt}${respec ? ' — новая спецификация' : ' — из сохранённой спецификации'}`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'pipeline', 'video.mjs'), layerArg, id, '--format', fmt, ...(respec ? [] : ['--from-spec'])], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) failed++;
  }
}
const b = await runBuild(ch.id);
console.log(b.ok ? `✓ курс пересобран: dist/${ch.id}/index.html` : '✗ сборка не прошла\n' + b.log.slice(-800));
process.exit(b.ok && !failed ? 0 : 1);
