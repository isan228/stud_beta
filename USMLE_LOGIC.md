# USMLE — полная логика (stud.kg / stud_beta)

Документ для воссоздания похожего продукта. Здесь собрана **вся** USMLE-логика: БД, доступ, API, админка, фронт, форматы TXT, подписка, flashcards, глоссарий.

Пути относительно корня репозитория `stud_beta/`.

---

## 0. Идея продукта одной фразой

**Отдельный платный раздел USMLE** (Step 1/2/3), независимый от подписки на университетские тесты. Банки вопросов → конструктор теста по тегам Subject/System → прохождение → flashcards → история. Контент ведёт админка (предметы, тесты, TXT-загрузки, теги, карточки, глоссарий, тарифы).

---

## 1. Главное разделение: University vs USMLE

| Сигнал | University | USMLE |
|--------|------------|-------|
| `programType` | `'university'` | `'usmle'` |
| `universityId` на Subject / Test / Plan / Flashcard | ID вуза | **`null`** |
| Subject.`stepGroup` | `null` | `'step1'` \| `'step2'` \| `'step3'` |
| SubscriptionPlan.`planScope` | `'uni:{universityId}'` | **`'usmle'`** |
| Поле даты у User | `subscriptionEndDate` | **`usmleSubscriptionEndDate`** |
| Тип платежа | `subscription` | **`usmle_subscription`** |
| API-префикс контента | `/api/tests/subjects?...` | **`/api/tests/usmle/*`** |
| Теги Subject/System | не основной путь | **`QuestionTag` + maps** |

Правило: **USMLE-контент никогда не привязан к вузу** (`universityId = null`). Подписка USMLE общая на весь раздел, не на конкретный банк.

---

## 2. Модели (БД)

### 2.1 Subject — «банк» / предмет USMLE
Файл: `models/Subject.js`

- `name`, `description`
- `programType`: `'usmle'`
- `universityId`: `null`
- `stepGroup`: `step1|step2|step3` — на каком Step показывать банк в dashboard

Один Subject USMLE ≈ один **банк** (UWorld-like “test bank” в UI).

### 2.2 Test — набор вопросов внутри банка
Файл: `models/Test.js`

- `subjectId` → Subject
- `programType: 'usmle'`, `universityId: null`
- `isFree` — для USMLE **не открывает доступ без подписки** (в отличие от uni)
- `hasExplanations` — есть ли поле E у вопросов

### 2.3 Question / Answer
Общие модели. USMLE-специфика:

- `explanation`, `explanationImageUrl`
- теги через `QuestionTagMap`
- **связанные вопросы (linked)**: в `Question.text` хранятся маркеры  
  `<<<USMLE_GROUP>>>` / `QUESTION` / `VIGNETTE` (см. `utils/usmleLinkedQuestions.js`)

### 2.4 QuestionTag — каталог Subject / System
Файл: `models/QuestionTag.js`

- `name`, `slug` (unique), `isActive`
- Канонический список: `utils/usmleTagCatalog.js` (`USMLE_SUBJECTS`, `USMLE_SYSTEMS`)
- Сидинг при старте: `utils/ensureUsmleTagsSeeded.js`
- Нормализация / слияние дублей: `utils/usmleTagNormalize.js`

Связи:
- Question ↔ Tag: `QuestionTagMap`
- Flashcard ↔ Tag: `FlashcardTagMap` (тот же каталог тегов)

### 2.5 Flashcard (USMLE)
Файл: `models/Flashcard.js`

Ключевые поля для USMLE:
- `programType: 'usmle'`
- `universityId: null`, `topicId: null` (topicId — для uni-колод)
- `stepGroup: step1|2|3` (обязателен для USMLE; для uni — NULL, см. `ensureFlashcardsSchema`)
- `testId` — опциональная привязка к банку
- `frontText`, `backText`, `frontImageUrl`, `backImageUrl`
- `externalId` — upsert при повторной загрузке TXT
- `sortOrder`, `isActive`
- теги (тема колоды) через `FlashcardTagMap` → `QuestionTag`

### 2.6 MedicalImage — глоссарий
Файл: `models/MedicalImage.js`

- `imageUrl`, `title`, `description`
- `keywords` — JSON-массив строк
- В UI объяснений USMLE ключевые слова линкуются на фото (`linkifyMedicalTerms` в `public/app.js`)

### 2.7 SubscriptionPlan
Файл: `models/SubscriptionPlan.js` + `utils/subscriptionPlans.js`

USMLE-тарифы:
```
programType: 'usmle'
planScope: 'usmle'
universityId: null
months: 1 | 3 | 12
price, oldPrice, title, isActive
```

