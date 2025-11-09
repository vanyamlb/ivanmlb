@echo off
REM Apsny Camera Recorder - Auto Launcher for Windows
REM Запуск одной командой!

chcp 65001 >nul
cls

echo ╔════════════════════════════════════════════════════════╗
echo ║                                                        ║
echo ║     📹 Apsny Camera Recorder - Auto Launch            ║
echo ║                                                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Переходим в директорию скрипта
cd /d "%~dp0"

REM 1. Проверка Node.js
echo 🔍 Проверка Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js не найден!
    echo.
    echo Установите Node.js с https://nodejs.org
    echo Минимальная версия: 16.0.0
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js установлен: %NODE_VERSION%
echo.

REM 2. Проверка npm
echo 🔍 Проверка npm...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm не найден!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm установлен: %NPM_VERSION%
echo.

REM 3. Проверка и установка зависимостей
if not exist "node_modules" (
    echo 📦 Установка зависимостей (первый запуск^)...
    echo Это может занять 1-2 минуты...
    echo.

    set PUPPETEER_SKIP_DOWNLOAD=true
    call npm install --silent

    if %ERRORLEVEL% EQU 0 (
        echo ✅ Зависимости установлены успешно!
    ) else (
        echo ❌ Ошибка установки зависимостей
        pause
        exit /b 1
    )
    echo.
) else (
    echo ✅ Зависимости уже установлены
    echo.
)

REM 4. Проверка, не занят ли порт 3000
echo 🔍 Проверка порта 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ⚠️  Порт 3000 уже занят
    echo Останавливаем предыдущий процесс...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
)
echo ✅ Порт 3000 свободен
echo.

REM 5. Запуск сервера
echo 🚀 Запуск backend сервера...
start /B node server.js > server.log 2>&1

REM Сохраняем PID
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /NH') do (
    echo %%a > .server.pid
    set SERVER_PID=%%a
    goto :pid_found
)
:pid_found

echo ⏳ Ожидание запуска сервера...
timeout /t 3 /nobreak >nul

REM Проверка, что сервер запустился
curl -s http://localhost:3000/api/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Сервер не запустился
    taskkill /F /PID %SERVER_PID% >nul 2>&1
    pause
    exit /b 1
)

echo ✅ Сервер запущен (PID: %SERVER_PID%)
echo.

REM 6. Автоматическое открытие браузера
echo 🌐 Открываем браузер...
start http://localhost:3000

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║                                                        ║
echo ║  ✅ ВСЁ ГОТОВО! Приложение запущено!                  ║
echo ║                                                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo 📱 URL: http://localhost:3000
echo 🔧 PID сервера: %SERVER_PID%
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📖 КАК ИСПОЛЬЗОВАТЬ:
echo.
echo    1. В браузере вставьте ссылку на камеру:
echo       https://apsny.camera/?sukhum_chegem
echo.
echo    2. Нажмите 'Загрузить поток' 🎥
echo.
echo    3. Backend автоматически получит всё необходимое!
echo.
echo    4. Начните запись ⏺
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 🛑 Для остановки сервера закройте это окно
echo    или выполните: taskkill /F /PID %SERVER_PID%
echo.
echo 📝 Логи сервера: server.log
echo.
echo Нажмите любую клавишу для просмотра логов или Ctrl+C для выхода...
pause >nul

REM Показываем логи
type server.log
echo.
echo Нажмите любую клавишу для выхода...
pause >nul
