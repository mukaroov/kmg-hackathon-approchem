# API конвейера «Глава → курс»

Контракт между backend (конвейер) и фронтендом (страница загрузки и просмотра). Сервер без зависимостей, Node.js 18+:

```
node pipeline/server.mjs --open     # http://127.0.0.1:8787, порт — PORT в .env или --port; --open открывает страницу в браузере
```

Двойной щелчок: `start.cmd` (Windows) или `./start.sh` (macOS, Linux).

Сервер слушает только `127.0.0.1`. Загрузку (`POST /api/jobs`) он принимает только со своей страницы, от клиентов без заголовка Origin (curl, скрипты) и с адресов из `CORS_ORIGINS`; остальным отвечает 403. CORS открыт для `http://localhost:*` и `http://127.0.0.1:*` (переменная `CORS_ORIGINS`), поэтому фронтенд можно запускать на своём dev-сервере. На `/` лежит тестовая страница загрузки: она нужна только для проверки API.

Все ответы — JSON в UTF-8. Ошибка выглядит так: `{"error": "текст по-русски"}` с кодом 400 / 404 / 409 / 413 / 500.

## Как идёт работа

1. `POST /api/jobs` — загрузить файл главы. Ответ `202` с объектом задачи.
2. Следить за ходом работы: поток событий `GET /api/jobs/{id}/events` (SSE) или опрос `GET /api/jobs/{id}` раз в 2–3 секунды.
3. Когда `state = "done"`, курс открывается по `result.courseUrl`, а архив скачивается по `/api/jobs/{id}/course.zip`.

Задачи выполняются по одной, остальные ждут в очереди (`state = "queued"`): лимит запросов к модели общий. Глава из 20 страниц на бесплатном плане Mistral идёт порядка 5–15 минут. Это оценка, замера на реальном ключе ещё нет.

## Загрузка: `POST /api/jobs`

Вариант 1 — `multipart/form-data`:

| Поле | Обязательное | Что это |
|---|---|---|
| `file` | да | `.md` (лучше с метками страниц `<!-- page N -->`, как в md организаторов) или `.pdf`; до 60 МБ (`MAX_UPLOAD_MB`) |
| `pages` | нет | диапазон страниц, например `90-108`; пусто — весь файл |
| `pageStart` | нет | для PDF: какой странице книги соответствует первая страница файла (по умолчанию 1). Нужно, чтобы «с. N» в курсе совпадали с книгой |
| `id` | нет | идентификатор главы (латиница, цифры, дефис); пусто — из имени файла |
| `domain` | нет | доменный пакет из `domain/` (по умолчанию `geo`); список — `GET /api/config` |
| `provider` | нет | `agent` — Claude в чате Claude Code через очередь `work/agent-queue`; `cli:claude` / `cli:codex` — CLI агента; `openai-compatible`, `mistral` — API по ключу из `.env`; `stub` — заглушка без модели. Пусто — модель из `.env`. Список с доступностью — `GET /api/providers` |
| `cliModel` | нет | модель для `cli:claude`: `sonnet`, `opus`, `haiku`; пусто — по умолчанию |
| `start`, `end` | нет | регулярные выражения начала и конца главы внутри страниц (если глава начинается или кончается посреди страницы) |
| `author`, `book`, `year`, `chapter` | нет | выходные данные книги: автор, название, год, глава — если их нет в тексте главы; иначе их ищет модель |
| `force` | нет | `1` — перезаписать слой, даже если его правили вручную после прошлого прогона |

```js
const fd = new FormData();
fd.append('file', input.files[0]);
fd.append('pages', '90-108');
const job = await fetch('http://127.0.0.1:8787/api/jobs', { method: 'POST', body: fd }).then(r => r.json());
```

Вариант 2 — тело запроса и есть файл: заголовок `X-Filename: glava.pdf` (в URL-кодировке), а параметры передаются в строке запроса: `POST /api/jobs?pages=90-108&pageStart=1`.

Сразу отклоняются, с кодом 400: формат не `.md` / `.pdf`, пустой файл, непонятный диапазон страниц, несуществующий доменный пакет. Ошибки, которые всплывают во время работы (нет ключа, PDF без ключа OCR, слой правили вручную), приходят в задаче: `state = "failed"` и `error`.

