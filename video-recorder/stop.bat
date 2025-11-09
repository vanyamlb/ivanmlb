@echo off
REM Остановка Apsny Camera Recorder сервера

chcp 65001 >nul

echo 🛑 Остановка Apsny Camera Recorder...

cd /d "%~dp0"

REM Проверяем файл с PID
if exist ".server.pid" (
    set /p PID=<.server.pid
    echo Останавливаем процесс !PID!...
    taskkill /F /PID !PID! >nul 2>&1
    del .server.pid
    echo ✅ Сервер остановлен
) else (
    echo ⚠️  Файл .server.pid не найден
)

REM Дополнительно убиваем все процессы на порту 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Останавливаем процесс на порту 3000 (PID: %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)

echo ✅ Готово!
pause
