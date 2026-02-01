const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { sequelize } = require('./models');

const app = express();

// Middleware
app.use(cors());

// Защита от path traversal и других атак (ПЕРВЫМ, до всего остального)
app.use((req, res, next) => {
  try {
    // Проверяем raw URL path (до декодирования)
    const rawPath = req.path;
    const lowerRawPath = rawPath.toLowerCase();
    
    // Блокируем подозрительные паттерны в raw URL
    const suspiciousPatterns = [
      '..', '%2e%2e', '%2E%2E', '%c0%af', '%e0%80%af',
      '\\', '//', '/proc/', '/etc/', '/sys/',
      'environ', 'passwd', 'shadow', 'bash_history',
      'win.ini', 'access.log', '.bash'
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (lowerRawPath.includes(pattern.toLowerCase())) {
        // Тихий ответ для атак (не логируем, не тратим ресурсы)
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    
    // Пытаемся декодировать для дополнительной проверки
    try {
      const decodedPath = decodeURIComponent(req.path);
      const lowerDecodedPath = decodedPath.toLowerCase();
      
      // Дополнительные проверки после декодирования
      if (
        decodedPath.includes('..') ||
        decodedPath.includes('\\') ||
        decodedPath.includes('//') ||
        lowerDecodedPath.includes('/proc/') ||
        lowerDecodedPath.includes('/etc/') ||
        lowerDecodedPath.includes('/sys/') ||
        lowerDecodedPath.includes('environ') ||
        lowerDecodedPath.includes('passwd') ||
        lowerDecodedPath.includes('shadow')
      ) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch (decodeError) {
      // Если не удалось декодировать и есть подозрительные символы - блокируем
      if (rawPath.includes('%')) {
        return res.status(400).json({ error: 'Bad Request' });
      }
    }
    
    next();
  } catch (e) {
    // Любая ошибка в проверке - блокируем
    return res.status(400).json({ error: 'Bad Request' });
  }
});

// Важно: Webhook Finik требует raw body для валидации подписи
// Поэтому обрабатываем webhook до общего express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

// Общие middleware для остальных роутов
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API роуты (должны быть первыми)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api', require('./routes/favorites'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/contact'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

// Загрузка PDF - опционально (может не работать на некоторых версиях Node.js)
try {
  app.use('/api/admin', require('./routes/pdfUpload'));
} catch (error) {
  console.warn('⚠️  Роут загрузки PDF не загружен:', error.message);
  console.warn('   Загрузка PDF будет недоступна. Используйте ручной ввод вопросов.');
}
app.use('/api/admin', require('./routes/documentsUpload'));

// Маршруты для страниц (ДО статических файлов!)
const pages = {
  '/': 'index.html',
  '/tests': 'tests.html',
  '/subject-tests': 'subject-tests.html',
  '/test-settings': 'test-settings.html',
  '/test': 'test.html',
  '/test-result': 'test-result.html',
  '/news': 'news.html',
  '/about': 'about.html',
  '/favorites': 'favorites.html',
  '/profile': 'profile.html',
  '/contact': 'contact.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/admin': 'admin.html',
  '/payment': 'payment.html',
  '/payment/success': 'payment-success.html'
};

// Обработка маршрутов страниц
Object.keys(pages).forEach(route => {
  app.get(route, (req, res) => {
    const filePath = path.join(__dirname, 'public', pages[route]);
    
    // Проверяем существование файла перед отправкой
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`Файл не найден: ${filePath}`, err);
        return res.status(404).send('Страница не найдена');
      }
      
      // Отключаем кеширование для admin.html, чтобы всегда получать свежую версию
      if (route === '/admin') {
        res.set({
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
      }
      
      res.sendFile(filePath, (sendErr) => {
        if (sendErr) {
          console.error(`Ошибка отправки файла ${pages[route]}:`, sendErr);
          res.status(500).send('Ошибка сервера');
        }
      });
    });
  });
});

// Статические файлы (CSS, JS, изображения и т.д.) - только для файлов с расширениями
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  dotfiles: 'deny', // Запрещаем доступ к скрытым файлам
  setHeaders: (res, filePath) => {
    // Безопасные заголовки для статических файлов
    res.set('X-Content-Type-Options', 'nosniff');
    
    // Отключаем кеширование для app.js и admin.js, чтобы всегда получать свежие версии
    if (filePath.includes('app.js') || filePath.includes('admin.js')) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    }
  }
}));

// Обработка ошибок для статических файлов (тихие ошибки для атак)
app.use((err, req, res, next) => {
  // Игнорируем ошибки path traversal (это атаки)
  if (err.message && (
    err.message.includes('Failed to decode param') ||
    err.message.includes('ENOENT') ||
    err.message.includes('path traversal')
  )) {
    // Тихий ответ 404 для атак, не логируем
    return res.status(404).json({ error: 'Not found' });
  }
  // Для реальных ошибок логируем
  console.error('Static file error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Для всех остальных маршрутов (кроме API и статических файлов)
app.get('*', (req, res) => {
  // Пропускаем API и файлы с расширениями
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Редирект на главную для неизвестных маршрутов
  res.redirect('/');
});

// Подключение к БД и запуск сервера
const PORT = process.env.PORT || 3000;

sequelize.authenticate()
  .then(() => {
    console.log('Подключение к базе данных установлено');
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('Модели синхронизированы');
    app.listen(PORT, () => {
      console.log(`Сервер запущен на порту ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Ошибка подключения к базе данных:', err);
  });

