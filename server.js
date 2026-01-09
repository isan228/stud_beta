const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./models');

const app = express();

// Middleware
app.use(cors());

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
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

// Загрузка PDF - опционально (может не работать на некоторых версиях Node.js)
try {
  app.use('/api/admin', require('./routes/pdfUpload'));
} catch (error) {
  console.warn('⚠️  Роут загрузки PDF не загружен:', error.message);
  console.warn('   Загрузка PDF будет недоступна. Используйте ручной ввод вопросов.');
}

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
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Ошибка отправки файла ${pages[route]}:`, err);
        res.status(404).send('Страница не найдена');
      }
    });
  });
});

// Статические файлы (CSS, JS, изображения и т.д.) - только для файлов с расширениями
app.use(express.static(path.join(__dirname, 'public'), {
  index: false
}));

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

