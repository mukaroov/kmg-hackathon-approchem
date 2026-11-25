// Этап связей: типизированные связи между шагами (пример, переход к данным) и заблуждения, которые шаги опровергают.
// Связи «предпосылка» даёт план шагов; этот этап добавляет остальные типы схемы узла (example_of, to_data, refutes_misconception).
import fs from 'node:fs';
import path from 'node:path';
import { tpl } from './stages.mjs';
import { layerHashes } from './assemble.mjs';
import { plain } from '../../build/lib/source.mjs';

const schema = { type: 'object', required: ['links'], properties: { links: { type: 'array', items: { type: 'object', required: ['from', 'to', 'type', 'why'], properties: {
  from: { type: 'string' }, to: { type: 'string' }, type: { enum: ['example', 'data', 'myth'] }, why: { type: 'string' } } } } } };

export async function linkStage({ dir, llm, domain, log = () => {} }) {
  const chFile = path.join(dir, 'chapter.json');
  const ch = JSON.parse(fs.readFileSync(chFile, 'utf8'));
  const ids = (ch.parts || []).flatMap(p => p.nodes || p.steps || []);
  const nodes = new Map(ids.map(id => [id, JSON.parse(fs.readFileSync(path.join(dir, 'nodes', id + '.json'), 'utf8'))]));
  const order = new Map(ids.map((id, i) => [id, i]));
  const misc = domain.misconceptionsList || [];
  const miscIds = new Set(misc.map(m => m.id));
  const steps = ids.map(id => { const n = nodes.get(id); return `- ${id}: «${plain(n.title)}». ${(n.essence || []).map(plain).join(' ')}${n.mistake ? ` Ошибка: «${plain(n.mistake.wrong)}» → «${plain(n.mistake.right)}».` : ''}${n.dataDecision || n.decision?.applies ? ' [решение на данных]' : ''}${(n.examples || []).length ? ` [примеры автора: ${n.examples.length}]` : ''}`; });
  const base = (ch.edges || []).filter(e => e.type === 'base').map(e => `${e.from} → ${e.to}`);
  const user = tpl('links', { steps, base: base.length ? base : ['нет'], misconceptions: misc.map(m => `- ${m.id}: ${m.wrong || m.text || ''}`) });
  const sys = tpl('system', { domain: { ...domain, hints: (domain.hints || []).map(h => '- ' + h) } });
  const r = await llm.json({ stage: 'layer', name: 'links', system: sys, user, schema, task: { stage: 'links' } });

  const warnings = [], have = new Set((ch.edges || []).map(e => `${e.from}|${e.to}`));
  let edges = 0, myths = 0;
  for (const l of r.data.links || []) {
    if (l.type === 'myth') {
      const n = nodes.get(l.from);
      if (!n || !miscIds.has(l.to)) { warnings.push(`связи: заблуждение ${l.from} → ${l.to} — нет такого шага или заблуждения`); continue; }
      if (!n.mistake) { warnings.push(`связи: у шага ${l.from} нет блока «частая ошибка» — заблуждение ${l.to} не записано`); continue; }
      if (n.mistake.ref) continue;
      n.mistake.ref = l.to; myths++;
      continue;
    }
    if (!order.has(l.from) || !order.has(l.to) || l.from === l.to) { warnings.push(`связи: ${l.type} ${l.from} → ${l.to} — нет такого шага`); continue; }
    if (order.get(l.from) > order.get(l.to)) { warnings.push(`связи: ${l.type} ${l.from} → ${l.to} — направление против порядка курса, пропущена`); continue; }
    if (have.has(`${l.from}|${l.to}`)) {
      // ребро уже есть как предпосылка: уточняем тип (переход к данным или пример важнее голой предпосылки)
      const e = ch.edges.find(x => x.from === l.from && x.to === l.to);
      if (e && e.type === 'base') { e.type = l.type; edges++; }
      continue;
    }
    ch.edges.push({ from: l.from, to: l.to, type: l.type }); have.add(`${l.from}|${l.to}`); edges++;
  }
  fs.writeFileSync(chFile, JSON.stringify(ch, null, 2) + '\n');
  for (const [id, n] of nodes) fs.writeFileSync(path.join(dir, 'nodes', id + '.json'), JSON.stringify(n, null, 2) + '\n');
  // этап конвейера, а не ручная правка: обновляем отпечатки прогона
  const runFile = path.join(dir, 'pipeline-run.json');
  if (fs.existsSync(runFile)) { const pr = JSON.parse(fs.readFileSync(runFile, 'utf8')); pr.hashes = layerHashes(dir); pr.links = new Date().toISOString(); fs.writeFileSync(runFile, JSON.stringify(pr, null, 2) + '\n'); }
  log(`связи: типизировано или добавлено ${edges}, заблуждений привязано ${myths}${warnings.length ? `, замечаний ${warnings.length}` : ''}`);
  return { edges, myths, warnings };
}
