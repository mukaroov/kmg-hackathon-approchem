// Задачи конвейера: одна загруженная глава — одна задача. Очередь выполняет задачи по одной (лимит запросов к модели общий),
// состояние каждой хранится в work/jobs/<id>/job.json, события хода работы рассылаются подписчикам (SSE в server.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ROOT, loadConfig, publicConfig } from './config.mjs';
import { createLLM } from './llm.mjs';
import { ingest, parseRange } from './ingest.mjs';
import { buildLayer } from './stages.mjs';
import { prepareTarget, writeLayer, runBuild, slugify } from './assemble.mjs';
import { linkStage } from './links.mjs';
import { readSource } from '../../build/lib/source.mjs';

const JOBS = path.join(ROOT, 'work', 'jobs');
const STAGES = [['ingest', 'приём файла', 5], ['outline', 'план шагов', 10], ['nodes', 'узлы, проверки, исправления', 70], ['build', 'сборка курса', 15]];

export function loadDomain(id = 'geo') {
  const dir = path.join(ROOT, 'domain', id);
  if (!/^[a-z0-9_-]+$/i.test(id) || !fs.existsSync(path.join(dir, 'domain.json'))) throw new Error(`нет доменного пакета domain/${id}/domain.json`);
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'domain.json'), 'utf8'));
  d.misconceptionsList = d.misconceptions ? JSON.parse(fs.readFileSync(path.join(dir, d.misconceptions), 'utf8')) : [];
  return d;
}

const csv = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function appendMetrics(rows) {
  const f = path.join(ROOT, 'logs', 'metrics.csv');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, 'chapter,stage,nodes,llm_tokens_in,llm_tokens_out,money_usd,person_minutes,mentor_minutes,video_seconds,manual_share\n');
  fs.appendFileSync(f, rows.map(r => r.map(csv).join(',')).join('\n') + '\n');
}

