#!/bin/bash

# Apsny Camera Recorder - Auto Launcher
# Запуск одной командой!

clear

echo "╔════════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║     📹 Apsny Camera Recorder - Auto Launch            ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Получить директорию скрипта
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Проверка Node.js
echo "🔍 Проверка Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js не найден!${NC}"
    echo ""
    echo "Установите Node.js с https://nodejs.org"
    echo "Минимальная версия: 16.0.0"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js установлен: $NODE_VERSION${NC}"
echo ""

# 2. Проверка npm
echo "🔍 Проверка npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm не найден!${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm установлен: $NPM_VERSION${NC}"
echo ""

# 3. Проверка и установка зависимостей
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей (первый запуск)..."
    echo "Это может занять 1-2 минуты..."
    echo ""

    PUPPETEER_SKIP_DOWNLOAD=true npm install --silent

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Зависимости установлены успешно!${NC}"
    else
        echo -e "${RED}❌ Ошибка установки зависимостей${NC}"
        exit 1
    fi
    echo ""
else
    echo -e "${GREEN}✅ Зависимости уже установлены${NC}"
    echo ""
fi

# 4. Проверка, не занят ли порт 3000
echo "🔍 Проверка порта 3000..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Порт 3000 уже занят${NC}"
    echo "Останавливаем предыдущий процесс..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 1
fi
echo -e "${GREEN}✅ Порт 3000 свободен${NC}"
echo ""

# 5. Запуск сервера в фоне
echo "🚀 Запуск backend сервера..."
node server.js > /dev/null 2>&1 &
SERVER_PID=$!

# Сохраняем PID для остановки
echo $SERVER_PID > .server.pid

# Ждём запуска сервера
echo "⏳ Ожидание запуска сервера..."
sleep 2

# Проверка, что сервер запустился
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Сервер не запустился${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Сервер запущен (PID: $SERVER_PID)${NC}"
echo ""

# 6. Автоматическое открытие браузера
echo "🌐 Открываем браузер..."
URL="http://localhost:3000"

# Определяем ОС и открываем браузер
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL"
    elif command -v gnome-open &> /dev/null; then
        gnome-open "$URL"
    else
        echo -e "${YELLOW}⚠️  Не удалось автоматически открыть браузер${NC}"
        echo "Откройте вручную: $URL"
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash / Cygwin)
    start "$URL"
else
    echo -e "${YELLOW}⚠️  Не удалось автоматически открыть браузер${NC}"
    echo "Откройте вручную: $URL"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║  ✅ ВСЁ ГОТОВО! Приложение запущено!                  ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📱 URL: $URL"
echo "🔧 PID сервера: $SERVER_PID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 КАК ИСПОЛЬЗОВАТЬ:"
echo ""
echo "   1. В браузере вставьте ссылку на камеру:"
echo "      https://apsny.camera/?sukhum_chegem"
echo ""
echo "   2. Нажмите 'Загрузить поток' 🎥"
echo ""
echo "   3. Backend автоматически получит всё необходимое!"
echo ""
echo "   4. Начните запись ⏺"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🛑 Для остановки сервера нажмите Ctrl+C"
echo "   или выполните: kill $SERVER_PID"
echo ""
echo "📝 Логи сервера сохраняются в: server.log"
echo ""

# Создаём файл с логами
node server.js >> server.log 2>&1 &
NEW_SERVER_PID=$!
echo $NEW_SERVER_PID > .server.pid

# Убиваем старый процесс
kill $SERVER_PID 2>/dev/null

# Trap для остановки сервера при выходе
trap "echo ''; echo '🛑 Остановка сервера...'; kill $NEW_SERVER_PID 2>/dev/null; rm -f .server.pid; echo '✅ Сервер остановлен'; exit 0" EXIT INT TERM

# Держим скрипт запущенным и показываем логи
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ЛОГИ СЕРВЕРА (Ctrl+C для выхода):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

tail -f server.log
