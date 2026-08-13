# stud.kg — мобильное приложение (Flutter)

Отдельное мобильное приложение для платформы [stud.kg](https://stud.kg).  
**Сайт не изменён** — весь код приложения лежит в папке `stud_mobile/`.

## Функциональность

Полная копия пользовательской части сайта с мобильным UI:

| Раздел | Экран |
|--------|--------|
| Главная | Статистика платформы, новые тесты |
| Тесты | Предметы → тесты → настройки → прохождение → результат |
| USMLE | Dashboard Step 1/2/3, конструктор тестов по тегам |
| Рейтинг | Лидерборд за месяц |
| Профиль | Статистика, стрики, история, реф. код |
| Избранное | Сохранённые вопросы |
| Подписки | Тарифы вуз / USMLE, промокод, монеты, оплата Finik |
| Чат | Поддержка |
| Обратная связь | Форма contact |
| Новости | Лента новостей |
| О нас | Описание платформы |
| Авторизация | Вход / регистрация с выбором университета |

## Требования

- [Flutter SDK](https://docs.flutter.dev/get-started/install) 3.16+
- Android Studio / Xcode (для эмуляторов и сборки)
- Работающий бэкенд stud.kg (локально или production)

## Первый запуск

### 1. Установить Flutter

Windows: скачайте Flutter SDK и добавьте в PATH.  
Проверка: `flutter doctor`

### 2. Сгенерировать платформенные папки

В этой папке уже есть `lib/` и `pubspec.yaml`. Если нет `android/` и `ios/`:

```bash
cd stud_mobile
flutter create . --project-name stud_mobile
flutter pub get
```

### 3. Запуск

**Production API (по умолчанию):**

```bash
flutter run
```

**Локальный сервер** (если бэкенд на `localhost:3000`):

```bash
# Android эмулятор
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000

# Физическое устройство в той же Wi‑Fi сети
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:3000
```

## Архитектура

```
stud_mobile/
├── lib/
│   ├── config/          # API URL
│   ├── core/            # API client, theme, widgets
│   ├── models/          # DTO
│   ├── services/        # HTTP-слой к /api/*
│   ├── providers/       # Riverpod state
│   ├── router/          # go_router навигация
│   └── screens/         # UI экраны
└── pubspec.yaml
```

## API

Приложение использует существующий REST API бэкенда без изменений:

- `/api/auth/*` — авторизация
- `/api/tests/*` — тесты, USMLE
- `/api/stats`, `/api/leaderboard` — статистика и рейтинг
- `/api/favorites` — избранное
- `/api/payments/*` — подписки
- `/api/chat/*` — чат
- и др.

## Сборка релиза

```bash
# Android APK
flutter build apk --release

# Android App Bundle (Google Play)
flutter build appbundle --release

# iOS (на macOS)
flutter build ios --release
```

## Дизайн

Мобильный Material 3 UI с нижней навигацией — отличается от веб-версии, но сохраняет бренд stud.kg (синий акцент `#2563EB`, тёмная тема).

## Оплата (Finik SDK)

На сайте оплата идёт через redirect URL Finik.
В мобильном приложении — через пакет [`finik_sdk`](https://pub.dev/packages/finik_sdk):

1. Клиент вызывает `POST /api/payments/mobile-prepare`
2. Открывается экран Finik SDK (APP / QR / VISA)
3. Webhook `POST /api/payments/webhook` активирует подписку

На сервере в `.env`: `FINIK_MOBILE_API_KEY` (или `FINIK_API_KEY`), `FINIK_ACCOUNT_ID`, `FINIK_WEBHOOK_URL`.
