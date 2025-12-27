const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const adminAuth = require('../middleware/adminAuth');
const { Question, Answer, Test } = require('../models');

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
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

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
  // Формат 1: Вопрос?\nA) Ответ\nB) Ответ\n...\nПравильный ответ: A
  // Формат 2: 1. Вопрос?\nA) Ответ\nB) Ответ\n...\nОтвет: A
  // Формат 3: Вопрос?\n1. Ответ\n2. Ответ\n...\nПравильный: 1

  // Разделяем текст на блоки по вопросам
  // Ищем паттерны: номер вопроса или просто вопрос с вариантами ответов
  const questionPatterns = [
    // Паттерн 1: Номер. Вопрос? ... Правильный ответ: X
    /(\d+[\.\)]\s*)(.+?)(?=\d+[\.\)]\s*|Правильный ответ:|Ответ:|$)/gis,
    // Паттерн 2: Вопрос? ... Правильный: X
    /([А-ЯЁ][^?]*\?)(.+?)(?=Правильный|Ответ:|$)/gis
  ];

  // Упрощенный парсинг - ищем вопросы с вариантами ответов
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentQuestion = null;
  let currentAnswers = [];
  let correctAnswer = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Определяем начало вопроса
    if (line.match(/^\d+[\.\)]\s*.+\?/) || (line.includes('?') && !line.match(/^[A-D][\.\)]/))) {
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
      correctAnswer = null;
    }
    // Определяем вариант ответа
    else if (line.match(/^[A-D][\.\)]\s*/) || line.match(/^\d+[\.\)]\s*/)) {
      const answerText = line.replace(/^[A-D][\.\)]\s*/, '').replace(/^\d+[\.\)]\s*/, '');
      const letter = line.match(/^([A-D])/)?.[1] || null;
      
      currentAnswers.push({
        text: answerText,
        letter: letter,
        isCorrect: false
      });
    }
    // Определяем правильный ответ
    else if (line.match(/Правильный ответ:|Ответ:|Правильный:/i)) {
      const match = line.match(/([A-D]|\d+)/i);
      if (match) {
        correctAnswer = match[1].toUpperCase();
        
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

  // Сохраняем последний вопрос
  if (currentQuestion && currentAnswers.length > 0) {
    questions.push({
      text: currentQuestion,
      answers: currentAnswers.map(a => ({
        text: a.text,
        isCorrect: a.isCorrect || false
      }))
    });
  }

  // Если не удалось распарсить автоматически, возвращаем пустой массив
  // Админ может загрузить вопросы вручную
  return questions;
}

module.exports = router;