export class JobQueue extends EventEmitter {
  constructor(cfg = loadConfig()) {
    super();
    this.cfg = cfg; this.jobs = new Map(); this.queue = []; this.busy = false;
    fs.mkdirSync(JOBS, { recursive: true });
    for (const d of fs.readdirSync(JOBS)) {
      const f = path.join(JOBS, d, 'job.json');
      if (!fs.existsSync(f)) continue;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.state === 'queued' || j.state === 'running') { j.state = 'failed'; j.error = 'сервер был перезапущен во время работы; загрузите файл снова'; }
      this.jobs.set(j.id, j);
    }
  }
  list() { return [...this.jobs.values()].sort((a, b) => b.created.localeCompare(a.created)).map(j => this.view(j)); }
  get(id) { const j = this.jobs.get(id); return j && this.view(j); }
  view(j) { const { log, ...rest } = j; return { ...rest, log: log.slice(-200) }; }
  save(j) { fs.writeFileSync(path.join(JOBS, j.id, 'job.json'), JSON.stringify(j, null, 1)); }

  create({ name, buffer, params = {} }) {
    const safe = path.basename(String(name || 'chapter.md')).replace(/[^\w.\-а-яёА-ЯЁ ]+/g, '_');
    const ext = path.extname(safe).toLowerCase();
    if (!['.md', '.markdown', '.txt', '.pdf'].includes(ext)) throw Object.assign(new Error(`формат ${ext || 'без расширения'} не поддерживается: нужен .md или .pdf`), { status: 400 });
    if (!buffer?.length) throw Object.assign(new Error('пустой файл'), { status: 400 });
    parseRange(params.pages); // проверка до постановки в очередь
    if (params.domain) loadDomain(params.domain);
    const now = new Date();
    const id = 'j' + now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex');
    fs.mkdirSync(path.join(JOBS, id), { recursive: true });
    fs.writeFileSync(path.join(JOBS, id, 'input' + ext), buffer);
    const job = { id, created: now.toISOString(), name: safe, size: buffer.length, params, state: 'queued', stage: null, progress: 0, stages: STAGES.map(([k, t]) => ({ id: k, title: t, state: 'pending' })), message: 'в очереди', log: [], warnings: [], result: null, error: null };
    this.jobs.set(id, job); this.save(job);
    this.queue.push(id); this.emit('job', this.view(job));
    setImmediate(() => this.pump());
    return this.view(job);
  }

  async pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const job = this.jobs.get(this.queue.shift());
    try { await this.run(job); } catch (e) { job.state = 'failed'; job.error = e.message; this.note(job, 'ошибка: ' + e.message); }
    job.finished = new Date().toISOString(); this.save(job); this.emit('job', this.view(job));
    this.busy = false; this.pump();
  }

  note(job, msg) { const line = `${new Date().toISOString().slice(11, 19)} ${msg}`; job.log.push(line); job.message = msg; this.emit('log', { id: job.id, line }); }
  setStage(job, id, done = 0, total = 1, msg) {
    let acc = 0;
    for (const [k, , w] of STAGES) { const s = job.stages.find(x => x.id === k); if (k === id) { s.state = done >= total ? 'done' : 'running'; acc += w * (total ? done / total : 1); break; } s.state = 'done'; acc += w; }
    job.stage = id; job.progress = Math.round(acc);
    if (msg) this.note(job, msg);
    this.save(job); this.emit('job', this.view(job));
  }

  async run(job) {
    const P = job.params;
    const cfg = loadConfig(P.provider ? { LLM_PROVIDER: P.provider } : {});
    job.state = 'running'; job.started = new Date().toISOString(); job.config = publicConfig(cfg);
    const dir = path.join(JOBS, job.id);
    const meter = {};
    const log = m => this.note(job, m);
    const llm = createLLM(cfg, { log, meter });
    const domain = loadDomain(P.domain || 'geo');
    const target = prepareTarget(slugify(P.id || path.basename(job.name, path.extname(job.name))), { force: !!P.force });
    const t0 = Date.now();

    this.setStage(job, 'ingest', 0, 1, `приём ${job.name}`);
    const buffer = fs.readFileSync(path.join(dir, 'input' + path.extname(job.name).toLowerCase()));
    const info = await ingest({ name: job.name, buffer, range: parseRange(P.pages), pageStart: Number(P.pageStart) || 1, jobDir: dir, llm, cfg, log });
    job.warnings.push(...info.warnings);
    fs.writeFileSync(path.join(dir, 'source.md'), info.md);
    const S = readSource(path.join(dir, 'source.md'));
    this.setStage(job, 'ingest', 1, 1, `глава: с. ${info.from}–${info.to}, ${info.extractor}`);

    const layer = await buildLayer({ S, from: info.from, to: info.to, start: P.start, end: P.end, name: job.name, domain, llm, cfg, log, progress: (st, d, t, m) => this.setStage(job, st, d, t, m) });
    job.warnings.push(...layer.warnings);

    this.setStage(job, 'build', 0, 1, `запись слоя layer/${target.id} (прогон ${target.run})`);
    const written = writeLayer({ target, layer, source: info.md, ingestInfo: info, name: job.name, domain, jobId: job.id, cfg, images: info.images, jobDir: dir, warnings: job.warnings, meta: { author: P.author, book: P.book, year: P.year, chapter: P.chapter, start: P.start, end: P.end } });
    try { const lk = await linkStage({ dir: path.join(ROOT, 'layer', target.id), llm, domain, log }); job.warnings.push(...lk.warnings); }
    catch (e) { job.warnings.push(`этап связей не выполнен: ${e.message}`); }
    const b = await runBuild(target.id);
    fs.writeFileSync(path.join(dir, 'build.log'), b.log);
    if (!b.ok) throw new Error(`сборка курса не прошла: ${(b.log.match(/✗[\s\S]*?(?=\n\n|$)/) || [b.log.slice(-600)])[0]}`);

    // итог: отчёт по проверкам, покрытие, токены, метрики
    const report = { job: job.id, chapter: target.id, run: target.run, units: layer.units.length, unitsAutoAssigned: layer.missingUnits,
      nodes: layer.results.map(r => ({ n: r.plan.n, title: r.data.title, pages: r.pages, units: r.plan.units, unresolved: r.hard, notes: r.soft, autoFixes: r.fixes, review: r.issues })),
      warnings: job.warnings, build: b.report };
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
    const cov = fs.existsSync(path.join(ROOT, 'export', target.id, 'coverage.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'export', target.id, 'coverage.json'), 'utf8')).rows : [];
    const tok = st => meter[st] || { in: 0, out: 0, calls: 0, cached: 0, pages: 0 };
    const usd = (m, pages = 0) => +((m.in * cfg.price.in + m.out * cfg.price.out) / 1e6 + pages * cfg.price.ocrPage).toFixed(4);
    const L = tok('layer'), R = tok('review'), O = tok('ocr');
    appendMetrics([
      [target.id, 'layer', written.nodes, L.in + O.in, L.out + O.out, usd({ in: L.in + O.in, out: L.out + O.out }, O.pages), 0, 0, 0, 0],
      [target.id, 'review', written.nodes, R.in, R.out, usd(R), 0, 0, 0, 0],
      [target.id, 'course', written.nodes, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const failed = (b.report?.checks || []).filter(c => !c.ok);
    job.result = {
      chapterId: target.id, run: target.run, layer: `layer/${target.id}`, export: `export/${target.id}`, course: `dist/${target.id}/index.html`, courseUrl: `/courses/${target.id}/index.html`,
      steps: written.nodes, tasks: layer.results.reduce((a, r) => a + (r.data.tasks || []).length, 0),
      coverage: { units: cov.length, covered: cov.filter(r => r.node_ids.length).length },
      checksFailed: failed.map(c => c.msg), unresolved: layer.results.reduce((a, r) => a + r.hard.length, 0),
      review: { issues: layer.results.reduce((a, r) => a + r.issues.length, 0), applied: layer.results.reduce((a, r) => a + r.issues.filter(x => x.applied).length, 0) },
      usage: meter, seconds: Math.round((Date.now() - t0) / 1000), stub: cfg.provider === 'stub',
    };
    job.state = 'done';
    this.setStage(job, 'build', 1, 1, `готово: ${written.nodes} шагов, ${job.result.tasks} заданий, покрыто ${job.result.coverage.covered} из ${job.result.coverage.units} единиц главы`);
  }
}
