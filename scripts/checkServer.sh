#!/bin/bash

# Скрипт для проверки статуса сервера
# Использование: ./scripts/checkServer.sh

echo "🔍 Проверка статуса сервера stud.kg..."
echo ""

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка PM2
echo "1. Проверка PM2..."
if command -v pm2 &> /dev/null; then
    pm2 status
    echo ""
    
    # Проверка, запущено ли приложение
    if pm2 list | grep -q "stud-kg"; then
        echo -e "${GREEN}✓ Приложение stud-kg найдено в PM2${NC}"
        pm2 info stud-kg | grep -E "status|uptime|restarts"
    else
        echo -e "${RED}✗ Приложение stud-kg не найдено в PM2${NC}"
        echo "Запустите: pm2 start server.js --name stud-kg"
    fi
else
    echo -e "${RED}✗ PM2 не установлен${NC}"
fi

echo ""
echo "2. Проверка логов приложения..."
if pm2 list | grep -q "stud-kg"; then
    echo "Последние 20 строк логов:"
    pm2 logs stud-kg --lines 20 --nostream
else
    echo -e "${YELLOW}⚠️  Приложение не запущено, логи недоступны${NC}"
fi

echo ""
echo "3. Проверка порта 3000..."
if command -v netstat &> /dev/null; then
    if netstat -tuln | grep -q ":3000"; then
        echo -e "${GREEN}✓ Порт 3000 прослушивается${NC}"
        netstat -tuln | grep ":3000"
    else
        echo -e "${RED}✗ Порт 3000 не прослушивается${NC}"
    fi
elif command -v ss &> /dev/null; then
    if ss -tuln | grep -q ":3000"; then
        echo -e "${GREEN}✓ Порт 3000 прослушивается${NC}"
        ss -tuln | grep ":3000"
    else
        echo -e "${RED}✗ Порт 3000 не прослушивается${NC}"
    fi
fi

echo ""
echo "4. Проверка .env файла..."
if [ -f .env ]; then
    echo -e "${GREEN}✓ .env файл существует${NC}"
    if grep -q "DB_PASSWORD" .env && ! grep -q "your_password" .env; then
        echo -e "${GREEN}✓ Пароль БД настроен${NC}"
    else
        echo -e "${YELLOW}⚠️  Проверьте настройки БД в .env${NC}"
    fi
else
    echo -e "${RED}✗ .env файл не найден${NC}"
fi

echo ""
echo "5. Проверка подключения к базе данных..."
if [ -f .env ]; then
    source .env
    if command -v psql &> /dev/null; then
        PGPASSWORD=$DB_PASSWORD psql -h ${DB_HOST:-localhost} -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Подключение к БД успешно${NC}"
        else
            echo -e "${RED}✗ Ошибка подключения к БД${NC}"
        fi
    fi
fi

echo ""
echo "6. Проверка Nginx..."
if command -v nginx &> /dev/null; then
    if systemctl is-active --quiet nginx; then
        echo -e "${GREEN}✓ Nginx запущен${NC}"
        echo "Проверка конфигурации:"
        sudo nginx -t 2>&1 | tail -1
    else
        echo -e "${RED}✗ Nginx не запущен${NC}"
        echo "Запустите: sudo systemctl start nginx"
    fi
else
    echo -e "${YELLOW}⚠️  Nginx не установлен${NC}"
fi

echo ""
echo "✅ Проверка завершена"

