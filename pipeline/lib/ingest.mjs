// Вход конвейера: md или PDF главы → source.md с метками страниц <!-- page N --> (тот же формат, что у md организаторов).
//   md с метками страниц — берётся как есть (можно вырезать диапазон страниц);
//   md без меток — страницы по символу перевода страницы \f, иначе весь текст считается одной страницей (с замечанием);
//   PDF — распознаётся Mistral OCR постранично; картинки сохраняются, рисунки по желанию описываются моделью с поддержкой изображений,
//         чтобы смысл рисунков с легендами не терялся (ТЗ: «без сканов смысл рисунков с легендами теряется»).
import fs from 'node:fs';
import path from 'node:path';

export function parseRange(s) {
  if (s == null || s === '') return null;
  const m = String(s).match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/);
  if (!m) throw new Error(`диапазон страниц «${s}» не понят: нужно, например, 90-108`);
  const a = +m[1], b = m[2] ? +m[2] : a;
  if (b < a) throw new Error(`диапазон страниц «${s}»: конец раньше начала`);
  return [a, b];
}

function splitMarked(text) {
  const pages = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/<!--\s*page\s+(\d+)\s*-->/);
    if (m) { cur = +m[1]; if (!pages.has(cur)) pages.set(cur, []); continue; }
    if (cur != null) pages.get(cur).push(line);
  }
  return pages;
}

const FIG_PROMPT = `Это рисунок со страницы учебной книги. Опиши его для читателя, который рисунка не видит, по-русски, коротко и точно.
Формат:
ТИП: график / схема / разрез / таблица-картинка / фото / другое
ОСИ И ШКАЛЫ: подписи осей, единицы, диапазоны, логарифмическая ли шкала (если есть)
ЛЕГЕНДА: условные обозначения и что они значат
ЧТО ПОКАЗАНО: кривые, области, подписи, числа — только то, что видно на рисунке
KEYWORDS: 3–6 ключевых слов
Ничего не додумывай: если подпись не читается, так и напиши.`;

export async function ingest({ name, buffer, range, pageStart = 1, jobDir, llm, cfg, log = () => {} }) {
  const ext = path.extname(name).toLowerCase();
  const warnings = [];
  let pages, kind, extractor;
  fs.mkdirSync(jobDir, { recursive: true });

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    kind = 'md';
    const text = buffer.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (/<!--\s*page\s+\d+\s*-->/.test(text)) { pages = splitMarked(text); extractor = 'метки страниц из md'; }
    else if (text.includes('\f')) { pages = new Map(text.split('\f').map((t, i) => [pageStart + i, t.split('\n')])); extractor = 'страницы по символу \\f'; }
    else {
      pages = new Map([[pageStart, text.split('\n')]]);
      extractor = 'md без меток страниц';
      warnings.push(`в md нет меток страниц <!-- page N -->: вся глава считается страницей ${pageStart}, и ссылки «с. N» в курсе будут условными. Загрузите md с метками или PDF`);
    }
  } else if (ext === '.pdf') {
    kind = 'pdf';
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('файл с расширением .pdf — не PDF');
    const ocrPages = range ? `${range[0] - pageStart}-${range[1] - pageStart}` : undefined;
    if (range && range[0] < pageStart) throw new Error(`страница ${range[0]} раньше первой страницы файла (${pageStart})`);
    log(`распознавание PDF (${cfg.ocrModel})${ocrPages ? `, страницы файла ${ocrPages} (с нуля)` : ''}`);
    const r = await llm.ocr({ pdf: buffer, pages: ocrPages });
    extractor = `Mistral OCR (${r.model})`;
    pages = new Map();
    const imgDir = path.join(jobDir, 'images');
    let figs = 0;
    for (const p of r.pages) {
      const no = pageStart + p.index;
      let md = String(p.markdown || '');
      for (const im of p.images || []) {
        if (!im.image_base64) continue;
        const b64 = String(im.image_base64).replace(/^data:[^;]+;base64,/, '');
        const fname = `p${String(no).padStart(3, '0')}-${im.id}`;
        fs.mkdirSync(imgDir, { recursive: true });
        fs.writeFileSync(path.join(imgDir, fname), Buffer.from(b64, 'base64'));
        let desc = '';
        if (cfg.describeFigures && llm.provider !== 'stub') {
          try {
            const mime = /\.png$/i.test(im.id) ? 'image/png' : 'image/jpeg';
            const v = await llm.vision({ stage: 'ocr', prompt: FIG_PROMPT, image: `data:${mime};base64,${b64}` });
            if (v.text) { desc = `\n\n----\n━━━ FORMAT: описание рисунка, сделанное моделью ${v.model} при извлечении (не текст автора)\n${v.text.replace(/\n\s*\n/g, '\n')}\n----\n`; figs++; }
          } catch (e) { warnings.push(`рисунок ${fname} не описан моделью: ${e.message.slice(0, 160)}`); }
        }
        md = md.split(`](${im.id})`).join(`](images/${fname})`).replace(`![${im.id}](images/${fname})`, m => m + desc);
      }
      pages.set(no, md.split('\n'));
    }
    if (cfg.describeFigures && llm.provider !== 'stub') log(`описано рисунков моделью: ${figs}`);
  } else {
    throw new Error(`формат ${ext || 'без расширения'} не поддерживается: загрузите .md или .pdf`);
  }

  let nums = [...pages.keys()].sort((a, b) => a - b);
  if (range && kind === 'md') nums = nums.filter(n => n >= range[0] && n <= range[1]);
  if (!nums.length) throw new Error(range ? `в файле нет страниц ${range[0]}–${range[1]}` : 'в файле нет текста');
  const body = nums.map(n => `<!-- page ${n} -->\n${pages.get(n).join('\n').trim()}\n`).join('\n');
  if (body.replace(/<!--[^>]*-->|\s/g, '').length < 500) warnings.push('в главе меньше 500 знаков текста: проверьте файл');
  const header = `<!-- Глава для конвейера: ${name.replace(/--/g, '-')}; извлечение: ${extractor}; страницы ${nums[0]}–${nums[nums.length - 1]}. Не править: по этому файлу сверяются цитаты и числа. -->\n`;
  return { md: header + body, from: nums[0], to: nums[nums.length - 1], kind, extractor, warnings, images: fs.existsSync(path.join(jobDir, 'images')) ? fs.readdirSync(path.join(jobDir, 'images')) : [] };
}