Дефолт: 800 / 1500 / 3500 сом. Создание: `ensurePlansForUsmle()`.

### 2.8 User
- `usmleSubscriptionEndDate` — доступ к разделу, пока `endDate > now` (или admin bypass)
- Проверка: `utils/adminUserAccess.js` → `userHasUsmleAccess(user)`

### 2.9 TestResult
История попыток; для welcome-stats / history / режима `incorrect|unsolved` в конструкторе.

Ассоциации: `models/index.js`.

---

## 3. Доступ (middleware)

Файл: `middleware/requireUsmleSubscription.js`

```
Authorization: Bearer <JWT>
→ user.usmleSubscriptionEndDate активен (или админ)
иначе:
  401 + code: USMLE_AUTH_REQUIRED
  403 + code: USMLE_SUBSCRIPTION_REQUIRED
```

Монтирование (`routes/tests.js`):
```js
router.use('/usmle', requireUsmleSubscription);
```
Весь `/api/tests/usmle/*` закрыт подпиской.

Дополнительно при открытии Subject/Test с `programType=usmle` — `assertSubjectAccess` / `assertTestAccess` через `userHasUsmleAccess` (не uni-подписка).

Фронт при 403: редирект на `/subscriptions?program=usmle` (`public/usmle-app.js`).

---

## 4. Публичное API USMLE

База: `/api/tests` + префикс `/usmle`.

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/usmle/dashboard` | Банки по Step: `{ step1: [...], step2, step3 }` — Subjects usmle + вложенные Tests |
| GET | `/usmle/welcome-stats?testId=` | Стата по банку (точность, сколько вопросов трогали) |
| GET | `/usmle/history?testId=` | История попыток пользователя по банку |
| GET | `/usmle/tags` | Плоский список тегов |
| GET | `/usmle/tags/grouped?testId=` | Subject-теги vs System-теги + counts по банку |
| POST | `/usmle/custom-test/questions` | Собрать сессию теста |
| GET | `/usmle/flashcards?testId=&tagId=&stepGroup=` | Карточки (может авто-seed demo) |
| GET | `/usmle/tests-by-tags?tagIds=` | Фильтр тестов по тегам |

### POST `/usmle/custom-test/questions` — тело (идея)

```json
{
  "testId": 123,
  "subjectTagIds": [1, 2],
  "systemTagIds": [10],
  "questionCount": 40,
  "questionMode": "unsolved" | "incorrect" | "all",
  "randomizeAnswers": true,
  "instantFeedbackMode": false
}
```

Логика:
1. Взять вопросы банка (`testId`), отфильтровать по тегам (AND/OR по Subject∩System — как в коде).
2. Учесть `questionMode` по прошлым `TestResult`.
3. Сохранить порядок linked-групп: `pickQuestionsKeepingLinkedOrder`.
4. Вернуть вопросы (+ answers) для клиентской сессии.

Общие эндпоинты проверки/прогресса:  
`/api/tests/tests/:id/questions`, `.../check`, `.../progress` — с USMLE access check.

---

## 5. Пользовательский UX (web)

| Страница | Файл | Роль |
|----------|------|------|
| Выбор банка | `public/usmle.html` | Step tabs → dashboard |
| Home банка | `public/usmle-home.html` | welcome-stats, CTA Create / History / Flashcards |
| Конструктор | `public/usmle-test-builder.html` | теги → custom-test |
| История | `public/usmle-history.html` | history API |
| Flashcards | `public/usmle-flashcards.html` + `.js` | Browse / Study / Session (Front/Back, Again/Good/Easy) |
| Shell | `public/usmle-app.js` + `usmle-app.css` | нав, bank в localStorage/URL, gate подписки |
| Linked UI | `public/usmle-linked-question.js` | рендер связанных вопросов |
| Прохождение | `public/test.html` (+ `app.js`) | общий раннер, режим `programType=usmle` |
| Оплата | `public/subscriptions.html?program=usmle` | тарифы USMLE |

### Поток пользователя

```
Login → /usmle (нужна USMLE-подписка)
  → выбрать банк (Subject/Test)
  → /usmle-home
      → Create Test → tags → POST custom-test → test session
      → History
      → Flashcards (browse by tag topic → study deck → rate cards)
