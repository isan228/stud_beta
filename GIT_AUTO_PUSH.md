# Автоматический Push в GitHub

Настроена автоматическая отправка изменений в GitHub после каждого коммита.

## Как это работает

### 1. Git Hook (автоматический)
После каждого `git commit` автоматически выполняется push в GitHub (ветка `main`).

**Файл:** `.git/hooks/post-commit`

**Как работает:**
- После каждого коммита автоматически проверяется текущая ветка
- Если вы на ветке `main`, изменения автоматически отправляются в GitHub
- Если вы на другой ветке, push пропускается

### 2. NPM скрипты (ручной)

#### `npm run push`
Добавляет все изменения, создает коммит с сообщением "Update: изменения в проекте" и пушит в GitHub.

```bash
npm run push
```

#### `npm run push-auto`
То же самое, но с автоматическим сообщением коммита.

```bash
npm run push-auto
```

#### `npm run push-ps`
Использует PowerShell скрипт для более детального вывода и обработки ошибок.

```bash
npm run push-ps
```

### 3. PowerShell скрипт (ручной)

**Файл:** `scripts/auto-push.ps1`

Использование:
```powershell
.\scripts\auto-push.ps1
# или с кастомным сообщением:
.\scripts\auto-push.ps1 -Message "Мое сообщение коммита"
```

## Настройка

### Проверка подключения к GitHub

Убедитесь, что репозиторий подключен:
```bash
git remote -v
```

Должно быть:
```
origin  https://github.com/isan228/stud_beta (fetch)
origin  https://github.com/isan228/stud_beta (push)
```

### Аутентификация

Для автоматического push необходимо настроить аутентификацию GitHub:

1. **Personal Access Token (рекомендуется)**
   - Создайте токен на GitHub: Settings → Developer settings → Personal access tokens
   - Используйте токен вместо пароля при push

2. **SSH ключи**
   - Настройте SSH ключи для GitHub
   - Измените remote URL на SSH: `git remote set-url origin git@github.com:isan228/stud_beta.git`

## Отключение автоматического push

Если нужно временно отключить автоматический push:

1. Переименуйте hook:
   ```bash
   mv .git/hooks/post-commit .git/hooks/post-commit.disabled
   ```

2. Или удалите файл:
   ```bash
   rm .git/hooks/post-commit
   ```

## Важные замечания

⚠️ **Внимание:**
- Автоматический push работает только для ветки `main`
- Убедитесь, что у вас настроена аутентификация GitHub
- Если push не удался, проверьте логи и выполните push вручную

## Примеры использования

### Обычная работа с автоматическим push
```bash
# Делаете изменения в файлах
# ...

# Коммитите изменения
git commit -m "Добавил новую функцию"
# Автоматически выполнится: git push origin main
```

### Ручной push через npm
```bash
# Добавить все изменения и запушить
npm run push
```

### Ручной push через PowerShell
```powershell
.\scripts\auto-push.ps1 -Message "Обновил документацию"
```

