# День теста: что запускать и когда

Памятка по регламенту организаторов. Все команды запускаются из корня репозитория в PowerShell.

## Накануне (до 09:00)

1. **Модель для прогона.** Лучше всего Claude Code CLI (`--provider cli:claude --cli-model sonnet`): он работает сам, без чата и без ключа API, по подписке Claude. Проверка входа и вход:
   ```powershell
   node tools/claude-login.mjs status
   node tools/claude-login.mjs
   ```
   У тарифа Pro есть лимит использования на 5 часов: Sonnet расходует его медленнее Opus. Если лимит кончится посреди главы, перезапустите ту же команду с `--provider agent` (отвечает Claude в чате Claude Code: написать ему «ответь на очередь конвейера») или `--provider openai-compatible` (Gemini API, бесплатный тариф часто отвечает 429). Ответы кешируются по поставщику: смена поставщика задаёт вопросы заново.
2. Проверить озвучку: `node pipeline/lib/tts.mjs "Проверка голоса" test.wav`. У Gemini TTS 10 запросов в сутки, ролик тратит один запрос.
3. `git status` чистый, курсы обучающих глав собраны: `node build/build.mjs`.

## 09:00–09:45 — заморозка

```powershell
git add -A
git commit -m "Заморозка конвейера"
git tag -a freeze -m "Заморозка конвейера перед тестом"
git push origin main --tags
git rev-parse HEAD
```

Организаторам отправить ссылку `https://github.com/<владелец>/<репозиторий>/commit/<хеш из git rev-parse>` и пригласить их в приватный репозиторий (Settings → Collaborators). **После тега код, промпты (`pipeline/prompts/`) и доменный пакет `domain/geo` не меняются.** Меняются только результаты прогонов: `layer/`, `dist/`, `export/`, `logs/`, `cache/`, новый пакет `domain/<сдвиг>/`.

## 10:00–14:00 — прогон на тестовых главах

Главы выдают в `.md` с метками `<!-- page N -->` или в PDF. Четыре прогона можно запускать одновременно в четырёх окнах PowerShell.

### Три главы-двойника: слой, маршрутизация, демо-курс

```powershell
node pipeline/run.mjs "<глава>.md" --id twin1 --pages <с>-<по> --provider cli:claude --cli-model sonnet --author "<И. О. Фамилия>" --book "<Название>" --year <год>
```

- PDF: добавить `--page-start <номер книги для первой страницы файла>`.
- Глава на английском тоже идёт этой командой: курс получится по-русски, цитаты останутся на языке оригинала.
- Результат: `layer/twin1/` (учебный слой), `export/twin1/` (маршрутизация `routing.json`, покрытие, задания, иллюстрации), `dist/twin1/index.html` (демо-курс). Отчёт проверок — в конце вывода и в `dist/twin1/build-report.json`.

### Глава из другого домена (сдвиг): доменный пакет, время, слой

```powershell
node pipeline/domain.mjs "<глава>.md" --id drilling --pages <с>-<по> --hint "бурение" --provider cli:claude --cli-model sonnet
node pipeline/run.mjs "<глава>.md" --id shift --domain drilling --pages <с>-<по> --provider cli:claude --cli-model sonnet --author "…" --book "…" --year …
node tools/domain-collect.mjs --domain drilling
```

Время сборки пакета записывается само: `domain/drilling/README.md` (раздел «Время сборки пакета») и `domain/drilling/build.json`. Там же видно, какие шаблоны сцен движка подошли без изменений.

### Два ролика на объявленные темы

1. Найти шаг по теме: `Select-String -Path layer\twin1\nodes\*.json -Pattern "<ключевое слово>" -List`.
2. Собрать ролик (шортс 9:16 или разбор 16:9):
   ```powershell
   node pipeline/video.mjs layer/twin1 twin1.n05 --format 9:16
   node pipeline/video.mjs layer/twin2 twin2.n08 --format 16:9
   ```
   Кадры рендерятся 5–11 минут. Ролик, субтитры, постер и паспорт попадают в `layer/<глава>/assets/media/<шаг>/`, курс пересобирается сам. Если Gemini TTS упрётся в лимит, ролик целиком озвучит голос Windows; это записывается в паспорт.

### 13:15–14:00 — модуль проверки

```powershell
node pipeline/review.mjs "<тестовый пакет>.json" --chapter "<глава пакета>.md" --out work/review/test/answer.json --team "<команда>"
```

Ответ — `work/review/test/answer.json` в формате `review_output.schema.json`. Сдать этот файл; копия в репозитории — `work/review/`.

### До 14:00 — сдача

```powershell
node build/build.mjs
git add -A
git commit -m "Результаты теста: двойники, сдвиг, ролики, ответ модуля проверки"
git push origin main
```

- Журнал правок: каждую ручную правку слоя записать строкой в `logs/manual_edits.csv` (время, глава, файл, что изменено, минуты человека). Ответы модели правками не считаются.
- Метрики (токены, время, ролики) пишутся сами в `logs/metrics.csv`.

## 15:00 — защита (10 минут)

- **6 минут:** курсы двойников (`node pipeline/server.mjs --open` → «Готовые курсы»), ролики, что конвейер сделал сам: отчёт проверок, покрытие, паспорт ролика, доменный пакет сдвига со временем сборки.
- **1–2 минуты, пересборка.** Открыть `layer/<глава>/nodes/<шаг>.json`, поменять одно число (например, в блоке `numbers`), затем:
  ```powershell
  node build/build.mjs layer/<глава>
  ```
  Сборка идёт меньше секунды. Обновить страницу курса: число поменялось. **Не запускать `pipeline/rebuild.mjs`:** он заново рендерит ролики главы, это минуты.
- **2–3 минуты:** вопросы.
