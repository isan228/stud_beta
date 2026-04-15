# Рабочая инструкция деплоя на VPS (Ubuntu)

Инструкция протестирована под стек проекта: `Node.js + Express + PostgreSQL + PM2 + Nginx`.
Ниже порядок, который обычно "встает с нуля" без скрытых шагов.

## 0) Что должно быть заранее

- VPS с Ubuntu 22.04/24.04
- Домен, который уже смотрит на IP сервера (A-запись)
- Доступ по SSH с sudo-правами

---

## 1) Подключение и базовые пакеты

```bash
ssh <user>@<server_ip>
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx postgresql postgresql-contrib ufw
```

Открой порты:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 2) Установка Node.js LTS и PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

sudo npm install -g pm2
pm2 -v
```

---

## 3) Клонирование проекта

```bash
cd /var/www
sudo mkdir -p stud_beta
sudo chown -R $USER:$USER /var/www/stud_beta
git clone <URL_твоего_репозитория> /var/www/stud_beta
cd /var/www/stud_beta
```

---

## 4) Настройка PostgreSQL (БД + пользователь)

```bash
sudo -u postgres psql
```

Внутри `psql`:

```sql
CREATE DATABASE stud_kg;
CREATE USER stud_user WITH PASSWORD 'StrongPasswordHere';
GRANT ALL PRIVILEGES ON DATABASE stud_kg TO stud_user;
\c stud_kg
GRANT ALL ON SCHEMA public TO stud_user;
\q
```

Проверь подключение:

```bash
PGPASSWORD='StrongPasswordHere' psql -h 127.0.0.1 -U stud_user -d stud_kg -c "SELECT 1;"
```

---

## 5) `.env` (критичный шаг)

В этом проекте шаблон называется **`env.example`** (без точки в начале).

```bash
cd /var/www/stud_beta
cp env.example .env
nano .env
```

Минимум для запуска:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=stud_kg
DB_USER=stud_user
DB_PASSWORD=StrongPasswordHere
JWT_SECRET=long_random_secret_64_chars_minimum
NODE_ENV=production

FINIK_ENV=prod
FINIK_API_KEY=your_api_key_from_finik
FINIK_ACCOUNT_ID=your_account_id
FINIK_MERCHANT_CATEGORY_CODE=0742
FINIK_NAME_EN=stud.kg Payment
FINIK_WEBHOOK_URL=https://your-domain.com/api/payments/webhook
FINIK_REDIRECT_URL=https://your-domain.com/payment/success
```

Если платежи пока не настраиваешь, оставь `FINIK_*`, но эндпоинты оплаты будут возвращать ошибки конфигурации.

---

## 6) Установка зависимостей и инициализация БД

```bash
cd /var/www/stud_beta
npm install --production
npm run init-db
```

Создай админа:

```bash
npm run create-admin
```

---

## 7) Запуск через PM2

```bash
cd /var/www/stud_beta
pm2 start server.js --name stud-kg
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

Команду, которую выведет `pm2 startup`, выполни один раз через `sudo`.

Проверка:

```bash
pm2 status
pm2 logs stud-kg --lines 100 --nostream
curl -I http://127.0.0.1:3000
```

---

## 8) Nginx reverse proxy

```bash
sudo nano /etc/nginx/sites-available/stud-kg
```

Вставь:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активируй сайт:

```bash
sudo ln -sf /etc/nginx/sites-available/stud-kg /etc/nginx/sites-enabled/stud-kg
sudo nginx -t
sudo systemctl restart nginx
```

---

## 9) SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo certbot renew --dry-run
```

После этого сайт должен открываться по `https://`.

---

## 10) Как обновлять проект без простоя

```bash
cd /var/www/stud_beta
git pull origin main
npm install --production
pm2 restart stud-kg
pm2 logs stud-kg --lines 100 --nostream
```

---

## Быстрая диагностика, если "не работает"

1. Приложение живо?
```bash
pm2 status
pm2 logs stud-kg --lines 200 --nostream
```

2. Node слушает порт?
```bash
ss -tulpen | grep 3000
curl -I http://127.0.0.1:3000
```

3. Nginx корректен?
```bash
sudo nginx -t
sudo systemctl status nginx --no-pager -l
```

4. БД доступна?
```bash
sudo systemctl status postgresql --no-pager -l
PGPASSWORD='<db_password>' psql -h 127.0.0.1 -U <db_user> -d stud_kg -c "SELECT NOW();"
```

5. DNS/SSL в порядке?
```bash
dig +short your-domain.com
sudo certbot certificates
```

---

## Частые причины падения именно у этого проекта

- Неправильный файл шаблона env (`env.example`, не `.env.example`)
- Неверные `DB_*` в `.env`
- Не выполнен `npm run init-db`
- PM2 запущен, но не перезапущен после `git pull`
- `FINIK_ACCOUNT_ID`/другие `FINIK_*` не заполнены, а тестируешь оплату
- Домен не указывает на сервер, поэтому Certbot не выпускает сертификат