```

Выбранный банк хранится в клиенте (`UsmleApp` / localStorage + query `?bank=` / `testId`).

---

## 6. Админка USMLE

Вкладка **USMLE** в `public/admin.html` + логика в `public/admin.js` (`loadUsmleAdminPanel`).

### Левая колонка
1. **Статистика** — `GET /api/admin/usmle-stats` (активные/оплатившие и т.д.)
2. **Тарифы** — `GET/PUT /api/admin/usmle-subscription-plans`
3. **Теги вопросов** (свёрнуто) — CRUD ` /api/admin/question-tags`, merge duplicates
4. **Медицинский глоссарий** (свёрнуто) — ` /api/admin/medical-images`

### Правая колонка (порядок контента)
1. **Предметы USMLE** — Subject с `programType=usmle` + `stepGroup`
2. **Тесты USMLE** — Test под Subject
3. **Вопросы** — CRUD + загрузки:
   - TXT с объяснениями и тегами
   - TXT связанные вопросы (GroupID)
4. **Flashcards** — фильтры test/tag/step; кнопки:
   - + Flashcard
   - TXT flashcards
   - Демо карточки
   - Карточка с картинами

API админки: `routes/admin.js` + загрузки `routes/pdfUpload.js`.

---

## 7. Форматы TXT (админ)

### 7.1 Вопросы с объяснением и тегами
`POST /api/admin/upload-txt-explained` (только USMLE-тест)

```
"ID":"101"
"Q":"Текст вопроса..."
"A1":"вариант"
"A2":"вариант"
"A3":"вариант"
"A4":"вариант"
"Correct":"2"
"E":"Объяснение..."
"Subject":"Pathology"
"System":"Cardiovascular System"
```

Альтернативы тегов: `Tags` / `T` / `Tag` (через запятую). Теги создаются, если нет.

### 7.2 Связанные вопросы
`POST /api/admin/upload-txt-linked`

```
"GroupID":"1"
"ID":"201"
"Q":"..."
A1.. / Correct / E / Subject / System

"GroupID":"1"
"ID":"202"
"Q":"..."
...
```

Один `GroupID` = одна vignette-группа. При выборке в custom-test порядок внутри группы сохраняется.

### 7.3 Flashcards
`POST /api/admin/upload-txt-flashcards`  
body: `testId?`, `stepGroup`, file field name **`pdf`** (историческое имя)

```
=== Renal, Urinary Systems & Electrolytes ===
"ID":"1"
"Front":"... ______ ... (nephritic/nephrotic)"
"Back":"полный ответ с заполненными пропусками"

