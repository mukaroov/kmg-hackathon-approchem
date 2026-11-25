#!/bin/sh
# Запуск конвейера «Глава → курс»: сервер загрузки глав, страница откроется в браузере. Ctrl+C — остановить.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Нужен Node.js 18 или новее: https://nodejs.org"; exit 1; }
exec node pipeline/server.mjs --open "$@"
