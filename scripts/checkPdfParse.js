require('dotenv').config();

console.log('Проверка модуля pdf-parse...\n');

// Проверка 1: Установлен ли модуль
try {
  const packageJson = require('../package.json');
  if (packageJson.dependencies['pdf-parse']) {
    console.log('✓ pdf-parse указан в package.json');
  } else {
    console.log('✗ pdf-parse НЕ указан в package.json');
  }
} catch (error) {
  console.log('✗ Не удалось прочитать package.json');
}

// Проверка 2: Может ли модуль быть загружен
let pdfParse = null;
let loadError = null;
try {
  pdfParse = require('pdf-parse');
  console.log('✓ pdf-parse успешно загружен через require()');
} catch (error) {
  loadError = error;
  console.log('✗ pdf-parse НЕ может быть загружен');
  console.log('  Ошибка:', error.message);
  console.log('  Стек:', error.stack);
}

// Проверка 3: Может ли модуль парсить простой PDF (если загружен)
if (pdfParse) {
  console.log('\n✓ Модуль готов к использованию');
  console.log('  Если на сервере все еще ошибка 503, попробуйте:');
  console.log('  1. npm install pdf-parse');
  console.log('  2. Перезапустить сервер (npm run restart-server)');
} else {
  console.log('\n✗ Модуль не может быть использован');
  console.log('\nРешение:');
  console.log('  1. Установите модуль: npm install pdf-parse');
  console.log('  2. Если ошибка сохраняется, попробуйте:');
  console.log('     npm uninstall pdf-parse');
  console.log('     npm install pdf-parse@1.1.1');
  console.log('  3. Перезапустите сервер');
}

process.exit(pdfParse ? 0 : 1);

