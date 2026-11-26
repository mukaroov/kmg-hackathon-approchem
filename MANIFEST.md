# Манифест конвейера

Команда: [название команды]
Тег заморозки: `freeze` (ставится до выдачи тестовых глав, порядок — `TEST_DAY.md`)

## Модели

| Этап | Модель | Версия | Где работает | Что уходит наружу | Как заменить |
| --- | --- | --- | --- | --- | --- |
| Учебный слой: план шагов, узлы, задания, маршрутизация, связи | Claude Sonnet через Claude Code CLI (`LLM_PROVIDER=cli`, `LLM_CLI_MODEL=sonnet`), по подписке Claude | `claude-sonnet-5-5`; CLI `2.1.330`; фактическая модель каждого запроса — в журнале задачи и `layer/<глава>/pipeline-run.json` | облако Anthropic | промпты `pipeline/prompts/` с текстом страниц главы | форма загрузки или флаг `--provider` (`agent`, `cli:claude`, `cli:codex`, `openai-compatible`, `mistral`, `stub`) и `--cli-model`; по умолчанию — `.env` |
| Слой без API (режим `agent`) | агент в чате Claude Code отвечает на запросы из `work/agent-queue/` (главы Кузнецова, Басниева, Вендельштейна: Claude, Anthropic) | записывается в `layer/<глава>/pipeline-run.json` | там, где работает агент | промпты конвейера с текстом страниц главы — агенту | `--provider agent` |
| Запасной API | Gemini (`openai-compatible`), Mistral Medium 3.5 | `gemini-3.6-flash` и резервные из `LLM_FALLBACK_MODELS`; `mistral-medium-2604` | облако Google / Mistral | текст страниц главы | `LLM_MODEL`, `LLM_BASE_URL`, ключ в `.env` |
| Доменный пакет нового домена | та же модель, что для слоя (`pipeline/domain.mjs`) | как у слоя; записывается в `domain/<id>/build.json` | как у слоя | текст главы (до 90 тыс. символов) | `--provider`, `--cli-model` |
| Распознавание PDF | Mistral OCR | алиас `mistral-ocr-latest`; фактическая версия пишется в журнал задачи | облако Mistral (API `/v1/ocr`) | страницы PDF главы; для md-входа — ничего | `OCR_MODEL` в `.env`; без OCR — загрузить md главы |
| Описание рисунков из PDF | Mistral Medium 3.5 | `mistral-medium-2604` | облако Mistral | изображения рисунков главы | `LLM_VISION_MODEL`; выключить — `DESCRIBE_FIGURES=0` |
| Проверки слоя | детерминированные проверки (цитаты, страницы, числа, покрытие, схемы) + смысловая проверка той же моделью | — | проверки — локально; смысловая — как у слоя | текст шага и страниц | выключить смысловую проверку — `VERIFY=0` |
| Спецификация сцены ролика | та же модель, что для слоя | — | как у слоя | текст шага и схема движка | `node pipeline/video.mjs … --provider …` |
| Модуль проверки внешнего пакета | сверка — локально; суждение — та же модель | — | как у слоя | элементы пакета, страницы главы, кадры PNG | `node pipeline/review.mjs … --provider …` |
| Сборка курса | без модели | — | локально | ничего | — |
| Озвучка | Gemini TTS `gemini-3.8-flash-tts`, голос Charon; запасные — Fish Audio `s2.1-pro-free`, Windows SAPI «Microsoft Irina Desktop» (`pipeline/lib/tts.mjs`) | gemini-3.8-flash-tts | Gemini API / локально | текст реплик сценария (Gemini, Fish); ничего (Windows) | `TTS_PROVIDER`, `GEMINI_TTS_VOICE`, `GEMINI_TTS_STYLE`, `FISH_VOICE` |
| Иллюстрации и кадры роликов | без генеративных моделей: рисунки строятся кодом (виджеты `engine/widgets.js`), кадры — детерминированным движком `video/video_engine.py` | — | локально | ничего | — |

Выход данных во внешние сервисы: текст и страницы глав уходят в Anthropic (Claude Code CLI по подписке Claude); при запасных режимах — в Google (Gemini API) или Mistral AI; текст реплик роликов — в Gemini TTS. Тесты конвейера без внешних вызовов: `--provider stub` (заглушка, наружу ничего не уходит).

Повторный прогон той же главы с теми же настройками берёт ответы из кеша `cache/llm/` и наружу ничего не отправляет.

## Инструменты

| Инструмент | Версия | Для чего | Данные наружу |
| --- | --- | --- | --- |
| Node.js | 18 или новее (проверено на 24.21.0) | конвейер, сервер API, сборка курса | нет |
| npm-зависимости | нет | — | — |
| Шрифты PT Serif, PT Sans | лицензия OFL | курс | нет |
| FFmpeg | 6.1.1 (сборка gyan.dev essentials) | сборка видео, громкость −16 LUFS, постер | нет |
| Python | 3.12.4 (Anaconda): numpy 1.26.4, matplotlib 3.8.4, pydantic 2.11.7 | движок кадров роликов | нет |

## Запуск

Одна команда на главу:

```
node pipeline/run.mjs <глава.md|глава.pdf> [--pages 90-108] [--page-start N] [--id имя]
```

Ролик к шагу: `node pipeline/video.mjs layer/<глава> <id шага> [--format 9:16|16:9]`. Модуль проверки: `node pipeline/review.mjs <package.json>`.

Сервер API для фронтенда: `node pipeline/server.mjs` (контракт — `pipeline/API.md`). Пересборка курса после правки слоя: `node build/build.mjs layer/<глава>`.

Учёт: токены и деньги по этапам — `logs/metrics.csv` (пишет конвейер). Ручные правки — `logs/manual_edits.csv` (ведёт команда). Отчёт каждого прогона — `work/jobs/<id>/report.json`.
