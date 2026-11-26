#!/usr/bin/env node
// HTTP API конвейера для фронтенда: загрузка главы (.md или .pdf) → задача → готовый демо-курс.
//   node pipeline/server.mjs [--port 8787]
// Контракт API — pipeline/API.md. Сервер слушает только 127.0.0.1 (HOST в .env), зависимостей нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, loadConfig, publicConfig, providerOverrides } from './lib/config.mjs';
import { listProviders } from './lib/local-llm.mjs';
import { JobQueue } from './lib/jobs.mjs';
import { zipDir } from './lib/zip.mjs';

const args = process.argv.slice(2);
const cfg = loadConfig(args.includes('--port') ? { PORT: args[args.indexOf('--port') + 1] } : {});
// модели для формы: локальные (очередь, CLI) и API, для которых в .env есть ключ (сами ключи наружу не уходят)
function providers() {
  const apis = [];
  if (cfg.provider === 'openai-compatible' || cfg.baseUrl) apis.push(loadConfig(providerOverrides('openai-compatible', '', cfg.model)));
  apis.push(loadConfig(providerOverrides('mistral', '', cfg.model)));
  return listProviders(cfg, apis);
}
const queue = new JobQueue(cfg);
const selfOrigin = `http://${cfg.host}:${cfg.port}`;
const DIST = path.join(ROOT, 'dist');
const WEB = path.join(ROOT, 'pipeline', 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

const originOk = o => !!o && cfg.corsOrigins.some(p => p === '*' || new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(o));
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body), isStr = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isBuf || isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isBuf || isStr ? body : JSON.stringify(body, null, 1));
}
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error(`файл больше ${Math.round(limit / 1048576)} МБ (MAX_UPLOAD_MB)`), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// multipart/form-data: поля и один файл
function parseMultipart(buf, ctype) {
  const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) throw Object.assign(new Error('нет boundary в multipart/form-data'), { status: 400 });
  const sep = Buffer.from('--' + (m[1] || m[2]));
  const fields = {}; let file = null; let pos = buf.indexOf(sep);
  while (pos >= 0) {
    const start = pos + sep.length;
    if (buf.subarray(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(sep, start);
    if (next < 0) break;
    const part = buf.subarray(start + 2, next - 2); // без \r\n после разделителя и перед следующим
    const he = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, he).toString('utf8'), body = part.subarray(he + 4);
    const name = (head.match(/name="([^"]*)"/i) || [])[1];
    const filename = (head.match(/filename\*?=(?:UTF-8'')?"?([^";\r\n]*)"?/i) || [])[1];
    if (filename != null && filename !== '') file = { name: decodeURIComponent(filename), buffer: body };
    else if (name) fields[name] = body.toString('utf8');
    pos = next;
  }
  return { fields, file };
}

function serveFile(res, root, rel, extraHeaders = {}) {
  const abs = path.resolve(root, '.' + path.sep + rel);
  if (!abs.startsWith(path.resolve(root) + path.sep) && abs !== path.resolve(root)) return fail(res, 403, 'путь вне папки');
  let f = abs;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return fail(res, 404, 'нет файла');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extraHeaders });
  fs.createReadStream(f).pipe(res);
}

