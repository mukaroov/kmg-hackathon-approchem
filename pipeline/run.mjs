#!/usr/bin/env node
// Конвейер из командной строки: одна команда на главу.
//   node pipeline/run.mjs <глава.md|глава.pdf> [--id имя] [--pages 90-108] [--page-start 1] [--domain geo] [--provider stub] [--force]
// --pages       какие страницы взять (номера из меток <!-- page N --> или страницы книги для PDF)
// --page-start  какой странице книги соответствует первая страница PDF (по умолчанию 1)
// --provider    поставщик модели вместо LLM_PROVIDER из .env; stub — проверка каркаса без модели
// --start, --end — регулярные выражения начала и конца главы внутри страниц (например "^#\s*Глава V")
// --author, --book, --year, --chapter — выходные данные книги, если их нет в тексте главы
// --force       перезаписать слой, даже если его правили вручную после прошлого прогона
import fs from 'node:fs';
import path from 'node:path';
import { JobQueue } from './lib/jobs.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^--/.test(args[args.indexOf(a) - 1] || ''));
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
if (!file || args.includes('--help')) {
  console.log('Использование: node pipeline/run.mjs <глава.md|глава.pdf> [--id имя] [--pages 90-108] [--page-start 1] [--domain geo] [--provider stub|agent|cli:claude] [--cli-model sonnet|opus] [--author «И. О. Фамилия»] [--book «Название»] [--year 2012] [--chapter «Глава 10»] [--force]');
  process.exit(file ? 0 : 2);
}
if (!fs.existsSync(file)) { console.error(`нет файла ${file}`); process.exit(2); }

const q = new JobQueue();
q.on('log', e => console.log('  ' + e.line));
let job;
try {
  job = q.create({ name: path.basename(file), buffer: fs.readFileSync(file), params: { start: opt('start'), end: opt('end'), author: opt('author'), book: opt('book'), year: opt('year'), chapter: opt('chapter'), id: opt('id'), pages: opt('pages'), pageStart: opt('page-start'), domain: opt('domain'), provider: opt('provider'), cliModel: opt('cli-model'), force: args.includes('--force') } });
} catch (e) { console.error('✗ ' + e.message); process.exit(2); }
console.log(`задача ${job.id}: ${job.name}`);
q.on('job', j => {
  if (j.id !== job.id || !['done', 'failed'].includes(j.state)) return;
  if (j.state === 'failed') { console.error(`\n✗ ${j.error}\n  журнал: work/jobs/${j.id}/job.json`); process.exit(1); }
  const r = j.result;
  console.log(`\n✓ курс: ${r.course}\n  слой: ${r.layer}  экспорт: ${r.export}  отчёт: work/jobs/${j.id}/report.json`);
  console.log(`  шагов ${r.steps}, заданий ${r.tasks}, покрыто единиц ${r.coverage.covered}/${r.coverage.units}, неисправленных замечаний ${r.unresolved}, замечаний проверки ${r.review.issues} (исправлено ${r.review.applied}), ${r.seconds} с`);
  for (const [st, m] of Object.entries(r.usage)) console.log(`  токены ${st}: вход ${m.in}, выход ${m.out}, запросов ${m.calls} (из кеша ${m.cached})${m.pages ? ', страниц OCR ' + m.pages : ''}`);
  if (r.checksFailed.length) console.log('  не пройдены проверки сборщика:\n   - ' + r.checksFailed.join('\n   - '));
  if (j.warnings.length) console.log(`  замечаний конвейера: ${j.warnings.length} (в отчёте)`);
  if (r.stub) console.log('  ВНИМАНИЕ: работала заглушка без модели — это проверка каркаса, а не учебный слой');
  process.exit(0);
});
