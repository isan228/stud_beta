# PowerShell скрипт для автоматического push в GitHub
# Использование: .\scripts\auto-push.ps1 [commit message]

param(
    [string]$Message = "Auto-update: $(Get-Date -Format 'yyyy-MM-dd_HH:mm:ss')"
)

Write-Host "🚀 Автоматический push в GitHub..." -ForegroundColor Cyan

# Получаем текущую ветку
$currentBranch = git symbolic-ref --short HEAD 2>$null
if (-not $currentBranch) {
    Write-Host "❌ Ошибка: не удалось определить текущую ветку" -ForegroundColor Red
    exit 1
}

Write-Host "Ветка: $currentBranch" -ForegroundColor Yellow

# Добавляем все изменения
Write-Host "📦 Добавление изменений..." -ForegroundColor Cyan
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при добавлении файлов" -ForegroundColor Red
    exit 1
}

# Коммитим изменения
Write-Host "💾 Создание коммита..." -ForegroundColor Cyan
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Нет изменений для коммита или ошибка при коммите" -ForegroundColor Yellow
    exit 0
}

# Пушим в GitHub
Write-Host "📤 Отправка в GitHub..." -ForegroundColor Cyan
git push origin $currentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Изменения успешно отправлены в GitHub!" -ForegroundColor Green
} else {
    Write-Host "❌ Не удалось отправить изменения в GitHub" -ForegroundColor Red
    Write-Host "   Попробуйте выполнить вручную: git push origin $currentBranch" -ForegroundColor Yellow
    exit 1
}

