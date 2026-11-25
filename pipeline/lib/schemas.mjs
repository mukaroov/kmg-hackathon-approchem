// JSON-схемы ответов модели на этапах конвейера. Простые конструкции (без $ref и oneOf), чтобы их принимал строгий режим поставщиков.
const S = { type: 'string' };
const I = { type: 'integer' };
const N = { type: 'number' };
const B = { type: 'boolean' };
const arr = items => ({ type: 'array', items });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

export const DIFF = ['М', 'В', 'И', 'Ф', 'П', 'Пр', 'Н', 'Р'];
export const FORMATS = ['шортс', 'длинное видео', 'интерактив', 'практикум на данных', 'карточки', 'текст'];
export const ISSUE_TYPES = ['overgeneralization', 'sign_flip', 'measured_vs_inferred', 'lost_condition', 'missing_caveat', 'wrong_scaling', 'wrong_mechanism', 'outdated_as_current', 'analogy_without_limit', 'unsupported'];

export const outlineSchema = obj({
  chapter: obj({
    title: S, subtitle: S, description: S, intro: arr(S), language: S,
    book: obj({ author: S, title: S, year: S, chapter: S, chapterTitle: S }),
  }),
  parts: arr(obj({
    title: S, short: S, sub: S,
    nodes: arr(obj({
      n: I, title: S, bookTitle: S, units: arr(S),
      difficulty: obj({ primary: { type: 'string', enum: DIFF }, secondary: { type: 'string', enum: [...DIFF, ''] } }),
      threshold: B, dataDecision: B, after: arr(I),
    })),
  })),
});

const task = obj({
  id: S, type: { type: 'string', enum: ['single', 'multi', 'order', 'blank', 'calc'] }, q: S,
  options: arr(S), items: arr(S), text: S,
  answerIndex: I, answerIndexes: arr(I), answerText: arr(S), answerNumber: N, tol: N, unit: S,
  explain: S, claim: S,
}, ['id', 'type', 'q', 'explain', 'claim']);
export const tasksSchema = obj({ tasks: arr(task) });

const pageText = obj({ text: S, page: I });
export const nodeSchema = obj({
  title: S, bookTitle: S, bookShort: S,
  essence: arr(S),
  how: arr(obj({ text: S, page: I, claims: arr(S) })),
  claims: arr(obj({ id: S, kind: { type: 'string', enum: ['observation', 'inference', 'assumption'] }, sourceKind: { type: 'string', enum: ['text', 'formula', 'table', 'figure_caption'] }, text: S, quote: S, page: I })),
  procedure: obj({ intro: S, page: I, items: arr(pageText) }),
  examples: arr(obj({ id: S, title: S, page: I, given: S, steps: arr(S), result: S, note: S })),
  numbers: arr(obj({ name: S, value: S, cond: S, page: I })),
  formulas: arr(obj({ expr: S, no: S, page: I, vars: arr(obj({ s: S, m: S, u: S })), note: S })),
  tables: arr(obj({ title: S, page: I, head: arr(S), rows: arr(arr(S)), notes: S })),
  bookTasks: arr(obj({ no: S, text: S, need: S, page: I })),
  glossary: arr(obj({ term: S, en: S, def: S, page: I })),
  mistake: obj({ wrong: S, right: S, page: I, ref: S }),
  data: obj({ input: arr(S), output: arr(S), breaks: arr(S) }),
  decision: obj({ applies: B, features: arr(S), rule: S, conclusion: S, counterexample: S }),
  analogy: obj({ text: S, limit: S }),
  itAnalogy: obj({ text: S, limit: S }),
  nowPractice: S,
  inefficiency: obj({ applies: B, inputs: S, manualSteps: S, judgment: S, time: S, errors: S }),
  layers: obj({ mechanism: S, practice: S, nuances: S, deeper: arr(S) }),
  whyHere: S,
  route: obj({ format: { type: 'string', enum: FORMATS }, why: S, template: S, video_scores: obj({ time: I, invisible: I, scale: I, counterintuitive: I, cause_effect: I }) }),
  figure: obj({ type: { type: 'string', enum: ['chain', 'matrix'] }, caption: S, alt: S, items: arr(S), cols: arr(S), rows: arr(arr(S)) }),
  tasks: arr(task),
  card: obj({ front: S, back: S }),
});

export const verifySchema = obj({
  issues: arr(obj({ where: S, type: { type: 'string', enum: ISSUE_TYPES }, severity: I, problem: S, fix: S, page: I, quote: S })),
});
