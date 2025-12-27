#!/bin/bash

# Скрипт для настройки PostgreSQL пользователя и базы данных
# Использование: ./scripts/setupPostgres.sh

set -e

echo "🔧 Настройка PostgreSQL для stud.kg..."

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Запрашиваем данные
read -p "Введите имя пользователя PostgreSQL (по умолчанию: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "Введите пароль для пользователя $DB_USER: " DB_PASSWORD
echo ""

read -p "Введите имя базы данных (по умолчанию: stud_kg): " DB_NAME
DB_NAME=${DB_NAME:-stud_kg}

read -p "Введите хост (по умолчанию: localhost): " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Введите порт (по умолчанию: 5432): " DB_PORT
DB_PORT=${DB_PORT:-5432}

echo ""
echo -e "${YELLOW}Настройка PostgreSQL...${NC}"

# Проверяем, существует ли пользователь
USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null || echo "0")

if [ "$USER_EXISTS" = "1" ]; then
    echo -e "${YELLOW}Пользователь $DB_USER уже существует.${NC}"
    read -p "Изменить пароль? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
        echo -e "${GREEN}✓ Пароль изменен${NC}"
    fi
else
    echo -e "${YELLOW}Создание пользователя $DB_USER...${NC}"
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    echo -e "${GREEN}✓ Пользователь создан${NC}"
fi

# Проверяем, существует ли база данных
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    echo -e "${YELLOW}База данных $DB_NAME уже существует.${NC}"
else
    echo -e "${YELLOW}Создание базы данных $DB_NAME...${NC}"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    echo -e "${GREEN}✓ База данных создана${NC}"
fi

# Даем права пользователю
echo -e "${YELLOW}Настройка прав доступа...${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo -e "${GREEN}✓ Права настроены${NC}"

# Тестируем подключение
echo ""
echo -e "${YELLOW}Тестирование подключения...${NC}"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Подключение успешно!${NC}"
else
    echo -e "${RED}✗ Ошибка подключения. Проверьте настройки.${NC}"
    exit 1
fi

# Обновляем .env файл
echo ""
echo -e "${YELLOW}Обновление .env файла...${NC}"

if [ -f .env ]; then
    # Обновляем существующий .env
    sed -i "s/^DB_USER=.*/DB_USER=$DB_USER/" .env
    sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    sed -i "s/^DB_NAME=.*/DB_NAME=$DB_NAME/" .env
    sed -i "s/^DB_HOST=.*/DB_HOST=$DB_HOST/" .env
    sed -i "s/^DB_PORT=.*/DB_PORT=$DB_PORT/" .env
    echo -e "${GREEN}✓ .env файл обновлен${NC}"
else
    # Создаем новый .env
    cat > .env << EOF
PORT=3000
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
EOF
    echo -e "${GREEN}✓ .env файл создан${NC}"
fi

echo ""
echo -e "${GREEN}✅ Настройка PostgreSQL завершена!${NC}"
echo ""
echo "Данные для подключения:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""
echo "Теперь можно запустить: npm run init-db"

