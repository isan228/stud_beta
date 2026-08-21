const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { Op } = require('sequelize');
const { Question, Answer, Test, QuestionTag, QuestionTagMap } = require('../models');
const { parseLinkedQuestionsFromText } = require('../utils/usmleLinkedQuestions');
const { extractTxtAnswers, mapAnswersWithCorrect, isValidCorrectIndex } = require('../utils/txtQuestionAnswers');

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

function slugifyTag(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `tag-${Date.now()}`;
}

function parseTagNames(raw) {
  if (raw == null) return [];
  return [...new Set(String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean))];
}

async function findOrCreateTagsByNames(tagNames) {
  const names = parseTagNames(Array.isArray(tagNames) ? tagNames.join(',') : tagNames);
  const result = [];
  for (const name of names) {
    const existing = await QuestionTag.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: name } },
          { slug: slugifyTag(name) }
        ]
      }
    });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
      }
      result.push(existing);
      continue;
    }
    try {
      const created = await QuestionTag.create({
        name,
        slug: slugifyTag(name),
        isActive: true
      });
      result.push(created);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        const again = await QuestionTag.findOne({
          where: {
            [Op.or]: [
              { name: { [Op.iLike]: name } },
              { slug: slugifyTag(name) }
            ]
          }
        });
        if (again) result.push(again);
      } else {
        throw error;
      }
    }
  }
  return result;
}

async function syncQuestionTagsByModels(questionId, tags) {
  await QuestionTagMap.destroy({ where: { questionId } });
  if (!tags.length) return [];
  for (const tag of tags) {
    await QuestionTagMap.findOrCreate({
      where: { questionId, tagId: tag.id },
      defaults: { questionId, tagId: tag.id }
    });
  }
  return tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
}

async function saveParsedQuestions(testId, questions, { perQuestionTags = false } = {}) {
  const createdQuestions = [];
  for (const q of questions) {
    const question = await Question.create({
      text: q.text,
      testId: parseInt(testId, 10),
      explanation: q.explanation || null
    });

    const createdAnswers = [];
    for (const answer of q.answers) {
      const row = await Answer.create({
        text: answer.text,
        isCorrect: answer.isCorrect,
        questionId: question.id
      });
      createdAnswers.push({
        id: row.id,
        text: row.text,
        isCorrect: Boolean(row.isCorrect),
        imageUrl: row.imageUrl || null
      });
    }

    let tags = [];
    if (perQuestionTags) {
      const tagModels = await findOrCreateTagsByNames(q.tagNames || []);
      tags = await syncQuestionTagsByModels(question.id, tagModels);
    }

    createdQuestions.push({
      id: question.id,
      text: question.text,
      explanation: question.explanation || null,
      imageUrl: question.imageUrl || null,
      answersCount: createdAnswers.length,
      hasExplanation: Boolean(q.explanation),
      answers: createdAnswers,
      tags
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

  if (parseOptions.requireUsmle && test.programType !== 'usmle') {
    res.status(400).json({ error: 'Загрузка с объяснениями и тегами доступна только для тестов USMLE' });
    return;
  }

  if (parseOptions.requireExplanation) {
    const { syncTestHasExplanations } = require('../utils/syncTestExplanations');
    await syncTestHasExplanations(test.id, true);
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
    const hint = parseOptions.requireExplanation && parseOptions.requireTags
      ? 'Проверьте формат: нужны поля ID, Q, A1–A30, Correct, E (объяснение), Subject (тема) и System (система). Теги через запятую.'
      : parseOptions.requireExplanation
        ? 'Проверьте формат: нужны поля ID, Q, A1–A30, Correct и E (объяснение).'
        : 'Проверьте формат: нужны поля ID, Q, A1–A30, Correct.';
    res.status(400).json({ error: `Не удалось найти вопросы в TXT. ${hint}` });
    return;
  }

  const createdQuestions = await saveParsedQuestions(testId, questions, {
    perQuestionTags: Boolean(parseOptions.requireTags || parseOptions.parseTags)
  });
  res.json({
    message: `Успешно загружено ${createdQuestions.length} вопросов`,
    questions: createdQuestions
  });
}

async function handleLinkedTxtUpload(req, res) {
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

  if (test.programType !== 'usmle') {
    res.status(400).json({ error: 'Связанные вопросы доступны только для тестов USMLE' });
    return;
  }

  const { syncTestHasExplanations } = require('../utils/syncTestExplanations');
  await syncTestHasExplanations(test.id, true);

  const text = req.file.buffer.toString('utf8');
  if (!text || text.trim().length === 0) {
    res.status(400).json({
      error: 'TXT файл пуст',
      message: 'Убедитесь, что файл содержит текст.'
    });
    return;
  }

  const questions = parseLinkedQuestionsFromText(text, {
    requireExplanation: true,
    requireTags: true,
    parseTags: true
  });

  if (questions.length === 0) {
    res.status(400).json({
      error: 'Не удалось найти связанные вопросы в TXT. Проверьте формат: GroupID, ID, Q, A1–A30, Correct, E, Subject, System.'
    });
    return;
  }

  const createdQuestions = await saveParsedQuestions(testId, questions, {
    perQuestionTags: true
  });

  res.json({
    message: `Успешно загружено ${createdQuestions.length} связанных USMLE вопросов`,
    questions: createdQuestions
  });
}

router.post('/upload-pdf', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleTxtUpload(req, res, { requireExplanation: false, parseTags: false });
  } catch (error) {
    console.error('Ошибка загрузки TXT:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
  }
});

router.post('/upload-txt-explained', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleTxtUpload(req, res, {
      requireExplanation: true,
      requireTags: true,
      requireUsmle: true,
      parseTags: true
    });
  } catch (error) {
    console.error('Ошибка загрузки TXT с объяснениями:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
  }
});

router.post('/upload-txt-linked', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleLinkedTxtUpload(req, res);
  } catch (error) {
    console.error('Ошибка загрузки связанных USMLE вопросов:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
  }
});

