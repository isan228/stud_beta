const { sequelize, Subject, Test, Question, Answer } = require('../models');
require('dotenv').config();

async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к БД установлено');

    await sequelize.sync({ force: true });
    console.log('Таблицы созданы');

    // Создание тестовых данных
    const subjects = await Subject.bulkCreate([
      { name: 'Математика', description: 'Тесты по математике' },
      { name: 'Физика', description: 'Тесты по физике' },
      { name: 'Химия', description: 'Тесты по химии' },
      { name: 'История', description: 'Тесты по истории' },
      { name: 'Биология', description: 'Тесты по биологии' }
    ]);

    console.log('Предметы созданы');

    // Создание тестов
    for (const subject of subjects) {
      const test = await Test.create({
        name: `Тест по ${subject.name}`,
        description: `Пробный тест по предмету ${subject.name}`,
        subjectId: subject.id
      });

      // Создание вопросов для каждого теста
      for (let i = 1; i <= 5; i++) {
        const question = await Question.create({
          text: `Вопрос ${i} по ${subject.name}?`,
          testId: test.id
        });

        // Создание ответов для каждого вопроса
        const answers = [];
        for (let j = 1; j <= 4; j++) {
          answers.push({
            text: `Вариант ответа ${j} для вопроса ${i}`,
            isCorrect: j === 1, // Первый ответ правильный
            questionId: question.id
          });
        }
        await Answer.bulkCreate(answers);
      }
    }

    console.log('Тестовые данные созданы');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка инициализации БД:', error);
    process.exit(1);
  }
}

initDatabase();

