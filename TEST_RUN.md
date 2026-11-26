# Прогон теста 26.11.2026: команды по главам

Главы организаторов обрезаны до нужных страниц и лежат в `books md/test_*.md` (метки `<!-- page N -->` сохранены, номера страниц те же, что в выданных файлах). Обрезка нужна потому, что `--pages` конвейера принимает один отрезок, а у трёх глав страницы с разрывами. Флаг `--pages` в командах ниже не нужен: в файле уже только нужные страницы.

Полные md книг (для модуля проверки в 13:15) остаются в архиве организаторов `тестовые_главы/books_md/`.

| Роль | Файл | Страницы по меткам md | id слоя |
| --- | --- | --- | --- |
| Двойник 1 | `books md/test_asquith.md` | 126–136, рисунки 140–146 | `test-asquith` |
| Двойник 2 | `books md/test_dake.md` | 75–79, 87–89 | `test-dake` |
| Двойник 3 | `books md/test_slatt.md` | 410–423 | `test-slatt` |
| Сдвиг (бурение) | `books md/test_basarygin.md` | 231–239, 312–318 | `test-basarygin` |

## 0. На машине с Node.js, один раз

```powershell
git pull
node tools/claude-login.mjs status
```

Если входа нет: `node tools/claude-login.mjs`. Все команды из корня репозитория, каждая глава в своём окне PowerShell.

## 1. Три двойника (параллельно, три окна)

```powershell
node pipeline/run.mjs "books md/test_asquith.md" --id test-asquith --provider cli:claude --cli-model sonnet --author "G. Asquith, D. Krygowski" --book "Basic Well Log Analysis" --year 2004 --chapter "Chapter 7. Log Interpretation"
```

```powershell
node pipeline/run.mjs "books md/test_dake.md" --id test-dake --provider cli:claude --cli-model sonnet --author "L. P. Dake" --book "Fundamentals of Reservoir Engineering" --year 1978 --chapter "Chapter 5. The Basic Differential Equation for Radial Flow in a Porous Medium; §7.3"
```

```powershell
node pipeline/run.mjs "books md/test_slatt.md" --id test-slatt --provider cli:claude --cli-model sonnet --author "R. M. Slatt" --book "Stratigraphic Reservoir Characterization for Petroleum Geologists, Geophysicists, and Engineers" --year 2013 --chapter "Chapter 9. Deltaic Deposits and Reservoirs, §9.3–9.4"
```

Результат каждой: `layer/<id>/`, `export/<id>/` (слой, покрытие, маршрутизация с `route.template`), `dist/<id>/index.html`, отчёт проверок в `dist/<id>/build-report.json`.

Если прогон упал или кончился лимит CLI: та же команда ещё раз, ответы берутся из `cache/llm/`, продолжение с места остановки. Запасной вариант: `--provider agent` (отвечает Claude в чате Claude Code по очереди `work/agent-queue/`).

## 2. Сдвиг: бурение (четвёртое окно, три команды по очереди)

```powershell
node pipeline/domain.mjs "books md/test_basarygin.md" --id drilling --hint "бурение скважин: осложнения, газонефтеводопроявления, ликвидация проявлений" --provider cli:claude --cli-model sonnet
```

```powershell
node pipeline/run.mjs "books md/test_basarygin.md" --id test-basarygin --domain drilling --provider cli:claude --cli-model sonnet --author "Ю. М. Басарыгин, А. И. Булатов, Ю. М. Проселков" --book "Осложнения и аварии при бурении нефтяных и газовых скважин" --year 2000 --chapter "§4.1.1 Признаки проявлений; §4.2.14 Ликвидация нефтегазопроявлений при бурении скважин"
```

```powershell
node tools/domain-collect.mjs --domain drilling
```

Время сборки пакета и отчёт о покрытии шаблонами пишутся сами: `domain/drilling/README.md` (разделы «Время сборки пакета» и шаблоны сцен) и `domain/drilling/build.json`.

## 3. Два ролика (как только готов соответствующий слой, не ждать остальных)

Кадры рендерятся 5–11 минут на ролик, запускать в двух окнах параллельно.

**Ролик 1, Slatt, разбор 16:9, 1,5–3 минуты.** Тема: рост речной дельты, распределительные каналы, устьевые бары, наступление дельты на море, огрубление вверх по разрезу (§9.4.1, стр. 411–416). Найти узел:

```powershell
Select-String -Path "layer\test-slatt\nodes\*.json" -Pattern "дельт|устьев|распределительн|наступ|грубе|coarsen" -List | Select-Object Filename
```

Выбрать узел со страницами 411–416 (поле `pages` в файле узла) и собрать:

```powershell
node pipeline/video.mjs layer/test-slatt test-slatt.nXX --format 16:9
```

**Ролик 2, Басарыгин, шортс 9:16, 40–75 секунд.** Тема: признаки газонефтеводопроявления, прежде всего рост объёма раствора в приёмной ёмкости, и закрытие скважины (§4.1.1 стр. 231–239, §4.2.14 стр. 314–315). Найти узел:

```powershell
Select-String -Path "layer\test-basarygin\nodes\*.json" -Pattern "приемн|приёмн|объем.*раствор|объём.*раствор|признак.*проявлен|закрыт" -List | Select-Object Filename
```

```powershell
node pipeline/video.mjs layer/test-basarygin test-basarygin.nXX --format 9:16
```

Шаблона сцены «скважина при проявлении» в движке нет; модель выберет из пяти имеющихся (скорее всего `pressure_wave_2d` или `formula_dynamic_plot`). Перед рендером спецификация проверяется автоматически. Если ролик по сдвигу не получится, в `domain/drilling/README.md` уже будет запись, каких шаблонов не хватает: это и есть ответ «нужен новый» из отчёта о покрытии.

Озвучка: цепочка `TTS_PROVIDER` из `.env`; при лимите Gemini ролик озвучит голос Windows, это записывается в паспорт `layer/<id>/assets/media/<шаг>/passport.json`.

## 4. 13:15, модуль проверки

Пакет организаторов (`package.json` с кадрами) и md главы, по которой он составлен. Главу брать полную из архива организаторов, не обрезанную:

```powershell
node pipeline/review.mjs "<путь>\package.json" --chapter "<путь>\books_md\test_<глава>.md" --out work/review/test/answer.json --team "Approchemmately" --provider cli:claude --cli-model sonnet
```

Сдать `work/review/test/answer.json`. Папка `work/review/` идёт в git.

## 5. До 14:00, сдача

Сначала коммит результатов прогона (ответы модели правками не считаются):

```powershell
node build/build.mjs
```

```powershell
git add -A
```

```powershell
git commit -m "Результаты теста: двойники Asquith, Dake, Slatt; сдвиг Басарыгин; ролики; ответ модуля проверки"
```

```powershell
git push origin main
```

Потом каждая ручная правка результата отдельно: строка в `logs/manual_edits.csv` (время ISO, глава, файл, что изменено, человеко-минуты, людей, номер прогона, причина) и свой коммит с пометкой `[manual]`. После правки слоя: `node build/build.mjs layer/<id>` и коммит. Журнал должен совпадать с историей коммитов.

Организаторам: ссылка на итоговый коммит.

## Что уже сделано на ноутбуке без Node (коммит 030e71c, не запушен до `git push`)

Из слоя `latyshova-v` убраны 9 сканов книги (ТЗ запрещает рисунки книги в курсе), запись в журнале. Курс не пересобран: после `git pull` на машине с Node выполнить `node build/build.mjs layer/latyshova-v` и закоммитить результат.
