const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { Question, Answer, Test } = require('../models');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Только TXT файлы разрешены'), false);
    }
  }
});

async function saveParsedQuestions(testId, questions) {
  const createdQuestions = [];
  for (const q of questions) {
    const question = await Question.create({
      text: q.text,
      testId: parseInt(testId, 10),
      explanation: q.explanation || null
    });

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
      answersCount: q.answers.length,
      hasExplanation: Boolean(q.explanation)
    });
  }
  return createdQuestions;
}

async function handleTxtUpload(req, res, parseOptions) {
  if (!req.file) {
    res.status(400).json({ error: 'TXT файл не загружен' });
    return;
  }

  const { testId } = req.body;
  if (!testId) {
    res.status(400).json({ error: 'ID теста обязателен' });
    return;
  }

  const test = await Test.findByPk(testId);
  if (!test) {
    res.status(404).json({ error: 'Тест не найден' });
    return;
  }

  const text = req.file.buffer.toString('utf8');
  if (!text || text.trim().length === 0) {
    res.status(400).json({
      error: 'TXT файл пуст',
      message: 'Убедитесь, что файл содержит текст.'
    });
    return;
  }

  const questions = parseQuestionsFromText(text, parseOptions);
  if (questions.length === 0) {
    const hint = parseOptions.requireExplanation
      ? 'Проверьте формат: нужны поля ID, Q, A1–A5, Correct и E (объяснение).'
      : 'Проверьте формат: нужны поля ID, Q, A1–A5, Correct.';
    res.status(400).json({ error: `Не удалось найти вопросы в TXT. ${hint}` });
    return;
  }

  const createdQuestions = await saveParsedQuestions(testId, questions);
  res.json({
    message: `Успешно загружено ${createdQuestions.length} вопросов`,
    questions: createdQuestions
  });
}

router.post('/upload-pdf', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleTxtUpload(req, res, { requireExplanation: false });
  } catch (error) {
    console.error('Ошибка загрузки TXT:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
  }
});

router.post('/upload-txt-explained', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleTxtUpload(req, res, { requireExplanation: true });
  } catch (error) {
    console.error('Ошибка загрузки TXT с объяснениями:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
  }
});

/**
 * Формат без объяснения: ID, Q, A1–A5, Correct
 * Формат с объяснением: + поле E (обязательно при upload-txt-explained)
 */
function parseQuestionsFromText(text, options = {}) {
  const { requireExplanation = false } = options;
  const questions = [];
  const blocks = text.split(/"ID"\s*:\s*"/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    try {
      const idMatch = block.match(/^(\d+)"/);
      if (!idMatch) continue;

      const qMatch = block.match(/"Q"\s*:\s*"([^"]+)"/);
      if (!qMatch) continue;
      const questionText = qMatch[1];

      const answers = [];
      for (let j = 1; j <= 5; j++) {
        const aMatch = block.match(new RegExp(`"A${j}"\\s*:\\s*"([^"]+)"`));
        if (aMatch) {
          answers.push({ text: aMatch[1], index: j });
        }
      }

      if (answers.length < 2) {
        console.warn(`Вопрос ID ${idMatch[1]}: недостаточно ответов (минимум 2)`);
        continue;
      }

      const correctMatch = block.match(/"Correct"\s*:\s*"(\d+)"/);
      if (!correctMatch) {
        console.warn(`Вопрос ID ${idMatch[1]}: не найден правильный ответ`);
        continue;
      }

      const correctIndex = parseInt(correctMatch[1], 10) - 1;
      if (correctIndex < 0 || correctIndex >= answers.length) {
        console.warn(`Вопрос ID ${idMatch[1]}: неверный индекс Correct`);
        continue;
      }

      const eMatch = block.match(/"E"\s*:\s*"([^"]+)"/);
      if (requireExplanation && !eMatch) {
        console.warn(`Вопрос ID ${idMatch[1]}: нет поля E (объяснение)`);
        continue;
      }

      questions.push({
        text: questionText,
        explanation: eMatch ? eMatch[1] : null,
        answers: answers.map((a, idx) => ({
          text: a.text,
          isCorrect: idx === correctIndex
        }))
      });
    } catch (error) {
      console.error(`Ошибка парсинга блока ${i}:`, error);
    }
  }

  console.log(`Распарсено вопросов: ${questions.length} (объяснения: ${requireExplanation ? 'обязательны' : 'опционально'})`);
  return questions;
}

module.exports = router;
