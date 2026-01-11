const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { Question, Answer, Test } = require('../models');

// Пытаемся загрузить pdf-parse, но делаем это опциональным
let pdfParse = null;
let pdfParseError = null;
try {
  pdfParse = require('pdf-parse');
  console.log('✓ pdf-parse успешно загружен');
} catch (error) {
  pdfParseError = error;
  console.warn('⚠️  pdf-parse не может быть загружен. Загрузка PDF будет недоступна.');
  console.warn('   Ошибка:', error.message);
  console.warn('   Попробуйте переустановить: npm install pdf-parse');
}

// Настройка multer для загрузки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Только PDF файлы разрешены'), false);
    }
  }
});

// Загрузка и парсинг PDF с вопросами
router.post('/upload-pdf', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    // Проверяем, доступен ли pdf-parse
    if (!pdfParse) {
      const errorMessage = pdfParseError 
        ? `Модуль pdf-parse не может быть загружен: ${pdfParseError.message}. Попробуйте переустановить: npm install pdf-parse`
        : 'Модуль pdf-parse не может быть загружен. Используйте ручной ввод вопросов.';
      
      return res.status(503).json({ 
        error: 'Загрузка PDF временно недоступна',
        message: errorMessage
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'PDF файл не загружен' });
    }

    const { testId } = req.body;
    
    if (!testId) {
      return res.status(400).json({ error: 'ID теста обязателен' });
    }

    // Проверяем существование теста
    const test = await Test.findByPk(testId);
    if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
    }

    // Парсим PDF
    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (parseError) {
      console.error('Ошибка парсинга PDF:', parseError);
      return res.status(500).json({ 
        error: 'Ошибка парсинга PDF файла',
        message: parseError.message || 'Не удалось извлечь текст из PDF. Убедитесь, что файл не поврежден.'
      });
    }
    
    const text = pdfData.text;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'PDF файл пуст или не содержит текста',
        message: 'Убедитесь, что PDF содержит текст, а не только изображения.'
      });
    }

    // Парсим вопросы из текста
    // Формат: Вопрос?\nA) Ответ1\nB) Ответ2\nC) Ответ3\nD) Ответ4\nПравильный ответ: A
    const questions = parseQuestionsFromPDF(text);

    if (questions.length === 0) {
      return res.status(400).json({ error: 'Не удалось найти вопросы в PDF. Убедитесь, что формат правильный.' });
    }

    // Сохраняем вопросы в базу данных
    const createdQuestions = [];
    for (const q of questions) {
      const question = await Question.create({
        text: q.text,
        testId: parseInt(testId)
      });

      // Создаем ответы
      for (const answer of q.answers) {
        await Answer.create({
          text: answer.text,
          isCorrect: answer.isCorrect,
          questionId: question.id
        });
      }

      createdQuestions.push({
        id: question.id,
        text: question.text,
        answersCount: q.answers.length
      });
    }

    res.json({
      message: `Успешно загружено ${createdQuestions.length} вопросов`,
      questions: createdQuestions
    });
  } catch (error) {
    console.error('Ошибка загрузки PDF:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки PDF файла' });
  }
});

// Функция парсинга вопросов из текста PDF
// Поддерживается только формат:
// "ID":"1";
// "Q":"Вопрос";
// "A1":"Ответ 1";
// "A2":"Ответ 2";
// "A3":"Ответ 3";
// "A4":"Ответ 4";
// "A5":"Ответ 5"; (опционально)
// "Correct":"4";
function parseQuestionsFromPDF(text) {
  const questions = [];
  
  console.log('Начало парсинга PDF. Поддерживается только формат с "ID", "Q", "A1-A5", "Correct"');
  
  // Разбиваем текст на блоки по "ID"
  const blocks = text.split(/"ID"\s*:\s*"/);
  
  for (let i = 1; i < blocks.length; i++) { // Начинаем с 1, так как первый элемент пустой
    const block = blocks[i];
    
    try {
      // Извлекаем ID
      const idMatch = block.match(/^(\d+)"/);
      if (!idMatch) continue;
      
      // Извлекаем Q (вопрос)
      const qMatch = block.match(/"Q"\s*:\s*"([^"]+)"/);
      if (!qMatch) continue;
      const questionText = qMatch[1];
      
      // Извлекаем ответы A1-A5
      const answers = [];
      for (let j = 1; j <= 5; j++) {
        const aMatch = block.match(new RegExp(`"A${j}"\\s*:\\s*"([^"]+)"`));
        if (aMatch) {
          answers.push({
            text: aMatch[1],
            index: j
          });
        }
      }
      
      if (answers.length < 2) {
        console.warn(`Вопрос ID ${idMatch[1]}: недостаточно ответов (минимум 2)`);
        continue;
      }
      
      // Извлекаем правильный ответ
      const correctMatch = block.match(/"Correct"\s*:\s*"(\d+)"/);
      if (!correctMatch) {
        console.warn(`Вопрос ID ${idMatch[1]}: не найден правильный ответ`);
        continue;
      }
      
      const correctIndex = parseInt(correctMatch[1]) - 1; // "Correct":"4" -> index 3
      
      if (correctIndex < 0 || correctIndex >= answers.length) {
        console.warn(`Вопрос ID ${idMatch[1]}: неправильный индекс правильного ответа (${correctIndex + 1}, всего ответов: ${answers.length})`);
        continue;
      }
      
      // Формируем объект вопроса
      questions.push({
        text: questionText,
        answers: answers.map((a, idx) => ({
          text: a.text,
          isCorrect: idx === correctIndex
        }))
      });
      
      console.log(`✓ Вопрос ID ${idMatch[1]} успешно распарсен: "${questionText.substring(0, 50)}..."`);
    } catch (error) {
      console.error(`Ошибка парсинга блока ${i}:`, error);
      continue;
    }
  }
  
  console.log(`Всего распарсено вопросов: ${questions.length}`);
  return questions;
}

module.exports = router;

