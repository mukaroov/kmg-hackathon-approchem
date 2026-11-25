@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js 18 или новее: https://nodejs.org & pause & exit /b 1)
echo Запуск конвейера «Глава → курс». Страница загрузки откроется в браузере. Закройте это окно, чтобы остановить.
node pipeline\server.mjs --open
pause