## Объект задачи: `GET /api/jobs/{id}`

```json
{
  "id": "j20261125145031-4624",
  "created": "2026-11-25T14:50:31.390Z",
  "name": "glava.md",
  "size": 119881,
  "params": { "pages": "90-108" },
  "state": "running",
  "stage": "nodes",
  "progress": 47,
  "stages": [
    { "id": "ingest",  "title": "приём файла",                 "state": "done" },
    { "id": "outline", "title": "план шагов",                  "state": "done" },
    { "id": "nodes",   "title": "узлы, проверки, исправления", "state": "running" },
    { "id": "build",   "title": "сборка курса",                "state": "pending" }
  ],
  "message": "шаг 7: Как отличить коллектор от глины",
  "log": ["14:50:31 приём glava.md", "…"],
  "warnings": ["…"],
  "error": null,
  "result": null
}
```

- `state`: `queued` → `running` → `done` | `failed`.
- `progress`: 0–100.
- `message`: последняя строка журнала, её удобно показывать под полосой прогресса.
- `warnings`: замечания конвейера (например, «в md нет меток страниц»). Их стоит показать пользователю.

`result` после `done`:

```json
{
  "chapterId": "glava",
  "run": 1,
  "courseUrl": "/courses/glava/index.html",
  "course": "dist/glava/index.html",
  "layer": "layer/glava",
  "export": "export/glava",
  "steps": 18,
  "tasks": 55,
  "coverage": { "units": 131, "covered": 131 },
  "checksFailed": ["…проверки сборщика, которые не прошли…"],
  "unresolved": 0,
  "review": { "issues": 4, "applied": 3 },
  "usage": { "layer": { "calls": 40, "cached": 0, "in": 412000, "out": 98000, "ms": 600000, "pages": 0 } },
  "seconds": 610,
  "stub": false
}
```

- `stub: true` — курс собрала заглушка без модели. Это проверка каркаса, а не учебный слой; так и пишите пользователю.
- `unresolved` — сколько ошибок проверок модель так и не исправила. Подробности — в отчёте.

## Остальные адреса

| Адрес | Что отдаёт |
|---|---|
| `GET /api/health` | `{ok, provider, model, ocrModel, keys: {model, ocr}, providers, busy, queued}`: доступна ли модель из `.env` и занята ли очередь |
| `GET /api/providers` | `{current, cliModel, providers: [{id, label, available, note, models?}]}` — модели для выбора в форме; недоступная модель приходит с `note`, что сделать (вход в CLI, ключ). Задача с недоступной моделью получает 409 |
| `GET /api/config` | настройки без ключей, список доменных пакетов, форматы файлов |
| `GET /api/jobs` | все задачи, новые первыми |
| `GET /api/jobs/{id}/events` | SSE-поток: `event: job` — объект задачи целиком при каждом изменении; `event: log` — `{id, line}`, новая строка журнала; `event: end` — `{state}`, после него поток закрывается |
| `GET /api/jobs/{id}/report` | полный отчёт проверок по шагам: неисправленные ошибки, автоисправления цитат, замечания модуля проверки, отчёт сборщика |
| `GET /api/jobs/{id}/source.md` | глава после приёма (для PDF — результат распознавания) с метками страниц |
| `GET /api/jobs/{id}/log` | журнал задачи текстом |
| `GET /api/jobs/{id}/course.zip` | папка курса одним архивом; `409`, пока курс не собран |
| `GET /api/courses` | все собранные курсы: `{id, title, book, url, zip, built, checksFailed, byPipeline}` |
| `GET /api/courses/{id}/course.zip` | архив курса |
| `GET /api/courses/{id}/report` | отчёт сборщика `build-report.json` |
| `GET /api/courses/{id}/layer` · `/coverage` · `/routing` | выгрузки в форматах организаторов (`schemas/*.schema.json`) |
| `GET /courses/{id}/…` | сам курс: статические файлы `dist/{id}/` |

Курс в `dist/{id}/` открывается и без сервера, двойным щелчком по `index.html`. Сервер нужен только конвейеру.

```js
const es = new EventSource(`http://127.0.0.1:8787/api/jobs/${job.id}/events`);
es.addEventListener('job', e => render(JSON.parse(e.data)));
es.addEventListener('end', () => es.close());
```