/**
 * Формат без объяснения: ID, Q, A1–A30, Correct
 * Формат USMLE с объяснением и тегами: + E и Tags (или T)
 */
function parseQuestionsFromText(text, options = {}) {
  const {
    requireExplanation = false,
    requireTags = false,
    parseTags = false
  } = options;
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

      const answers = extractTxtAnswers(block);

      if (answers.length < 2) {
        console.warn(`Вопрос ID ${idMatch[1]}: недостаточно ответов (минимум 2)`);
        continue;
      }

      const correctMatch = block.match(/"Correct"\s*:\s*"(\d+)"/);
      if (!correctMatch) {
        console.warn(`Вопрос ID ${idMatch[1]}: не найден правильный ответ`);
        continue;
      }

      if (!isValidCorrectIndex(answers, correctMatch[1])) {
        console.warn(`Вопрос ID ${idMatch[1]}: неверный индекс Correct`);
        continue;
      }

      const eMatch = block.match(/"E"\s*:\s*"([^"]+)"/);
      if (requireExplanation && !eMatch) {
        console.warn(`Вопрос ID ${idMatch[1]}: нет поля E (объяснение)`);
        continue;
      }

      const tagsMatch = block.match(/"(?:Tags|T|Tag)"\s*:\s*"([^"]+)"/i);
      const subjectMatch = block.match(/"Subject"\s*:\s*"([^"]+)"/i);
      const systemMatch = block.match(/"System"\s*:\s*"([^"]+)"/i);

      // Объединяем все источники тегов
      const rawTagStr = [
        tagsMatch ? tagsMatch[1] : '',
        subjectMatch ? subjectMatch[1] : '',
        systemMatch ? systemMatch[1] : ''
      ].filter(Boolean).join(',');

      const tagNames = parseTagNames(rawTagStr);
      if (requireTags && !tagNames.length) {
        console.warn(`Вопрос ID ${idMatch[1]}: нет поля Tags/Subject/System`);
        continue;
      }

      questions.push({
        text: questionText,
        explanation: eMatch ? eMatch[1] : null,
        tagNames: parseTags || requireTags ? tagNames : [],
        answers: mapAnswersWithCorrect(answers, correctMatch[1])
      });
    } catch (error) {
      console.error(`Ошибка парсинга блока ${i}:`, error);
    }
  }

  console.log(
    `Распарсено вопросов: ${questions.length}` +
    ` (объяснения: ${requireExplanation ? 'обязательны' : 'опционально'}` +
    `, теги: ${requireTags ? 'обязательны' : (parseTags ? 'опционально' : 'нет')})`
  );
  return questions;
}

module.exports = router;
