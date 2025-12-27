#!/bin/bash

# Скрипт для настройки SSL сертификата через Let's Encrypt
# Использование: ./scripts/setupSSL.sh

set -e

echo "🔒 Настройка SSL для stud.kg..."

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка прав
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}✗ Запустите скрипт с правами sudo${NC}"
    exit 1
fi

# Запрашиваем домен
read -p "Введите домен (например: stud.kg): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}✗ Домен обязателен${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Настройка SSL для домена: $DOMAIN${NC}"

# Проверка установки Certbot
if ! command -v certbot &> /dev/null; then
    echo "Установка Certbot..."
    
    # Определяем ОС
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo -e "${RED}✗ Не удалось определить ОС${NC}"
        exit 1
    fi
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        yum install -y certbot python3-certbot-nginx
    else
        echo -e "${RED}✗ Неподдерживаемая ОС. Установите Certbot вручную.${NC}"
        exit 1
    fi
fi

# Проверка существования конфигурации Nginx
NGINX_CONFIG="/etc/nginx/sites-available/stud-kg"
if [ ! -f "$NGINX_CONFIG" ]; then
    echo -e "${YELLOW}Создание конфигурации Nginx...${NC}"
    
    # Создаем базовую конфигурацию
    cat > "$NGINX_CONFIG" << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Активируем конфигурацию
    if [ ! -f "/etc/nginx/sites-enabled/stud-kg" ]; then
        ln -s "$NGINX_CONFIG" /etc/nginx/sites-enabled/
    fi
    
    # Проверяем конфигурацию
    nginx -t
    
    # Перезагружаем Nginx
    systemctl reload nginx
fi

# Получение SSL сертификата
echo ""
echo -e "${YELLOW}Получение SSL сертификата от Let's Encrypt...${NC}"
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
    echo -e "${YELLOW}Интерактивный режим...${NC}"
    certbot --nginx -d $DOMAIN -d www.$DOMAIN
}

# Проверка конфигурации после Certbot
echo ""
echo "Проверка конфигурации Nginx..."
nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Конфигурация корректна${NC}"
    systemctl reload nginx
    echo -e "${GREEN}✓ Nginx перезагружен${NC}"
else
    echo -e "${RED}✗ Ошибка в конфигурации Nginx${NC}"
    exit 1
fi

# Настройка автообновления
echo ""
echo "Настройка автообновления сертификата..."
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet") | crontab -

echo ""
echo -e "${GREEN}✅ SSL настроен успешно!${NC}"
echo ""
echo "Ваш сайт теперь доступен по HTTPS:"
echo "  https://$DOMAIN"
echo "  https://www.$DOMAIN"
echo ""
echo "Сертификат будет автоматически обновляться каждый день."

