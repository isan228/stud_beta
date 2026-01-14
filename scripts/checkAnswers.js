require('dotenv').config();
const { Answer, sequelize } = require('../models');

async function checkAnswers() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к базе данных установлено');

    // Проверяем несколько ответов
    const answers = await Answer.findAll({
      limit: 20,
      order: [['id', 'DESC']]
    });

    console.log('\n=== Проверка формата isCorrect в базе данных ===\n');
    
    answers.forEach(answer => {
      const rawValue = answer.getDataValue('isCorrect');
      const jsonValue = answer.toJSON().isCorrect;
      
      console.log(`Ответ ID ${answer.id}:`, {
        questionId: answer.questionId,
        text: answer.text?.substring(0, 50),
        'getDataValue("isCorrect")': rawValue,
        'typeof getDataValue': typeof rawValue,
        'toJSON().isCorrect': jsonValue,
        'typeof toJSON': typeof jsonValue,
        'isCorrect === true': rawValue === true,
        'isCorrect === 1': rawValue === 1,
        'isCorrect === "1"': rawValue === '1',
        'isCorrect === "t"': rawValue === 't',
        'isCorrect === "true"': rawValue === 'true'
      });
    });

    // Проверяем вопросы без правильных ответов
    const questionsWithoutCorrect = await sequelize.query(`
      SELECT q.id, q.text, COUNT(a.id) as answer_count,
             COUNT(CASE WHEN a."isCorrect" = true THEN 1 END) as correct_count,
             COUNT(CASE WHEN a."isCorrect" = false THEN 1 END) as false_count,
             COUNT(CASE WHEN a."isCorrect" IS NULL THEN 1 END) as null_count
      FROM "Questions" q
      LEFT JOIN "Answers" a ON q.id = a."questionId"
      GROUP BY q.id, q.text
      HAVING COUNT(CASE WHEN a."isCorrect" = true THEN 1 END) = 0
      LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('\n=== Вопросы без правильных ответов (первые 10) ===\n');
    questionsWithoutCorrect.forEach(q => {
      console.log(`Вопрос ID ${q.id}: ${q.text?.substring(0, 50)}...`);
      console.log(`  Всего ответов: ${q.answer_count}, Правильных: ${q.correct_count}, Неправильных: ${q.false_count}, NULL: ${q.null_count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Ошибка проверки ответов:', error);
    process.exit(1);
  }
}

checkAnswers();

