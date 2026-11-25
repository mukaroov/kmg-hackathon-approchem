// Минимальный валидатор JSON Schema (draft 2020-12) без зависимостей.
// Поддерживает ключевые слова, которые встречаются в схемах организаторов:
// type, required, properties, items, enum, const, pattern, minItems, minLength, minimum, maximum,
// $ref (#/$defs/...), anyOf, oneOf, allOf, if/then. Остальные ключевые слова пропускаются.

const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const isType = (v, t) => t === 'number' ? typeof v === 'number' : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t;

export function validate(data, schema, root = schema, at = '$', errors = []) {
  if (schema === true || schema == null) return errors;
  if (schema.$ref) {
    const ref = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o && o[k], root);
    if (!ref) errors.push(`${at}: нет определения ${schema.$ref}`);
    else validate(data, ref, root, at, errors);
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some(t => isType(data, t))) { errors.push(`${at}: ожидался тип ${types.join(' | ')}, получен ${typeOf(data)}`); return errors; }
  }
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(data))) errors.push(`${at}: значение ${JSON.stringify(data)} не из списка ${JSON.stringify(schema.enum)}`);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(data)) errors.push(`${at}: должно быть ${JSON.stringify(schema.const)}`);
  if (typeof data === 'string') {
    if (schema.minLength != null && data.length < schema.minLength) errors.push(`${at}: строка короче ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(data)) errors.push(`${at}: «${data}» не подходит под шаблон ${schema.pattern}`);
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) errors.push(`${at}: меньше ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errors.push(`${at}: больше ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) errors.push(`${at}: элементов меньше ${schema.minItems}`);
    if (schema.items) data.forEach((x, i) => validate(x, schema.items, root, `${at}[${i}]`, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of schema.required || []) if (!(k in data)) errors.push(`${at}: нет обязательного поля ${k}`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in data) validate(data[k], s, root, `${at}.${k}`, errors);
  }
  const sub = s => validate(data, s, root, at, []);
  if (schema.allOf) schema.allOf.forEach(s => validate(data, s, root, at, errors));
  if (schema.anyOf && !schema.anyOf.some(s => !sub(s).length)) errors.push(`${at}: не подходит ни под один вариант anyOf (${schema.anyOf.map(s => sub(s)[0]).join('; ')})`);
  if (schema.oneOf && schema.oneOf.filter(s => !sub(s).length).length !== 1) errors.push(`${at}: должно подходить ровно под один вариант oneOf`);
  if (schema.if && !sub(schema.if).length && schema.then) validate(data, schema.then, root, at, errors);
  return errors;
}