=== Biochemistry ===
"ID":"2"
"Front":"..."
"Back":"..."
```

- Заголовок `=== Topic ===` → тег колоды (`QuestionTag`) через `FlashcardTagMap`
- Upsert по `(stepGroup, testId, externalId)`
- Темы нормализуются: `utils/usmleFlashcardTopics.js`

Демо: `data/sample-usmle-flashcards.txt` → `POST /api/admin/flashcards/seed-demo` / `utils/seedDemoFlashcards.js`

---

## 8. Flashcards — клиентская логика

Файл: `public/usmle-flashcards.js`

Режимы:
1. **Browse** — группы по primary tag; превью карточек; See All
2. **Study** — таблица колод: New / Learning / To Review / Last Used + Play
3. **Session** — Front/Back, Show Answer, Again / Good / Easy

Прогресс в `localStorage` (`usmleFlashcardProgress`): `{ [cardId]: { status, lastUsed } }`.

Front HTML: пропуски `______` и скобки `(a/b)` подсвечиваются (`buildFrontHtml` / client helper).

---

## 9. Подписка и оплата

1. `ensurePlansForUsmle()` при старте (`utils/subscriptionPlans.js`, вызывается из `ensureUniversities` / boot).
2. Клиент: `GET /api/payments/plans?program=usmle`
3. Создание платежа с `programType: 'usmle'` → в БД тип `usmle_subscription`
4. Webhook успеха → продлевает **`usmleSubscriptionEndDate`** (не uni-дату)
5. Auth/me отдаёт `usmleSubscriptionActive` / end date для UI

Обход: пользователь, привязанный как admin — `userHasUsmleAccess` всегда true.

---

## 10. Глоссарий в объяснениях

1. Админ загружает MedicalImage + keywords.
2. Клиент: `GET /api/medical-images/keywords`
3. В HTML **только explanation** (не stem, не answers) — `linkifyMedicalTerms` → клик открывает картинку.

Маршруты: `routes/medicalImages.js`  
Публично: `/api/medical-images`, `/api/medical-images/keywords`  
Админ: `/api/admin/medical-images`

---

## 11. Boot / схема при старте сервера

`server.js` (упрощённо):

```
sequelize.authenticate()
→ prepareSubscriptionPlansSchema()
→ sequelize.sync({ alter: true })
→ DROP NOT NULL на нужных колонках (plans, flashcards.stepGroup)
→ ensureFlashcardsSchema()
→ ensureUniversities()  // внутри ensurePlansForUsmle
→ ensureFaculties()
→ ensureUsmleTagsSeeded()
→ listen
```

Важно для flashcards: колонка `stepGroup` должна допускать NULL (university), но USMLE всегда пишет `step1|2|3`.

---

## 12. Страницы server.js

```
/usmle              → usmle.html
/usmle-home         → usmle-home.html
/usmle-create       → usmle-create.html (редирект в builder)
/usmle-history      → usmle-history.html
/usmle-test-builder → usmle-test-builder.html
/usmle-flashcards   → usmle-flashcards.html
/news               → 301 → /usmle  (исторически)
```

API mount:
- `/api/tests` → `routes/tests.js` (внутри `/usmle/*`)
- `/api/admin` → `admin.js` + `pdfUpload.js`
- `/api/payments` → `payments.js`
- `/api/medical-images` (+ admin) → `medicalImages.js`

---

## 13. Мобильное приложение (кратко)

`stud_mobile/`:
- экраны `lib/screens/usmle/*`
- `TestsService`: dashboard, tags/grouped, custom-test
- роутер: `/usmle`, `/usmle-builder/:testId`, редирект на подписку без доступа
- парсер linked: `usmle_question_parser.dart`
- оплата с `programType=usmle`

Логика зеркалит web.

---

## 14. Карта файлов (чеклист для клона)

### Backend
```
models/Subject.js, Test.js, Question.js, Answer.js
models/QuestionTag.js, QuestionTagMap.js
models/Flashcard.js, FlashcardTagMap.js
models/MedicalImage.js, SubscriptionPlan.js, User.js
models/index.js
middleware/requireUsmleSubscription.js
routes/tests.js          # /usmle/*
routes/admin.js          # tags, subjects, tests, questions, flashcards, usmle plans/stats
routes/pdfUpload.js      # TXT explained / linked / flashcards
routes/medicalImages.js
routes/payments.js       # program=usmle
utils/usmleTagCatalog.js
utils/usmleTagNormalize.js
utils/ensureUsmleTagsSeeded.js
utils/usmleLinkedQuestions.js
utils/parseFlashcardsTxt.js
utils/usmleFlashcardTopics.js
utils/seedDemoFlashcards.js
utils/subscriptionPlans.js  # USMLE_PLAN_SCOPE, ensurePlansForUsmle
utils/adminUserAccess.js
utils/ensureFlashcardsSchema.js
utils/flashcardHighlight.js
data/sample-usmle-flashcards.txt
scripts/seedUsmleFlashcards.js
server.js
```

### Frontend web
```
public/usmle.html
public/usmle-home.html
public/usmle-create.html
public/usmle-test-builder.html
public/usmle-history.html
public/usmle-flashcards.html
public/usmle-flashcards.js
public/usmle-app.js
public/usmle-app.css
public/usmle-linked-question.js
public/admin.html        # вкладка USMLE
public/admin.js
public/admin-styles.css
public/app.js            # оплата + linkify + test runner hooks
public/subscriptions.html
public/test.html
```

---

## 15. Минимальный скелет «похожего проекта»

Если клонировать идею с нуля:

1. **Две подписки** (или одна «premium track»): отдельное поле endDate + отдельные планы `planScope`.
2. **Контент с `programType`** и `universityId=null` для независимого трека.
3. **Иерархия:** Step → Bank (Subject) → Test → Questions (+ Tags M2M).
4. **Конструктор сессии:** фильтр по двум осям тегов (Subject × System) + лимит N + режимы all/unsolved/incorrect.
5. **Админ TXT pipeline:** parse → findOrCreate tags → upsert by externalId.
6. **Flashcards:** Front/Back + topic tag + local SRS-статусы; опционально images.
7. **Gate middleware** на весь `/api/{track}/*`.
8. **UI shell** с выбранным банком в storage.

Не смешивать university-колоды (`FlashcardTopic` + `universityId`) с USMLE-тегами — в этом репо это **два разных продукта** на одной таблице `Flashcards`, разделённых `programType`.

---

## 16. Типичные ошибки при портировании

1. Забыть `universityId = null` у USMLE Subject/Test/Plan → контент «прилипнет» к вузу.
2. `stepGroup` NOT NULL в БД при создании university-карточек (уже чинится `ensureFlashcardsSchema`).
3. Открыть USMLE-тест по uni-подписке — нельзя; нужны отдельные проверки.
4. Field name файла TXT upload: клиент шлёт `pdf`, не `file`.
5. Linked-вопросы ломаются, если резать выборку по одному ID без `pickQuestionsKeepingLinkedOrder`.
6. Глоссарий линковать только в explanation, иначе спойлеры в вопросе.

---

*Сгенерировано как карта логики текущего `stud_beta`. При расхождении с кодом приоритет у исходников, перечисленных в §14.*
