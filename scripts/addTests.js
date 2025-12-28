require('dotenv').config();
const sequelize = require('../config/database');
const Subject = require('../models/Subject');
const Test = require('../models/Test');

async function addTests() {
  try {
    await sequelize.authenticate();
    console.log('✓ Подключение к БД установлено');

    // Получаем все предметы
    const subjects = await Subject.findAll();
    console.log(`\nНайдено предметов: ${subjects.length}`);

    if (subjects.length === 0) {
      console.log('Нет предметов для создания тестов. Сначала добавьте предметы.');
      process.exit(0);
    }

    let added = 0;
    let skipped = 0;

    for (const subject of subjects) {
      try {
        // Проверяем, есть ли уже тест для этого предмета
        const existingTest = await Test.findOne({
          where: { 
            subjectId: subject.id,
            name: `Тест по ${subject.name}`
          }
        });

        if (existingTest) {
          console.log(`⊘ Пропущен (тест уже существует): ${subject.name}`);
          skipped++;
          continue;
        }

        // Создаем тест для предмета
        const test = await Test.create({
          name: `Тест по ${subject.name}`,
          description: `Основной тест по предмету ${subject.name}`,
          subjectId: subject.id
        });

        console.log(`✓ Создан тест: "${test.name}" для предмета "${subject.name}"`);
        added++;
      } catch (error) {
        console.error(`✗ Ошибка при создании теста для "${subject.name}":`, error.message);
      }
    }

    console.log('\n=== Результат ===');
    console.log(`Создано тестов: ${added}`);
    console.log(`Пропущено (уже существуют): ${skipped}`);
    console.log(`Всего предметов: ${subjects.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    process.exit(1);
  }
}

addTests();

