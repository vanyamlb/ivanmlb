#!/bin/bash

# Остановка Apsny Camera Recorder сервера

echo "🛑 Остановка Apsny Camera Recorder..."

# Получить директорию скрипта
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Проверяем файл с PID
if [ -f ".server.pid" ]; then
    PID=$(cat .server.pid)

    if ps -p $PID > /dev/null 2>&1; then
        echo "Останавливаем процесс $PID..."
        kill $PID 2>/dev/null
        sleep 1

        # Проверяем, остановился ли процесс
        if ps -p $PID > /dev/null 2>&1; then
            echo "Принудительная остановка..."
            kill -9 $PID 2>/dev/null
        fi

        echo "✅ Сервер остановлен"
    else
        echo "⚠️  Процесс $PID уже не запущен"
    fi

    rm -f .server.pid
else
    echo "⚠️  Файл .server.pid не найден"
fi

# Дополнительно убиваем все процессы node server.js на порту 3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Останавливаем процесс на порту 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    echo "✅ Порт 3000 освобождён"
fi

echo "✅ Готово!"
