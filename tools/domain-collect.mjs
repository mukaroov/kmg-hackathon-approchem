#!/usr/bin/env node
// Сбор доменного пакета из учебных слоёв: глоссарий RU/EN и ИТ-мосты с границами.
//   node tools/domain-collect.mjs [--domain geo]
// Пишет domain/<домен>/glossary.md и domain/<домен>/it_bridges.md по всем слоям layer/*, у которых chapter.domain = домен.
// Источник каждой строки — глава и страница; тексты написаны моделью при сборке слоя.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const domain = args[args.indexOf('--domain') + 1] && args.includes('--domain') ? args[args.indexOf('--domain') + 1] : 'geo';
const plain = s => String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a).replace(/_\{([^}]*)\}/g, '$1').replace(/\^\{([^}]*)\}/g, '^$1').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

const terms = new Map(), bridges = [];
for (const id of fs.readdirSync(path.join(ROOT, 'layer'))) {
  const chFile = path.join(ROOT, 'layer', id, 'chapter.json');
  if (!fs.existsSync(chFile)) continue;
  const ch = JSON.parse(fs.readFileSync(chFile, 'utf8'));
  if ((ch.domain || 'geo') !== domain) continue;
  const who = ch.book?.authorShort || ch.book?.author || id;
  const nodeIds = (ch.parts || []).flatMap(p => p.nodes || p.steps || []);
  for (const nid of nodeIds) {
    const f = path.join(ROOT, 'layer', id, 'nodes', nid + '.json');
    if (!fs.existsSync(f)) continue;
    const n = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const g of n.glossary || []) {
      const key = plain(g.term).toLowerCase();
      if (!key) continue;
      const row = terms.get(key) || { term: plain(g.term), en: plain(g.en), def: plain(g.def), src: [] };
      if (!row.en && g.en) row.en = plain(g.en);
      row.src.push(`${who}, с. ${g.page ?? '—'}`);
      terms.set(key, row);
    }
    const it = n.itAnalogy;
    if (it && it.text) bridges.push({ node: nid, title: plain(n.title), text: plain(it.text), limit: plain(it.limit), who, page: (n.pages || [])[0] });
  }
}
const dir = path.join(ROOT, 'domain', domain);
const rows = [...terms.values()].sort((a, b) => a.term.localeCompare(b.term, 'ru'));
fs.writeFileSync(path.join(dir, 'glossary.md'), `# Глоссарий RU/EN (домен ${domain})\n\nСобран из учебных слоёв командой \`node tools/domain-collect.mjs\`: термин, английский аналог, определение (пишет модель), где встречается. ${rows.length} терминов.\n\n| Термин | EN | Определение | Где |\n| --- | --- | --- | --- |\n${rows.map(r => `| ${r.term} | ${r.en || '—'} | ${r.def} | ${[...new Set(r.src)].slice(0, 3).join('; ')} |`).join('\n')}\n`);
fs.writeFileSync(path.join(dir, 'it_bridges.md'), `# ИТ-мосты и где они ломаются (домен ${domain})\n\nСобраны из учебных слоёв командой \`node tools/domain-collect.mjs\`. Аналогия — гипотеза модели, граница — где она перестаёт работать. ${bridges.length} мостов.\n\n${bridges.map(b => `## ${b.title} (${b.who}, с. ${b.page ?? '—'}, \`${b.node}\`)\n\n- Аналогия: ${b.text}\n- Где ломается: ${b.limit}\n`).join('\n')}`);
console.log(`✓ domain/${domain}/glossary.md — ${rows.length} терминов; it_bridges.md — ${bridges.length} мостов`);
