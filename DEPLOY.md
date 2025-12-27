# Инструкция по деплою stud.kg на сервер

## Требования

- Node.js (версия 16 или выше)
- PostgreSQL (версия 12 или выше)
- PM2 (для управления процессом)
- Nginx (опционально, для reverse proxy)

## Шаги деплоя

### 1. Подключение к серверу

```bash
ssh user@your-server-ip
```

### 2. Установка зависимостей

```bash
# Перейдите в директорию проекта
cd /path/to/stud_beta

# Установите зависимости
npm install --production
```

### 3. Настройка переменных окружения

```bash
# Создайте файл .env на основе env.example
cp env.example .env

# Отредактируйте .env файл
nano .env
```

Заполните следующие переменные:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stud_kg
DB_USER=your_db_user
DB_PASSWORD=your_db_password
JWT_SECRET=your_very_secure_jwt_secret_key_here
PORT=3000
NODE_ENV=production
```

**Важно:** 
- `JWT_SECRET` должен быть длинным случайным строковым значением
- `DB_PASSWORD` должен быть надежным паролем

### 4. Настройка базы данных PostgreSQL

```bash
# Войдите в PostgreSQL
sudo -u postgres psql

# Создайте базу данных
CREATE DATABASE stud_kg;

# Создайте пользователя
CREATE USER your_db_user WITH PASSWORD 'your_db_password';

# Дайте права пользователю
GRANT ALL PRIVILEGES ON DATABASE stud_kg TO your_db_user;

# Выйдите из PostgreSQL
\q
```

### 5. Инициализация базы данных

```bash
# Запустите скрипт инициализации
npm run init-db
```

### 6. Создание администратора

```bash
# Создайте первого администратора
npm run create-admin

# Или с кастомными данными
npm run create-admin admin admin@stud.kg secure_password_123
```

### 7. Установка PM2 (процесс-менеджер)

```bash
# Установите PM2 глобально
npm install -g pm2

# Запустите приложение через PM2
pm2 start server.js --name stud-kg

# Сохраните конфигурацию PM2
pm2 save

# Настройте автозапуск при перезагрузке сервера
pm2 startup
```

### 8. Настройка Nginx (опционально, но рекомендуется)

Создайте конфигурационный файл Nginx:

```bash
sudo nano /etc/nginx/sites-available/stud-kg
```

Добавьте следующую конфигурацию:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активируйте конфигурацию:

```bash
# Создайте символическую ссылку
sudo ln -s /etc/nginx/sites-available/stud-kg /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезагрузите Nginx
sudo systemctl reload nginx
```

### 9. Настройка SSL с Let's Encrypt (опционально, но рекомендуется)

```bash
# Установите Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Получите SSL сертификат
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot автоматически обновит конфигурацию Nginx
```

### 10. Настройка файрвола

```bash
# Разрешите HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Если используете прямое подключение к Node.js (без Nginx)
sudo ufw allow 3000/tcp
```

## Полезные команды PM2

```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs stud-kg

# Перезапуск приложения
pm2 restart stud-kg

# Остановка приложения
pm2 stop stud-kg

# Удаление из PM2
pm2 delete stud-kg

# Мониторинг
pm2 monit
```

## Обновление приложения

```bash
# Перейдите в директорию проекта
cd /path/to/stud_beta

# Получите последние изменения из Git
git pull origin main

# Установите новые зависимости (если есть)
npm install --production

# Перезапустите приложение
pm2 restart stud-kg
```

## Проверка работы

1. Откройте браузер и перейдите на `http://your-server-ip:3000` или `http://your-domain.com`
2. Проверьте регистрацию и вход
3. Проверьте админ-панель: `http://your-domain.com/admin`

## Решение проблем

### Приложение не запускается

```bash
# Проверьте логи
pm2 logs stud-kg

# Проверьте, что база данных запущена
sudo systemctl status postgresql

# Проверьте переменные окружения
cat .env
```

### Ошибки подключения к базе данных

- Убедитесь, что PostgreSQL запущен: `sudo systemctl status postgresql`
- Проверьте правильность данных в `.env`
- Убедитесь, что пользователь БД имеет права доступа

### Порт уже занят

```bash
# Проверьте, что использует порт 3000
sudo lsof -i :3000

# Или измените PORT в .env файле
```

## Безопасность

1. **Никогда не коммитьте `.env` файл в Git**
2. **Используйте сильные пароли для базы данных и JWT_SECRET**
3. **Настройте файрвол для ограничения доступа**
4. **Используйте HTTPS для защиты данных**
5. **Регулярно обновляйте зависимости**: `npm audit fix`

## Резервное копирование

Рекомендуется настроить автоматическое резервное копирование базы данных:

```bash
# Создайте скрипт резервного копирования
nano /path/to/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U your_db_user stud_kg > "$BACKUP_DIR/stud_kg_$DATE.sql"
```

```bash
# Сделайте скрипт исполняемым
chmod +x /path/to/backup.sh

# Добавьте в crontab для автоматического резервного копирования
crontab -e
# Добавьте строку (каждый день в 2:00)
0 2 * * * /path/to/backup.sh
```

