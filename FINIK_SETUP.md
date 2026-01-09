# Настройка Finik Payments

## Шаг 1: Генерация ключей

Перед началом работы необходимо сгенерировать приватный и публичный ключи:

```bash
# Генерация приватного ключа
openssl genrsa -out finik_private.pem 2048

# Генерация публичного ключа
openssl rsa -in finik_private.pem -pubout > finik_public.pem
```

**Важно:**
- Приватный ключ (`finik_private.pem`) должен храниться в секрете
- Публичный ключ (`finik_public.pem`) нужно отправить представителям Finik

## Шаг 2: Получение учетных данных

Свяжитесь с представителями Finik для получения:
- **API Key** - ключ API для авторизации
- **Account ID** - идентификатор вашего корпоративного счета
- **Merchant Category Code (MCC)** - код категории мерчанта (по умолчанию: 0742)

## Шаг 3: Размещение ключей

После генерации ключей разместите их в корне проекта:

```bash
# Ключи должны быть в корне проекта
/path/to/stud_beta/
├── finik_private.pem    # Приватный ключ (НЕ коммитить в Git!)
├── finik_public.pem     # Публичный ключ (можно коммитить)
└── ...
```

**Важно:** 
- Файл `finik_private.pem` уже добавлен в `.gitignore` (не будет закоммичен)
- Файл `finik_public.pem` можно закоммитить (он публичный)

## Шаг 4: Настройка переменных окружения

Отредактируйте файл `.env` и добавьте следующие переменные:

```env
# Finik Payments Configuration
FINIK_ENV=beta                                    # beta или prod
FINIK_API_KEY=your_api_key_from_finik            # Получен от Finik
# Приватный ключ читается из файла finik_private.pem (в корне проекта)
# Или можно указать здесь (опционально):
# FINIK_PRIVATE_KEY_PEM=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
FINIK_ACCOUNT_ID=your_account_id                 # Получен от Finik
FINIK_MERCHANT_CATEGORY_CODE=0742                # Код категории
FINIK_NAME_EN=stud.kg Payment                    # Название QR кода (англ.)
FINIK_WEBHOOK_URL=https://your-domain.com/api/payments/webhook
FINIK_REDIRECT_URL=https://your-domain.com/payment/success
```

**Приоритет загрузки ключей:**
1. Сначала код пытается прочитать `finik_private.pem` из корня проекта
2. Если файл не найден, используется переменная `FINIK_PRIVATE_KEY_PEM` из `.env`
3. Если ни то, ни другое не найдено - ошибка

## Шаг 5: Установка зависимостей

```bash
npm install
```

Это установит необходимые пакеты:
- `@mancho.devs/authorizer` - официальный пакет Finik для генерации подписи
- `uuid` - для генерации уникальных PaymentId
- `node-fetch` - для HTTP запросов (если Node.js < 18)

## Шаг 6: Настройка Webhook URL

1. Убедитесь, что ваш сервер доступен из интернета
2. Для локальной разработки используйте ngrok:
   ```bash
   ngrok http 3000
   ```
3. Скопируйте HTTPS URL (например: `https://abc123.ngrok.io`)
4. Укажите в `.env`:
   ```env
   FINIK_WEBHOOK_URL=https://abc123.ngrok.io/api/payments/webhook
   FINIK_REDIRECT_URL=https://abc123.ngrok.io/payment/success
   ```
5. В продакшене используйте ваш реальный домен

## Шаг 7: Отправка публичного ключа в Finik

Отправьте содержимое файла `finik_public.pem` представителям Finik через безопасный канал (email Finik).

## Шаг 8: Тестирование

1. Запустите сервер:
   ```bash
   npm start
   ```

2. Откройте тестовую страницу оплаты:
   ```
   http://localhost:3000/payment
   ```

3. Войдите в систему и создайте тестовый платеж

4. Проверьте логи сервера на наличие webhook'ов от Finik

## Проверка конфигурации

Убедитесь, что все переменные окружения установлены:

```bash
# Проверка переменных
node -e "require('dotenv').config(); console.log('FINIK_ENV:', process.env.FINIK_ENV); console.log('FINIK_API_KEY:', process.env.FINIK_API_KEY ? 'SET' : 'NOT SET');"
```

## Окружения

### Beta (тестовое)
- URL: `https://beta.api.acquiring.averspay.kg`
- Используйте для разработки и тестирования

### Production (продакшен)
- URL: `https://api.acquiring.averspay.kg`
- Используйте для реальных платежей

## Безопасность

⚠️ **Важные рекомендации:**

1. **Приватный ключ защищен**
   - Файл `finik_private.pem` уже добавлен в `.gitignore` (не будет закоммичен)
   - Файл `*.pem` автоматически игнорируется Git'ом

2. **Храните ключи в безопасном месте**
   - На сервере ограничьте права доступа: `chmod 600 finik_private.pem`
   - Используйте секретные менеджеры в продакшене (если нужно)
   - Не передавайте приватный ключ по незащищенным каналам

3. **Регулярно проверяйте логи**
   - Мониторьте все транзакции
   - Проверяйте валидность подписей

## Решение проблем

### Ошибка: "FINIK_API_KEY is not set"
- Проверьте, что переменная установлена в `.env`
- Убедитесь, что `.env` загружается (используется `dotenv`)

### Ошибка: "Failed to generate signature" или "Приватный ключ не найден"
- Убедитесь, что файл `finik_private.pem` существует в корне проекта
- Проверьте права доступа к файлу (должен быть читаемым)
- Или установите переменную `FINIK_PRIVATE_KEY_PEM` в `.env`
- Проверьте формат ключа (должен начинаться с `-----BEGIN PRIVATE KEY-----`)

### Ошибка: "Invalid signature" от Finik API
- Убедитесь, что публичный ключ отправлен в Finik
- Проверьте, что используется правильное окружение (beta/prod)
- Проверьте логи для отладки канонической строки

### Webhook не приходит
- Убедитесь, что URL доступен из интернета
- Проверьте настройки файрвола
- Используйте ngrok для локальной разработки

## Дополнительная информация

- Документация Finik: [ссылка на документацию]
- Тестовая страница: `/payment`
- Webhook endpoint: `/api/payments/webhook`
- Страница успеха: `/payment/success`

