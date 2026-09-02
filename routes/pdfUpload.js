const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { Op } = require('sequelize');
const { Question, Answer, Test, QuestionTag, QuestionTagMap, Flashcard, FlashcardTagMap } = require('../models');
const { parseLinkedQuestionsFromText } = require('../utils/usmleLinkedQuestions');
const { parseFlashcardsFromText } = require('../utils/parseFlashcardsTxt');
const { parseFlashcardsImagesFromText } = require('../utils/parseFlashcardsImagesTxt');
const {
  isAllowedImageMime,
  saveFlashcardImageBuffer,
  imageBasenameKey
} = require('../utils/flashcardImages');
const { extractTxtAnswers, mapAnswersWithCorrect, isValidCorrectIndex } = require('../utils/txtQuestionAnswers');
const { normalizeTagName, slugifyTag } = require('../utils/usmleTagNormalize');

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

const flashcardsImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf') {
      if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
        cb(null, true);
      } else {
        cb(new Error('TXT: только .txt файлы'), false);
      }
      return;
    }
    if (file.fieldname === 'images') {
      const extOk = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname || '');
      if (isAllowedImageMime(file.mimetype) || extOk) {
        cb(null, true);
      } else {
        cb(new Error('Картинки: только JPG, PNG, GIF, WEBP'), false);
      }
      return;
    }
    cb(new Error('Недопустимое поле файла'), false);
  }
}).fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'images', maxCount: 500 }
]);

function buildFlashcardImageFileMap(files) {
  const map = new Map();
  for (const file of files || []) {
    map.set(imageBasenameKey(file.originalname), file);
  }
  return map;
}

function resolveFlashcardImageUrls(card, imageFileMap, flashcardId) {
  let frontImageUrl = null;
  let backImageUrl = null;

  if (card.frontImageFile) {
    const file = imageFileMap.get(imageBasenameKey(card.frontImageFile));
    if (file) {
      frontImageUrl = saveFlashcardImageBuffer(flashcardId, 'front', file);
    } else {
      console.warn(`Flashcard ID ${card.externalId}: файл FrontImage не найден: ${card.frontImageFile}`);
    }
  }

  if (card.backImageFile) {
    const file = imageFileMap.get(imageBasenameKey(card.backImageFile));
    if (file) {
      backImageUrl = saveFlashcardImageBuffer(flashcardId, 'back', file);
    } else {
      console.warn(`Flashcard ID ${card.externalId}: файл BackImage не найден: ${card.backImageFile}`);
    }
  }

  return { frontImageUrl, backImageUrl };
}