function courses() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(DIST, d.name, 'index.html'))).map(d => {
    const ch = path.join(ROOT, 'layer', d.name, 'chapter.json'), run = path.join(ROOT, 'layer', d.name, 'pipeline-run.json'), rep = path.join(DIST, d.name, 'build-report.json');
    const c = fs.existsSync(ch) ? JSON.parse(fs.readFileSync(ch, 'utf8')) : {};
    const r = fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : {};
    return { id: d.name, title: c.title, book: c.book, url: `/courses/${d.name}/index.html`, zip: `/api/courses/${d.name}/course.zip`, built: r.built, checksFailed: (r.checks || []).filter(x => !x.ok).length, byPipeline: fs.existsSync(run) ? JSON.parse(fs.readFileSync(run, 'utf8')) : null };
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  const origin = req.headers.origin;
  if (originOk(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    if (p === '/api/health' || p === '/api/providers') {
      const pv = await providers();
      const cur = pv.providers.find(x => x.id === pv.current);
      if (p === '/api/providers') return send(res, 200, pv);
      return send(res, 200, { ok: true, provider: cfg.provider, model: cfg.modelLabel || cfg.model, ocrModel: cfg.ocrModel, keys: { model: !!cur?.available, ocr: !!cfg.mistralKey }, providers: pv, busy: queue.busy, queued: queue.queue.length });
    }
    if (p === '/api/config') return send(res, 200, { config: publicConfig(cfg), domains: fs.readdirSync(path.join(ROOT, 'domain')).filter(d => fs.existsSync(path.join(ROOT, 'domain', d, 'domain.json'))), formats: ['.md', '.pdf'] });

    if (p === '/api/jobs' && req.method === 'POST') {
      // защита от подделки запроса: браузер ставит Origin у POST; чужой сайт не должен запускать задачи на этом компьютере
      if (origin && origin !== selfOrigin && origin !== selfOrigin.replace('127.0.0.1', 'localhost') && !originOk(origin)) return fail(res, 403, `загрузка с ${origin} запрещена: откройте страницу загрузки ${selfOrigin}/ или добавьте адрес в CORS_ORIGINS`);
      const body = await readBody(req, cfg.maxUploadBytes);
      const ctype = req.headers['content-type'] || '';
      let name, buffer, fields = Object.fromEntries(url.searchParams);
      if (/multipart\/form-data/i.test(ctype)) { const mp = parseMultipart(body, ctype); if (!mp.file) return fail(res, 400, 'в форме нет файла (поле file)'); name = mp.file.name; buffer = mp.file.buffer; fields = { ...fields, ...mp.fields }; }
      else { name = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : fields.filename; buffer = body; if (!name) return fail(res, 400, 'укажите имя файла: заголовок X-Filename или параметр ?filename='); }
      const params = { start: fields.start || undefined, end: fields.end || undefined, author: fields.author || undefined, book: fields.book || undefined, year: fields.year || undefined, chapter: fields.chapter || undefined, id: fields.id || undefined, pages: fields.pages || undefined, pageStart: fields.pageStart || undefined, domain: fields.domain || undefined, provider: fields.provider || undefined, cliModel: fields.cliModel || undefined, force: fields.force === '1' || fields.force === 'true' };
      if (params.provider) {
        const pv = await providers(), one = pv.providers.find(x => x.id === params.provider);
        if (!one) return fail(res, 400, `неизвестная модель ${params.provider}; список — /api/providers`);
        if (!one.available) return fail(res, 409, `модель «${one.label}» недоступна: ${one.note}`);
      }
      const job = queue.create({ name, buffer, params });
      return send(res, 202, job, { Location: `/api/jobs/${job.id}` });
    }
    if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, queue.list());

    let m = p.match(/^\/api\/jobs\/([\w-]+)(?:\/(events|report|source\.md|log|course\.zip))?$/);
    if (m && req.method === 'GET') {
      const job = queue.get(m[1]);
      if (!job) return fail(res, 404, 'нет такой задачи');
      const dir = path.join(ROOT, 'work', 'jobs', job.id);
      if (!m[2]) return send(res, 200, job);
      if (m[2] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        ev('job', job);
        const onJob = j => { if (j.id === job.id) { ev('job', j); if (['done', 'failed'].includes(j.state)) { ev('end', { state: j.state }); cleanup(); res.end(); } } };
        const onLog = l => { if (l.id === job.id) ev('log', l); };
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        const cleanup = () => { queue.off('job', onJob); queue.off('log', onLog); clearInterval(ping); };
        queue.on('job', onJob); queue.on('log', onLog); req.on('close', cleanup);
        if (['done', 'failed'].includes(job.state)) { ev('end', { state: job.state }); cleanup(); res.end(); }
        return;
      }
      if (m[2] === 'report') return serveFile(res, dir, 'report.json');
      if (m[2] === 'source.md') return serveFile(res, dir, 'source.md');
      if (m[2] === 'log') return send(res, 200, (queue.jobs.get(job.id).log || []).join('\n'));
      if (m[2] === 'course.zip') { if (job.state !== 'done') return fail(res, 409, 'курс ещё не собран'); return send(res, 200, zipDir(path.join(DIST, job.result.chapterId), job.result.chapterId), { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${job.result.chapterId}.zip"` }); }
    }
    if (p === '/api/courses') return send(res, 200, courses());
    m = p.match(/^\/api\/courses\/([\w.-]+)\/(course\.zip|report|layer|coverage|routing)$/);
    if (m) {
      const id = m[1];
      if (!fs.existsSync(path.join(DIST, id, 'index.html'))) return fail(res, 404, 'нет такого курса');
      if (m[2] === 'course.zip') return send(res, 200, zipDir(path.join(DIST, id), id), { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${id}.zip"` });
      if (m[2] === 'report') return serveFile(res, path.join(DIST, id), 'build-report.json');
      return serveFile(res, path.join(ROOT, 'export', id), m[2] + '.json');
    }
    if (p.startsWith('/courses/')) return serveFile(res, DIST, p.slice('/courses/'.length));
    if (req.method === 'GET' && (p === '/' || p.startsWith('/web/'))) return serveFile(res, WEB, p === '/' ? 'index.html' : p.slice(5));
    return fail(res, 404, 'нет такого адреса; список — pipeline/API.md');
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
});

function openBrowser(url) {
  const [cmd, cargs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, cargs, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`порт ${cfg.port} занят: конвейер, похоже, уже запущен — открываю ${selfOrigin}/ (другой порт: PORT в .env или --port)`); if (args.includes('--open')) openBrowser(selfOrigin + '/'); setTimeout(() => process.exit(0), 500); return; }
  console.error(e.message); process.exit(1);
});
server.listen(cfg.port, cfg.host, () => {
  console.log(`конвейер: ${selfOrigin}/  — загрузка главы и список курсов (API — pipeline/API.md)`);
  console.log(`модель: ${cfg.provider} / ${cfg.modelLabel || cfg.model}${!['stub', 'agent', 'cli'].includes(cfg.provider) && !cfg.apiKey ? '  — НЕТ КЛЮЧА: задайте его в .env или выберите в форме другую модель' : ''}`);
  console.log('остановить: Ctrl+C');
  if (args.includes('--open')) openBrowser(selfOrigin + '/');
});
