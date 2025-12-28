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
function parseQuestionsFromPDF(text) {
  const questions = [];
  
  // Разные форматы вопросов
  // Формат 1: Q: Вопрос (может быть многострочным)\nA1: Ответ\nA2: Ответ\n...\nCorrect: 4
  // Формат 2: Вопрос?\nA) Ответ\nB) Ответ\n...\nПравильный ответ: A
  // Формат 3: 1. Вопрос?\nA) Ответ\nB) Ответ\n...\nОтвет: A

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentQuestion = null;
  let currentQuestionLines = [];
  let currentAnswers = [];
  let currentAnswerIndex = null;
  let currentAnswerText = [];
  let correctAnswerIndex = null;
  let inQuestion = false;
  let inAnswer = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Формат 1: Q: вопрос (начало вопроса)
    if (line.match(/^Q:\s*/i)) {
      // Сохраняем последний ответ предыдущего вопроса, если был
      if (currentAnswerIndex !== null && currentAnswerText.length > 0) {
        currentAnswers[currentAnswerIndex] = {
          text: currentAnswerText.join(' ').trim(),
          index: currentAnswerIndex
        };
      }
      
      // Завершаем предыдущий вопрос, если он был в процессе
      if (currentQuestionLines.length > 0 && !currentQuestion) {
        currentQuestion = currentQuestionLines.join('\n').trim();
      }
      
      // Сохраняем предыдущий вопрос
      if (currentQuestion && currentAnswers.length > 0) {
        const validAnswers = currentAnswers.filter(a => a && a.text && a.text.length > 0);
        if (validAnswers.length > 0) {
          questions.push({
            text: currentQuestion,
            answers: validAnswers.map((a, idx) => ({
              text: a.text,
              isCorrect: idx === correctAnswerIndex
            }))
          });
        }
      }
      
      // Начинаем новый вопрос
      const questionStart = line.replace(/^Q:\s*/i, '').trim();
      currentQuestionLines = questionStart ? [questionStart] : [];
      currentAnswers = [];
      currentAnswerIndex = null;
      currentAnswerText = [];
      correctAnswerIndex = null;
      inQuestion = true;
      inAnswer = false;
    }
    // Формат 1: A1, A2, A3, A4, A5: ответы (начало ответа)
    else if (line.match(/^A\d+:\s*/i)) {
      // Завершаем вопрос, если он был в процессе
      if (inQuestion && currentQuestionLines.length > 0 && !currentQuestion) {
        currentQuestion = currentQuestionLines.join('\n').trim();
      }
      
      // Сохраняем предыдущий ответ, если был
      if (currentAnswerIndex !== null && currentAnswerText.length > 0) {
        currentAnswers[currentAnswerIndex] = {
          text: currentAnswerText.join('\n').trim(),
          index: currentAnswerIndex
        };
      }
      
      // Начинаем новый ответ
      const match = line.match(/^A(\d+):\s*(.+)/i);
      if (match) {
        currentAnswerIndex = parseInt(match[1]) - 1; // A1 -> 0, A2 -> 1, etc.
        const answerStart = match[2].trim();
        currentAnswerText = answerStart ? [answerStart] : [];
        inQuestion = false;
        inAnswer = true;
      }
    }
    // Формат 1: Correct: номер
    else if (line.match(/^Correct:\s*/i)) {
      // Сохраняем последний ответ
      if (currentAnswerIndex !== null && currentAnswerText.length > 0) {
        currentAnswers[currentAnswerIndex] = {
          text: currentAnswerText.join(' ').trim(),
          index: currentAnswerIndex
        };
      }
      
      // Завершаем вопрос, если он был в процессе
      if (inQuestion && currentQuestionLines.length > 0 && !currentQuestion) {
        currentQuestion = currentQuestionLines.join('\n').trim();
      }
      
      const match = line.match(/^Correct:\s*(\d+)/i);
      if (match) {
        correctAnswerIndex = parseInt(match[1]) - 1; // Correct: 4 -> index 3
      }
      
      inQuestion = false;
      inAnswer = false;
    }
    // Продолжение вопроса (если мы в режиме вопроса и не встретили A1)
    else if (inQuestion && !line.match(/^A\d+:/i) && !line.match(/^Correct:/i)) {
      currentQuestionLines.push(line);
    }
    // Продолжение ответа (если мы в режиме ответа)
    else if (inAnswer && currentAnswerIndex !== null && !line.match(/^A\d+:/i) && !line.match(/^Correct:/i) && !line.match(/^Q:/i)) {
      currentAnswerText.push(line);
    }
    // Формат 2: Определяем начало вопроса (старый формат)
    else if (line.match(/^\d+[\.\)]\s*.+\?/) || (line.includes('?') && !line.match(/^[A-D][\.\)]/) && !line.match(/^A\d+:/i))) {
      // Сохраняем предыдущий вопрос
      if (currentQuestion && currentAnswers.length > 0) {
        questions.push({
          text: currentQuestion,
          answers: currentAnswers.map(a => ({
            text: a.text,
            isCorrect: a.isCorrect || false
          }))
        });
      }
      
      // Начинаем новый вопрос
      currentQuestion = line.replace(/^\d+[\.\)]\s*/, '');
      currentAnswers = [];
      correctAnswerIndex = null;
    }
    // Формат 2: Определяем вариант ответа (старый формат)
    else if (line.match(/^[A-D][\.\)]\s*/) || (line.match(/^\d+[\.\)]\s*/) && !line.match(/^Correct:/i))) {
      const answerText = line.replace(/^[A-D][\.\)]\s*/, '').replace(/^\d+[\.\)]\s*/, '');
      const letter = line.match(/^([A-D])/)?.[1] || null;
      
      currentAnswers.push({
        text: answerText,
        letter: letter,
        isCorrect: false
      });
    }
    // Формат 2: Определяем правильный ответ (старый формат)
    else if (line.match(/Правильный ответ:|Ответ:|Правильный:/i)) {
      const match = line.match(/([A-D]|\d+)/i);
      if (match) {
        const correctAnswer = match[1].toUpperCase();
        
        // Отмечаем правильный ответ
        if (currentAnswers.length > 0) {
          currentAnswers.forEach((ans, idx) => {
            if (ans.letter === correctAnswer || (idx + 1).toString() === correctAnswer) {
              ans.isCorrect = true;
            }
          });
        }
      }
    }
  }

  // Сохраняем последний ответ, если он был в процессе
  if (currentAnswerIndex !== null && currentAnswerText.length > 0) {
    currentAnswers[currentAnswerIndex] = {
      text: currentAnswerText.join(' ').trim(),
      index: currentAnswerIndex
    };
  }
  
  // Завершаем вопрос, если он был в процессе (формат Q:/A1-A5)
  if (currentQuestionLines.length > 0 && !currentQuestion) {
    currentQuestion = currentQuestionLines.join(' ').trim();
  }

  // Сохраняем последний вопрос
  if (currentQuestion) {
    // Фильтруем пустые ответы для формата A1-A5
    const validAnswers = currentAnswers.filter(a => a && a.text && a.text.length > 0);
    
    if (validAnswers.length > 0) {
      questions.push({
        text: currentQuestion,
        answers: validAnswers.map((a, idx) => ({
          text: a.text,
          isCorrect: correctAnswerIndex !== null ? idx === correctAnswerIndex : (a.isCorrect || false)
        }))
      });
    }
  }

  return questions;
}

module.exports = router;