function parseTagNames(raw) {
  if (raw == null) return [];
  return [...new Set(String(raw)
    .split(/[,;|]/)
    .map((s) => normalizeTagName(s.trim()))
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

async function syncFlashcardTagsByModels(flashcardId, tags) {
  await FlashcardTagMap.destroy({ where: { flashcardId } });
  if (!tags.length) return [];
  for (const tag of tags) {
    await FlashcardTagMap.findOrCreate({
      where: { flashcardId, tagId: tag.id },
      defaults: { flashcardId, tagId: tag.id }
    });
  }
  return tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
}

async function saveParsedFlashcards(cards, { testId, stepGroup = 'step1', imageFileMap = null } = {}) {
  const parsedTestId = testId ? parseInt(testId, 10) : null;
  const createdCards = [];
  let sortOrder = 0;

  for (const card of cards) {
    const row = await Flashcard.create({
      frontText: card.frontText,
      backText: card.backText,
      keyword: card.keyword || null,
      frontImageUrl: null,
      backImageUrl: null,
      testId: Number.isFinite(parsedTestId) ? parsedTestId : null,
      stepGroup: ['step1', 'step2', 'step3'].includes(stepGroup) ? stepGroup : 'step1',
      sortOrder: sortOrder++,
      isActive: true
    });

    if (imageFileMap) {
      const { frontImageUrl, backImageUrl } = resolveFlashcardImageUrls(card, imageFileMap, row.id);
      if (frontImageUrl || backImageUrl) {
        row.frontImageUrl = frontImageUrl;
        row.backImageUrl = backImageUrl;
        await row.save();
      }
    }

    let tags = [];
    if (card.topicName) {
      const tagModels = await findOrCreateTagsByNames([card.topicName]);
      tags = await syncFlashcardTagsByModels(row.id, tagModels);
    }

    createdCards.push({
      id: row.id,
      frontText: row.frontText,
      backText: row.backText,
      keyword: row.keyword,
      frontImageUrl: row.frontImageUrl,
      backImageUrl: row.backImageUrl,
      topicName: card.topicName || null,
      tags
    });
  }

  return createdCards;
}

async function handleFlashcardsTxtUpload(req, res) {
  if (!req.file) {
    res.status(400).json({ error: 'TXT файл не загружен' });
    return;
  }

  const { testId, stepGroup } = req.body;
  if (testId) {
    const test = await Test.findByPk(testId);
    if (!test) {
      res.status(404).json({ error: 'Тест не найден' });
      return;
    }
    if (test.programType !== 'usmle') {
      res.status(400).json({ error: 'Flashcards доступны только для тестов USMLE' });
      return;
    }
  }

  const text = req.file.buffer.toString('utf8');
  if (!text || text.trim().length === 0) {
    res.status(400).json({
      error: 'TXT файл пуст',
      message: 'Убедитесь, что файл содержит текст.'
    });
    return;
  }

  const cards = parseFlashcardsFromText(text, { requireTopic: true });
  if (cards.length === 0) {
    res.status(400).json({
      error: 'Не удалось найти flashcards в TXT. Проверьте формат: секция темы (=== ... ===), поля ID, Front, Back и Topic или секция.'
    });
    return;
  }

  const createdCards = await saveParsedFlashcards(cards, { testId, stepGroup });
  res.json({
    message: `Успешно загружено ${createdCards.length} flashcards`,
    cards: createdCards
  });
}

async function handleFlashcardsWithImagesTxtUpload(req, res) {
  const txtFile = req.files?.pdf?.[0];
  if (!txtFile) {
    res.status(400).json({ error: 'TXT файл не загружен' });
    return;
  }

  const imageFiles = req.files?.images || [];
  if (!imageFiles.length) {
    res.status(400).json({ error: 'Загрузите файлы картинок вместе с TXT' });
    return;
  }

  const { testId, stepGroup } = req.body;
  if (testId) {
    const test = await Test.findByPk(testId);
    if (!test) {
      res.status(404).json({ error: 'Тест не найден' });
      return;
    }
    if (test.programType !== 'usmle') {
      res.status(400).json({ error: 'Flashcards доступны только для тестов USMLE' });
      return;
    }
  }

  const text = txtFile.buffer.toString('utf8');
  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: 'TXT файл пуст' });
    return;
  }

  const cards = parseFlashcardsImagesFromText(text, { requireTopic: true });
  if (cards.length === 0) {
    res.status(400).json({
      error: 'Не удалось найти flashcards в TXT. Нужны секция темы, ID, Front, Back и поля FrontImage/BackImage/Image с именами файлов.'
    });
    return;
  }

  const hasImageRefs = cards.some((c) => c.frontImageFile || c.backImageFile);
  if (!hasImageRefs) {
    res.status(400).json({
      error: 'В TXT нет ссылок на картинки (FrontImage, BackImage или Image). Для карточек без фото используйте обычную загрузку TXT flashcards.'
    });
    return;
  }

  const imageFileMap = buildFlashcardImageFileMap(imageFiles);
  const createdCards = await saveParsedFlashcards(cards, { testId, stepGroup, imageFileMap });
  res.json({
    message: `Успешно загружено ${createdCards.length} flashcards с картинками`,
    cards: createdCards
  });
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

router.post('/upload-txt-flashcards-images', adminAuth, (req, res, next) => {
  flashcardsImagesUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файлов' });
    }
    next();
  });
}, async (req, res) => {
  try {
    await handleFlashcardsWithImagesTxtUpload(req, res);
  } catch (error) {
    console.error('Ошибка загрузки TXT flashcards с картинками:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT flashcards с картинками' });
  }
});

router.post('/upload-txt-flashcards', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleFlashcardsTxtUpload(req, res);
  } catch (error) {
    console.error('Ошибка загрузки TXT flashcards:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT flashcards' });
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
