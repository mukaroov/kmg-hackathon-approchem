/* STRATA · локальный движок «книга → курс» (правила, без модели и без сервера).
   Делает то, что можно сделать честно без языковой модели:
   — режет книгу по меткам <!-- page N --> и по заголовкам на границах главы;
   — делит главу на единицы покрытия (абзац, заголовок, таблица, формула, рисунок, пример, задача);
   — собирает части и шаги по заголовкам, блоки страницы шага из текста автора со «стр. N» у каждого абзаца;
   — строит задания четырёх типов (один ответ, несколько, порядок, пропуск) из предложений книги, с цитатой и страницей;
   — карточки на все шаги и термины, граф связей «термин введён → термин используется», таблицу покрытия.
   Блоки, которым нужна модель (частая ошибка, что это значит для данных, аналогия, расчётные задания),
   остаются пустыми и не показываются. Их заполняет серверный конвейер через Api, когда он подключён. */
(() => {
  'use strict';
  const VERSION = 'local-rules-1.0';
  const PSEUDO_PAGE = 3000; // знаков на условную страницу, если в файле нет меток

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (arr, r) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const words = t => String(t).split(/\s+/).filter(Boolean).length;
  const LATIN_LOOKALIKE = /(?:\b[A-Za-z0-9]*[bBHIJ][A-Za-z0-9]*\b[ ,.]*){6,}/;
  const plain = t => String(t).replace(/\\\(|\\\)|\$+/g, ' ').replace(/\\[a-zA-Z]+/g, ' ').replace(/[_^{}]/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  /* 1. Страницы. */
  function pages(text) {
    const parts = text.split(/<!--\s*page\s+(\d+)\s*-->/i);
    if (parts.length > 2) {
      const out = [];
      for (let i = 1; i < parts.length; i += 2) out.push({n: Number(parts[i]), text: parts[i + 1]});
      return {list: out, markers: true};
    }
    const out = []; let n = 1;
    const paras = text.split(/\n\s*\n/); let buf = '';
    for (const p of paras) { buf += p + '\n\n'; if (buf.length >= PSEUDO_PAGE) { out.push({n: n++, text: buf}); buf = ''; } }
    if (buf.trim()) out.push({n, text: buf});
    return {list: out, markers: false};
  }

  /* 2. Единицы главы. */
  function classify(b, ctx) {
    const t = b.trim();
    if (/^\d{1,4}$/.test(t) || /^©/.test(t) || (t.length < 90 && /центр профессиональной переподготовки/i.test(t))) return 'furniture';
    if (/^#{1,6}\s/.test(t)) {
      const h = t.replace(/^#+\s*/, '').replace(/\*\*/g, '');
      if (/^(Рис\.|Рисунок|Fig\.|Figure)\s*\d+/i.test(h)) return 'figure';      // подпись рисунка, оформленная заголовком
      if (/^Таблица\s*\d+/i.test(h) && h.length < 220) return 'table_caption';
      return 'heading';
    }
    if (t.split('\n').filter(l => l.trim().startsWith('|')).length >= 2) return 'table';
    if (/^Таблица\s*\d+/i.test(t) && t.length < 220) return 'table_caption';
    if (/^(Рис\.|Рисунок|Fig\.|Figure)\s*\d+/i.test(t)) return 'figure';
    if (/^\$\$[\s\S]*\$\$$/.test(t) || /^\\\[[\s\S]*\\\]$/.test(t)) return 'formula';
    if (/^(Пример|Example)\s*\d+/i.test(t)) return 'worked_example';
    if (/^Задач[аи]\s*\d+/i.test(t) || (ctx.inTasks && /^\d{1,3}\.\s+\S/.test(t))) return 'task';
    return 'paragraph';
  }
  /* Построчно отделяет описания рисунков, вставленные моделью: блок начинается заголовком «━━━ … FORMAT …»
     (обычно после строки «----») и заканчивается строкой-разделителем после «KEYWORDS:» или концом страницы.
     Разделитель перед следующим «━━━» блок не закрывает (одно описание может содержать несколько панелей). */
  function splitModel(text) {
    const lines = String(text).replace(/\r/g, '').split('\n'), out = [];
    const isDash = l => /^\s*-{3,}\s*$/.test(l), isHead = l => /^\s*━━━.*FORMAT/i.test(l);
    const nextNonEmpty = i => { for (let k = i + 1; k < lines.length; k++) if (lines[k].trim()) return lines[k]; return ''; };
    let mode = false, sawKw = false, buf = [];
    const flush = () => { const s = buf.join('\n'); if (s.trim()) out.push(mode ? {fig: s.trim()} : {text: s}); buf = []; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!mode) {
        if ((isDash(l) && isHead(nextNonEmpty(i))) || isHead(l)) { flush(); mode = true; sawKw = false; if (isHead(l)) buf.push(l); continue; }
        if (isDash(l)) continue;                                   // одиночный разделитель — оформление, не содержание
        buf.push(l); continue;
      }
      if (/^\s*KEYWORDS:/i.test(l)) { sawKw = true; buf.push(l); continue; }
      if (sawKw && !l.trim()) { flush(); mode = false; continue; }  // KEYWORDS — последняя строка описания
      if (isDash(l)) {
        if (!sawKw && isHead(nextNonEmpty(i))) continue;          // внутренний разделитель между панелями
        flush(); mode = false; continue;                           // конец описания
      }
      buf.push(l);
    }
    flush();
    return out;
  }

  function scan(text) {
    const pg = pages(text), units = [];
    let inTasks = false, lastTaskNo = 0;
    for (const p of pg.list) {
      // Описания рисунков, вставленные моделью при распознавании: «----\n━━━ FORMAT N: тип ━━━ … KEYWORDS: …\n----».
      // Это не текст автора (source_kind = figure_description_model): отдельная единица, без заданий и терминов.
      const segs = splitModel(p.text);
      const blocks = segs.flatMap(seg => seg.fig ? [{fig: seg.fig}] : seg.text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
        // номера задач «86. … 87. …» внутри одного блока разделяем на отдельные единицы
        .flatMap(b => /^(Задач[аи]\s*)?\d{1,3}\.\s+\S/i.test(b) && /\n\s*\d{1,3}\.\s+\S/.test(b) ? b.split(/\n(?=\s*\d{1,3}\.\s+\S)/).map(x => x.trim()) : [b]));
      blocks.forEach((b, i) => {
        if (typeof b === 'object') {
          const head = (b.fig.match(/━━━\s*(FORMAT[^━\n]*)━*/) || [])[1] || 'FORMAT';
          units.push({id: 'p' + String(p.n).padStart(3, '0') + '.' + String(i + 1).padStart(2, '0'), page: p.n, kind: 'figure_model', text: b.fig, format: head.trim()});
          return;
        }
        let kind = classify(b, {inTasks});
        if (kind === 'heading') inTasks = /^#+\s*Задач/i.test(b);
        else if (kind === 'paragraph' && /^Задач[аи]$/i.test(b)) { kind = 'heading'; inTasks = true; }
        if (kind === 'task') {
          // «1. … 2. …» после задачи № 95 — это пункты процедуры, а не задачи книги
          const no = Number((b.match(/^(?:Задача\s*)?(\d{1,3})\./i) || [])[1]);
          if (lastTaskNo >= 10 && no < 10) kind = 'paragraph'; else lastTaskNo = no || lastTaskNo;
        }
        const u = {id: 'p' + String(p.n).padStart(3, '0') + '.' + String(i + 1).padStart(2, '0'), page: p.n, kind, text: b};
        if (kind === 'heading') u.title = b.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        if (LATIN_LOOKALIKE.test(b)) u.ocrSuspect = true;
        units.push(u);
      });
    }
    const headings = units.map((u, i) => ({i, page: u.page, title: u.title})).filter(h => units[h.i].kind === 'heading');
    return {units, headings, markers: pg.markers, pageMin: pg.list[0]?.n || 1, pageMax: pg.list.at(-1)?.n || 1};
  }

  /* 3. Части и шаги. */
  // \b в JS не видит границ кириллических слов, поэтому границу задаём через (?!\p{L}) с флагом u
  const isPartHeading = t => /^(Глава|Chapter|Part|Часть)(?!\p{L})/iu.test(t) || /^§\s*\d+/.test(t) || /^\d+(\.\d+)?\.?\s+[А-ЯЁA-Z]/.test(t);
  const isTasksHeading = t => /^Задач[аи](?!\p{L})/iu.test(t) || /^(Exercises|Problems)(?!\p{L})/iu.test(t);
  function novTitle(t) {
    let s = t.replace(/^§\s*\d+\.?\s*/, '').replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    if (s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
    const w = s.split(' ');
    return w.length > 7 ? w.slice(0, 7).join(' ') + '…' : s || 'Шаг';
  }
  function group(units) {
    const parts = []; let part = null, step = null;
    const newStep = (title, page) => { step = {title, units: [], page}; if (!part) { part = {title: 'Глава', steps: []}; parts.push(part); } part.steps.push(step); };
    for (const u of units) {
      if (u.kind === 'furniture') continue;
      if (u.kind === 'heading') {
        if (isTasksHeading(u.title)) { if (!step) newStep('Задачи', u.page); step.units.push(u); continue; }
        if (isPartHeading(u.title)) { part = {title: u.title, steps: []}; parts.push(part); }
        newStep(u.title, u.page); step.units.push(u); continue;
      }
      if (!step) newStep('Начало главы', u.page);
      step.units.push(u);
    }
    // объединяем слишком короткие шаги со следующими, делим слишком длинные
    for (const p of parts) {
      const merged = [];
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i], content = s.units.filter(u => u.kind !== 'heading');
        const w = content.reduce((n, u) => n + words(u.text), 0);
        if (w < 60 && !content.some(u => u.kind !== 'paragraph') && i < p.steps.length - 1) { p.steps[i + 1].units.unshift(...s.units); p.steps[i + 1].mergedTitle = s.title; continue; }
        merged.push(s);
      }
      const split = [];
      for (const s of merged) {
        const total = s.units.reduce((n, u) => n + words(u.text), 0);
        if (total <= 950) { split.push(s); continue; }
        let chunk = {title: s.title, units: [], page: s.page}, w = 0, k = 1;
        for (const u of s.units) {
          if (w > 600 && u.kind === 'paragraph') { split.push(chunk); k++; chunk = {title: s.title, units: [], page: u.page, partNo: k}; w = 0; }
          chunk.units.push(u); w += words(u.text);
        }
        split.push(chunk);
      }
      p.steps = split.filter(s => s.units.some(u => u.kind !== 'heading'));
    }
    return parts.filter(p => p.steps.length);
  }

  /* 4. Блоки страницы шага. */
  const sentences = t => plain(t).match(/[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$/g)?.map(s => s.trim()).filter(s => s.length > 3) || [];
  function terms(units) {
    const out = [];
    for (const u of units.filter(x => x.kind === 'paragraph' && !x.ocrSuspect)) {
      for (const s of rawSentences(u.text).filter(r => !/\\\(|\\\)|\$|[_^]\{/.test(r)).map(plain)) {
        let m = s.match(/^([А-ЯЁA-Z][^—–,;:()]{2,70}?)\s+[—–]\s+(?:это\s+)?([^—–]{12,260})$/);
        if (m && words(m[1]) <= 6 && !/^\d/.test(m[1])) { out.push({term: m[1].trim(), def: m[2].replace(/[.!?…]+$/, '').trim(), page: u.page, sentence: s}); continue; }
        m = s.match(/^(.{12,220}?)\s+называ(?:ют|ется|ются|ют\s+также)\s+([^,.;:]{3,60})[.!?…]?$/i);
        if (m && words(m[2]) <= 6) out.push({term: m[2].replace(/[«»"]/g, '').trim(), def: m[1].trim(), page: u.page, sentence: s});
      }
    }
    const seen = new Set();
    // термин — именная группа: до 4 слов и без глагольных окончаний («включают», «является»)
    const verbish = /(?:ют|ят|ет|ит|ат|ется|ются|ится|ался|ался|ено|ана|ены|ает|яет)$/i;
    const badStart = /^(?:в|во|на|по|при|с|со|из|для|от|до|к|о|об|за|под|над|другой|другая|другие|этот|эта|эти|такой|такие|кроме|однако|также|здесь|там|слева|справа|он|она|они|оно)(?!\p{L})/iu;
    return out.filter(t => words(t.term) <= 4 && !badStart.test(t.term) && !t.term.split(/\s+/).some(w => w.length > 3 && verbish.test(w)))
      .map(t => ({...t, def: t.def.replace(/\(\*?рис[^)]*\)?\*?/gi, '').replace(/[*]+/g, '').replace(/\s+/g, ' ').trim()}))
      .filter(t => { const k = t.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  }
  const NUM_RX = /(\d[\d\s,.]*\s?(%|м(?!\p{L})|мм|см|км|мД|мкм|Ом|МПа|атм|°|т\/|г\/|м³|м2|м3|сут|лет|млн)|[≥≤<>]\s?\d|от\s\d+[\d,.]*\sдо\s\d)/u;
  function blocks(units) {
    const paras = units.filter(u => u.kind === 'paragraph');
    const b = {essence: [], how: [], procedure: [], examples: [], numbers: [], terms: [], formulas: [], tables: [], figures: [], figureModel: [], bookTasks: [], ocr: []};
    if (paras[0]) { const s = sentences(paras[0].text).slice(0, 2).join(' '); if (s) b.essence.push({text: s, page: paras[0].page}); }
    let tableCaption = '';
    // подряд идущие абзацы «1. …», «2. …» — пункты процедуры
    const numbered = units.map(u => u.kind === 'paragraph' && /^\d{1,2}[.)]\s*\S/.test(u.text.trim()));
    const inRun = numbered.map((n, k) => n && (numbered[k - 1] || numbered[k + 1]));
    for (const [k, u] of units.entries()) {
      if (u.ocrSuspect) b.ocr.push({unit: u.id, page: u.page});
      if (inRun[k]) { b.procedure.push({text: u.text.replace(/^\d{1,2}[.)]\s*/, '').replace(/\n+/g, ' '), page: u.page}); continue; }
      if (u.kind === 'paragraph') {
        const lines = u.text.split('\n').map(l => l.trim()).filter(Boolean);
        const listLines = lines.filter(l => /^(\d+[.)]|[а-яa-z]\)|[-•–])\s+/.test(l));
        if (listLines.length >= 2 && listLines.length >= lines.length - 1) listLines.forEach(l => b.procedure.push({text: l.replace(/^(\d+[.)]|[а-яa-z]\)|[-•–])\s+/, ''), page: u.page}));
        else b.how.push({text: u.text.replace(/\n+/g, ' '), page: u.page, suspect: !!u.ocrSuspect});
        // исходный текст предложения с формулами: при показе richText отрисует их
        for (const s of rawSentences(u.text.replace(/\n+/g, ' '))) if (NUM_RX.test(plain(s)) && s.length < 360 && b.numbers.length < 8 && !b.numbers.some(n => n.text === s)) b.numbers.push({text: s, page: u.page});
      }
      if (u.kind === 'worked_example') b.examples.push({title: (u.text.match(/^(Пример|Example)\s*\d+/i) || ['Пример'])[0], text: u.text.replace(/\n+/g, ' '), page: u.page, figures: figRefs(u.text)});
      if (u.kind === 'formula') b.formulas.push({tex: u.text.replace(/^\$\$|\$\$$|^\\\[|\\\]$/g, '').trim(), page: u.page});
      if (u.kind === 'table_caption') tableCaption = u.text.replace(/\n+/g, ' ');
      if (u.kind === 'table') { b.tables.push({caption: tableCaption, md: u.text, page: u.page}); tableCaption = ''; }
      if (u.kind === 'figure') b.figures.push({caption: u.text.replace(/\n+/g, ' ').slice(0, 300), page: u.page});
      if (u.kind === 'figure_model') b.figureModel.push({format: u.format, text: u.text.replace(/━+[^\n]*━+\n?/, '').replace(/\nKEYWORDS:[^\n]*/i, '').trim(), page: u.page});
      if (u.kind === 'task') { const m = u.text.match(/^(?:Задача\s*)?(\d{1,3})\.?\s*/i); b.bookTasks.push({number: m ? m[1] : '', text: u.text.replace(/^(?:Задача\s*)?\d{1,3}\.\s*/i, '').replace(/\n+/g, ' '), page: u.page, figures: figRefs(u.text), suspect: !!u.ocrSuspect}); }
    }
    b.terms = terms(units).map(t => ({term: t.term, def: t.def, page: t.page, sentence: t.sentence}));
    return b;
  }
  const figRefs = t => [...new Set((String(t).match(/рис\.\s*\d+(?:\s*,\s*[а-я](?!\p{L}))?/giu) || []).map(x => x.replace(/\s+/g, ' ')))];

  /* 5. Задания из предложений книги. У каждого — страница и цитата, ответ есть в тексте шага. */
  const STOP = new Set('который которая которые которых является являются поэтому однако например вследствие относительно значительно позволяет определяется используется следовательно'.split(' '));
  /* Предложения для заданий: только те, где в исходном тексте нет формул (иначе после очистки остаются обрывки вроде «С ф»). */
  const rawSentences = t => String(t).match(/[^.!?…]+(?:\\\)[^.!?…]*)*[.!?…]+(?=\s|$)|[^.!?…]+$/g)?.map(s => s.trim()).filter(Boolean) || [];
  function pool(step) {
    return step.blocks.how.filter(p => !p.suspect).flatMap(p => rawSentences(p.text)
      .filter(r => !/\\\(|\\\)|\$|\\[a-zA-Z]|[_^]\{/.test(r))
      .map(plain).filter(s => words(s) >= 7 && words(s) <= 38 && /^[А-ЯЁA-Z«(]/.test(s))
      .map(s => ({text: s, page: p.page})));
  }
  function makeTasks(course, r) {
    const tasks = [], allTerms = course.steps.flatMap(s => s.blocks.terms.map(t => ({...t, stepId: s.id})));
    const pools = Object.fromEntries(course.steps.map(s => [s.id, pool(s)]));
    const others = sid => shuffle(course.steps.filter(s => s.id !== sid).flatMap(s => pools[s.id]), r);
    const cut = q => q.length > 170 ? q.slice(0, 167) + '…' : q;
    const add = (s, t) => tasks.push({id: s.id + '-t' + (tasks.filter(x => x.stepId === s.id).length + 1), stepId: s.id, kind: 'recall', ...t});
    course.steps.forEach((s, idx) => {
      const own = pools[s.id];
      // пропуск: термин из определения или ключевое слово
      const term = s.blocks.terms[0];
      if (term && term.sentence.toLowerCase().includes(term.term.toLowerCase())) {
        const rx = new RegExp(term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        add(s, {type: 'gap', prompt: 'Вставьте пропущенный термин: «' + term.sentence.replace(rx, '{{1}}') + '»', answer: [term.term], explanation: 'Термин определён в тексте шага, стр. ' + term.page + '.', page: term.page, quote: cut(term.sentence)});
      } else if (own.length) {
        const cand = own.map(x => ({x, w: (x.text.match(/[А-ЯЁа-яё]{8,}/g) || []).filter(w => !STOP.has(w.toLowerCase()))})).filter(c => c.w.length);
        if (cand.length) {
          const c = cand[Math.floor(r() * cand.length)], w = c.w.sort((a, b) => b.length - a.length)[0];
          add(s, {type: 'gap', prompt: 'Восстановите слово автора: «' + c.x.text.replace(w, '{{1}}') + '»', answer: [w], explanation: 'Предложение взято из текста шага, стр. ' + c.x.page + '.', page: c.x.page, quote: cut(c.x.text)});
        }
      }
      // один ответ: определение термина или «какое утверждение из этого шага»
      const t2 = s.blocks.terms[1] || s.blocks.terms[0];
      const distractDefs = shuffle(allTerms.filter(x => x.term !== t2?.term), r).slice(0, 2);
      if (t2 && distractDefs.length === 2) {
        const opts = shuffle([{id: 'a', text: t2.def}, {id: 'b', text: distractDefs[0].def}, {id: 'c', text: distractDefs[1].def}], r);
        add(s, {type: 'single', prompt: 'Что автор называет «' + t2.term + '»?', options: opts.map(o => ({...o, text: cut(o.text)})), answer: 'a', explanation: 'Определение дано в шаге, стр. ' + t2.page + '.', page: t2.page, quote: cut(t2.sentence), kind: 'understanding'});
      } else if (own.length && others(s.id).length >= 2) {
        const right = own[Math.floor(r() * own.length)], wrong = others(s.id).slice(0, 2);
        const opts = shuffle([{id: 'a', text: right.text}, {id: 'b', text: wrong[0].text}, {id: 'c', text: wrong[1].text}], r);
        add(s, {type: 'single', prompt: 'Какое утверждение относится к шагу «' + s.title + '»?', options: opts.map(o => ({...o, text: cut(o.text)})), answer: 'a', explanation: 'Это предложение есть в тексте шага, стр. ' + right.page + '.', page: right.page, quote: cut(right.text)});
      }
      // порядок (процедура или порядок мыслей) и несколько ответов — по очереди, чтобы были все типы
      const proc = s.blocks.procedure;
      if (proc.length >= 3) {
        const items = proc.slice(0, 5).map((p, i) => ({id: 'o' + i, text: cut(p.text)}));
        add(s, {type: 'order', prompt: 'Расставьте действия в том порядке, в каком их описывает автор', options: shuffle(items, r), answer: items.map(i => i.id), explanation: 'Порядок действий — в блоке «По шагам», стр. ' + proc[0].page + '.', page: proc[0].page, quote: cut(proc[0].text)});
      } else if (idx % 2 === 0 && own.length >= 4) {
        const start = Math.floor(r() * (own.length - 3)), seq = own.slice(start, start + 3);
        const items = seq.map((p, i) => ({id: 'o' + i, text: cut(p.text)}));
        add(s, {type: 'order', prompt: 'Восстановите порядок, в котором автор излагает эти мысли', options: shuffle(items, r), answer: items.map(i => i.id), explanation: 'Последовательность — в тексте шага, стр. ' + seq[0].page + '.', page: seq[0].page, quote: cut(seq[0].text), kind: 'understanding'});
      } else if (own.length >= 2 && others(s.id).length >= 2) {
        const right = shuffle(own, r).slice(0, 2), wrong = others(s.id).slice(0, 2);
        const opts = shuffle([{id: 'a', text: right[0].text}, {id: 'b', text: right[1].text}, {id: 'c', text: wrong[0].text}, {id: 'd', text: wrong[1].text}], r);
        add(s, {type: 'multiple', prompt: 'Отметьте все утверждения, которые есть в шаге «' + s.title + '»', options: opts.map(o => ({...o, text: cut(o.text)})), answer: ['a', 'b'], explanation: 'Два утверждения взяты из этого шага (стр. ' + right[0].page + '), два — из других шагов.', page: right[0].page, quote: cut(right[0].text)});
      }
    });
    return tasks;
  }

  /* 6. Сборка курса. */
  function build(text, opts = {}) {
    const sc = scan(text);
    const from = Number(opts.pageFrom) || sc.pageMin, to = Number(opts.pageTo) || sc.pageMax;
    let units = sc.units.filter(u => u.page >= from && u.page <= to);
    const allInRange = units;
    const startIdx = opts.startHeading != null && opts.startHeading !== '' ? units.findIndex(u => u.id === opts.startHeading) : -1;
    const endIdx = opts.endHeading != null && opts.endHeading !== '' ? units.findIndex(u => u.id === opts.endHeading) : -1;
    const cutBefore = startIdx > 0 ? units.slice(0, startIdx) : [];
    const cutAfter = endIdx > 0 ? units.slice(endIdx) : [];
    units = units.slice(startIdx > 0 ? startIdx : 0, endIdx > 0 ? endIdx : units.length);

    const id = 'u' + hash(text.length + ':' + from + '-' + to + ':' + (opts.startHeading || '') + (opts.endHeading || '')).toString(36);
    const r = rng(hash(id));
    const parts = group(units);
    const steps = []; const outParts = [];
    parts.forEach((p, pi) => {
      const ids = [];
      p.steps.forEach((s, si) => {
        const sid = id + '-s' + (steps.length + 1);
        const bl = blocks(s.units.filter(u => u.kind !== 'heading'));
        const pagesOf = [...new Set(s.units.map(u => u.page))];
        const title = novTitle(s.title) + (s.partNo ? ' · часть ' + s.partNo : '');
        const w = s.units.reduce((n, u) => n + words(u.text), 0);
        steps.push({id: sid, title, bookTitle: s.title.replace(/\*\*/g, ''), minutes: Math.max(2, Math.round(w / 180)), pages: pagesOf, blocks: bl, illustrations: [], hints: [], media: [], unitIds: s.units.map(u => u.id), mergedTitle: s.mergedTitle || ''});
        ids.push(sid);
      });
      outParts.push({id: id + '-p' + (pi + 1), title: novTitle(p.title), bookTitle: p.title, steps: ids});
    });
    const course = {
      id, title: opts.title || 'Курс по книге', subtitle: (opts.author ? opts.author + ' · ' : '') + 'стр. ' + from + '–' + to,
      author: opts.author || '', book: opts.book || opts.fileName || 'Загруженная книга', pages: from + '–' + to,
      source: 'upload', fileName: opts.fileName || '', createdAt: new Date().toISOString(), cover: '', domain: opts.domain || 'Ваша книга', types: [],
      pseudoPages: !sc.markers, parts: outParts, steps, tasks: [], cards: [], links: [], generatedBy: VERSION,
      options: {pageFrom: from, pageTo: to, startHeading: opts.startHeading || '', endHeading: opts.endHeading || ''}
    };
    course.tasks = makeTasks(course, r);
    steps.forEach(s => { s.minutes += Math.round(course.tasks.filter(t => t.stepId === s.id).length * 0.7); });
    // карточки: на каждый шаг и на каждый термин
    course.cards = steps.flatMap(s => [
      {id: s.id + '-c0', stepId: s.id, front: s.title, back: s.blocks.essence[0]?.text || (s.blocks.how[0]?.text || '').slice(0, 260)},
      ...s.blocks.terms.map((t, i) => ({id: s.id + '-c' + (i + 1), stepId: s.id, front: t.term, back: t.def}))
    ]);
    // связи: порядок + «термин введён в шаге A, используется в шаге B»
    const links = steps.slice(1).map((s, j) => ({from: steps[j].id, to: s.id, type: 'prerequisite'}));
    steps.forEach((a, ia) => a.blocks.terms.forEach(t => {
      const key = t.term.toLowerCase().slice(0, Math.max(5, t.term.length - 2));
      steps.slice(ia + 2).forEach(b => {
        const txt = b.blocks.how.map(p => p.text).join(' ').toLowerCase();
        if (txt.includes(key) && !links.some(l => l.from === a.id && l.to === b.id)) links.push({from: a.id, to: b.id, type: 'prerequisite', note: t.term});
      });
    }));
    course.links = links;
    // таблица покрытия
    const where = new Map(); steps.forEach(s => s.unitIds.forEach(u => where.set(u, s.id)));
    const rows = allInRange.map(u => {
      const stepId = where.get(u.id) || null;
      let reason = null;
      if (!stepId) reason = u.kind === 'furniture' ? 'номер страницы или колонтитул' : cutBefore.includes(u) ? 'до начала главы (выбранная граница)' : cutAfter.includes(u) ? 'после конца главы (выбранная граница)' : 'не попала в шаг';
      return {unit_id: u.id, kind: u.kind === 'furniture' ? 'paragraph' : u.kind === 'table_caption' ? 'table' : u.kind === 'figure_model' ? 'figure' : u.kind, page_pdf: u.page,
        excerpt: u.kind === 'figure_model' ? 'Описание рисунка (модель): ' + u.format : plain(u.text).split(' ').slice(0, 12).join(' '),
        node_ids: stepId ? [stepId] : [], reason, ocrSuspect: !!u.ocrSuspect, source_kind: u.kind === 'figure_model' ? 'figure_description_model' : 'text'};
    });
    const counted = rows.filter(r => !/номер страницы|главы/.test(r.reason || ''));
    course.coverage = {rows, units: counted.length, covered: counted.filter(r => r.node_ids.length).length, ocrSuspect: rows.filter(r => r.ocrSuspect).length};
    return course;
  }

  window.Engine = {VERSION, scan, build, pages};
})();
