# Схемы организаторов

Копия папки `пакет_вводных/01_схемы` из пакета вводных хакатона. Файлы не править: это общий формат всех команд.

| Файл | Что описывает | Что из него собирает конвейер |
| --- | --- | --- |
| `node.schema.json` | Учебный слой главы | `export/<глава>/layer.json` |
| `coverage.schema.json` | Таблица покрытия «единица главы → узел или причина» | `export/<глава>/coverage.json` |
| `routing.schema.json` | Маршрутизация форматов | этап 4 |
| `task.schema.json` | Задания курса | этап 4 |
| `illustration.schema.json` | Иллюстрации курса | этап 4 |
| `passport.schema.json` | Паспорт ролика | этап 6 |
| `example_layer.json` | Пример слоя из одного узла | — |

Сборщик проверяет экспорт по этим схемам своим валидатором (`build/lib/jsonschema.mjs`, без внешних зависимостей). Ту же проверку можно повторить инструментом организаторов:

```
pip install jsonschema
python -c "import json,jsonschema; jsonschema.validate(json.load(open('export/latyshova-v/layer.json',encoding='utf-8')), json.load(open('schemas/node.schema.json',encoding='utf-8'))); print('ok')"
```
