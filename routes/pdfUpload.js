const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { Op } = require('sequelize');
const { Question, Answer, Test, QuestionTag, QuestionTagMap, Flashcard, FlashcardTagMap, FlashcardTopic, Subject, University } = require('../models');
const { parseLinkedQuestionsFromText } = require('../utils/usmleLinkedQuestions');
const { parseFlashcardsFromText } = require('../utils/parseFlashcardsTxt');
const { extractTxtAnswers, mapAnswersWithCorrect, isValidCorrectIndex, extractQuotedField, normalizeTxt } = require('../utils/txtQuestionAnswers');
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

async function findOrCreateUniFlashcardTopic(universityId, rawName) {
  const name = String(rawName || '').trim();
  if (!name || !universityId) return null;
  let topic = await FlashcardTopic.findOne({
    where: {
      universityId,
      name: { [Op.iLike]: name }
    }
  });
  if (topic) {
    if (!topic.isActive) {
      topic.isActive = true;
      await topic.save();
    }
    return topic;
  }
  try {
    return await FlashcardTopic.create({
      name,
      universityId,
      sortOrder: 0,
      isActive: true
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return FlashcardTopic.findOne({
        where: { universityId, name: { [Op.iLike]: name } }
      });
    }
    throw error;
  }
}

async function saveParsedFlashcards(cards, { testId, stepGroup = 'step1' } = {}) {
  const parsedTestId = testId ? parseInt(testId, 10) : null;
  const normalizedStep = ['step1', 'step2', 'step3'].includes(stepGroup) ? stepGroup : 'step1';
  const scopeWhere = {
    programType: 'usmle',
    stepGroup: normalizedStep,
    isActive: true,
    testId: Number.isFinite(parsedTestId) ? parsedTestId : null
  };

  let nextSortOrder = await Flashcard.max('sortOrder', { where: scopeWhere });
  nextSortOrder = Number.isFinite(nextSortOrder) ? nextSortOrder + 1 : 0;

  const savedCards = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const card of cards) {
    const externalId = card.externalId != null ? String(card.externalId).trim() : '';
    const payload = {
      frontText: card.frontText,
      backText: card.backText,
      keyword: card.keyword || null,
      programType: 'usmle',
      universityId: null,
      subjectId: null,
      topicId: null,
      testId: scopeWhere.testId,
      stepGroup: normalizedStep,
      isFree: false,
      isActive: true
    };

    let row = null;
    let wasUpdated = false;
    if (externalId) {
      row = await Flashcard.findOne({
        where: { ...scopeWhere, externalId }
      });
    }

    if (row) {
      row.frontText = payload.frontText;
      row.backText = payload.backText;
      row.keyword = payload.keyword;
      row.programType = 'usmle';
      await row.save();
      wasUpdated = true;
      updatedCount++;
    } else {
      const sortFromId = externalId && /^\d+$/.test(externalId) ? parseInt(externalId, 10) : null;
      row = await Flashcard.create({
        ...payload,
        externalId: externalId || null,
        frontImageUrl: null,
        backImageUrl: null,
        sortOrder: Number.isFinite(sortFromId) ? sortFromId : nextSortOrder++
      });
      createdCount++;
    }

    let tags = [];
    if (card.topicName) {
      const tagModels = await findOrCreateTagsByNames([card.topicName]);
      tags = await syncFlashcardTagsByModels(row.id, tagModels);
    }

    savedCards.push({
      id: row.id,
      externalId: row.externalId,
      frontText: row.frontText,
      backText: row.backText,
      keyword: row.keyword,
      frontImageUrl: row.frontImageUrl,
      backImageUrl: row.backImageUrl,
      topicName: card.topicName || null,
      tags,
      updated: wasUpdated
    });
  }

  return { cards: savedCards, createdCount, updatedCount };
}

async function saveParsedUniversityFlashcards(cards, {
  universityId,
  subjectId = null,
  isFree = false
} = {}) {
  const uniId = parseInt(universityId, 10);
  const subjId = subjectId ? parseInt(subjectId, 10) : null;
  if (!Number.isFinite(uniId) || uniId <= 0) {
    throw new Error('Укажите университет');
  }

  const scopeWhere = {
    programType: 'university',
    universityId: uniId,
    isActive: true
  };

  let nextSortOrder = await Flashcard.max('sortOrder', { where: scopeWhere });
  nextSortOrder = Number.isFinite(nextSortOrder) ? nextSortOrder + 1 : 0;

  const savedCards = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const card of cards) {
    const externalId = card.externalId != null ? String(card.externalId).trim() : '';
    const topic = card.topicName
      ? await findOrCreateUniFlashcardTopic(uniId, card.topicName)
      : null;

    const payload = {
      frontText: card.frontText,
      backText: card.backText,
      keyword: card.keyword || null,
      programType: 'university',
      universityId: uniId,
      subjectId: Number.isFinite(subjId) ? subjId : null,
      topicId: topic?.id || null,
      testId: null,
      stepGroup: null,
      isFree: !!isFree,
      isActive: true
    };

    let row = null;
    let wasUpdated = false;
    if (externalId) {
      row = await Flashcard.findOne({
        where: { ...scopeWhere, externalId }
      });
    }

    if (row) {
      Object.assign(row, payload);
      await row.save();
      wasUpdated = true;
      updatedCount++;
    } else {
      const sortFromId = externalId && /^\d+$/.test(externalId) ? parseInt(externalId, 10) : null;
      row = await Flashcard.create({
        ...payload,
        externalId: externalId || null,
        frontImageUrl: null,
        backImageUrl: null,
        sortOrder: Number.isFinite(sortFromId) ? sortFromId : nextSortOrder++
      });
      createdCount++;
    }

    savedCards.push({
      id: row.id,
      externalId: row.externalId,
      frontText: row.frontText,
      backText: row.backText,
      keyword: row.keyword,
      topicName: topic?.name || card.topicName || null,
      topicId: row.topicId,
      subjectId: row.subjectId,
      updated: wasUpdated
    });
  }

  return { cards: savedCards, createdCount, updatedCount };
}

async function handleFlashcardsTxtUpload(req, res) {
  if (!req.file) {
    res.status(400).json({ error: 'TXT файл не загружен' });
    return;
  }

  const programType = String(req.body.programType || 'usmle').toLowerCase() === 'university'
    ? 'university'
    : 'usmle';

  if (programType === 'university') {
    const universityId = parseInt(req.body.universityId, 10);
    const subjectId = req.body.subjectId ? parseInt(req.body.subjectId, 10) : null;
    const isFree = req.body.isFree === true || req.body.isFree === 'true' || req.body.isFree === '1';

    if (!Number.isFinite(universityId) || universityId <= 0) {
      res.status(400).json({ error: 'Выберите университет' });
      return;
    }
    const uni = await University.findByPk(universityId);
    if (!uni) {
      res.status(404).json({ error: 'Университет не найден' });
      return;
    }

    let defaultTopic = null;
    if (Number.isFinite(subjectId) && subjectId > 0) {
      const subject = await Subject.findByPk(subjectId);
      if (!subject || subject.programType !== 'university' || Number(subject.universityId) !== universityId) {
        res.status(400).json({ error: 'Предмет не найден для этого университета' });
        return;
      }
      defaultTopic = subject.name;
    }

    const text = req.file.buffer.toString('utf8');
    if (!text || text.trim().length === 0) {
      res.status(400).json({ error: 'TXT файл пуст', message: 'Убедитесь, что файл содержит текст.' });
      return;
    }

    const cards = parseFlashcardsFromText(text, {
      requireTopic: !defaultTopic,
      defaultTopic: defaultTopic || null
    });
    const stats = cards._parseStats || {};
    if (cards.length === 0) {
      let hint = 'Нужны поля "ID", "Front", "Back". Тема: === Раздел === или поле Topic.';
      if (stats.idBlocks === 0) {
        hint = 'В файле не найдено ни одного "ID":"...". Проверьте кавычки и формат.';
      } else if (stats.missingFrontBack > 0 && stats.accepted === 0) {
        hint = `Найдено блоков ID: ${stats.idBlocks}, но нет пар Front/Back (можно Q/A).`;
      } else if (stats.missingTopic > 0 && stats.accepted === 0) {
        hint = 'Укажите темы через === Раздел === или выберите предмет (станет темой по умолчанию).';
      }
      res.status(400).json({ error: `Не удалось найти flashcards в TXT. ${hint}`, stats });
      return;
    }

    const { cards: savedCards, createdCount, updatedCount } = await saveParsedUniversityFlashcards(cards, {
      universityId,
      subjectId: Number.isFinite(subjectId) ? subjectId : null,
      isFree
    });
    const parts = [`${savedCards.length} flashcards`];
    if (createdCount) parts.push(`${createdCount} новых`);
    if (updatedCount) parts.push(`${updatedCount} обновлено`);
    res.json({
      message: `Успешно: ${parts.join(', ')}`,
      cards: savedCards,
      createdCount,
      updatedCount
    });
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
  const stats = cards._parseStats || {};
  if (cards.length === 0) {
    let hint = 'Нужны поля "ID", "Front", "Back" и тема.';
    if (stats.idBlocks === 0) {
      hint = 'В файле не найдено ни одного "ID":"...". Проверьте кавычки и формат.';
    } else if (stats.missingFrontBack > 0 && stats.accepted === 0) {
      hint = `Найдено блоков ID: ${stats.idBlocks}, но нет пар Front/Back (можно Q/A).`;
    } else if (stats.missingTopic > 0 && stats.accepted === 0) {
      hint = `Найдены карточки (${stats.idBlocks}), но без темы. Добавьте секцию === Topic === или поле "Topic":"...".`;
    }
    res.status(400).json({
      error: `Не удалось найти flashcards в TXT. ${hint}`,
      stats
    });
    return;
  }

  const { cards: savedCards, createdCount, updatedCount } = await saveParsedFlashcards(cards, { testId, stepGroup });
  const parts = [`${savedCards.length} flashcards`];
  if (createdCount) parts.push(`${createdCount} новых`);
  if (updatedCount) parts.push(`${updatedCount} обновлено`);
  res.json({
    message: `Успешно: ${parts.join(', ')}`,
    cards: savedCards,
    createdCount,
    updatedCount
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

  const text = normalizeTxt(req.file.buffer.toString('utf8'));
  if (!text || text.trim().length === 0) {
    res.status(400).json({
      error: 'TXT файл пуст',
      message: 'Убедитесь, что файл содержит текст.'
    });
    return;
  }

  const questions = parseQuestionsFromText(text, parseOptions);
  const stats = questions._parseStats || {};
  if (questions.length === 0) {
    let hint = parseOptions.requireExplanation && parseOptions.requireTags
      ? 'Нужны поля ID, Q, A1–A30, Correct, E, Subject/System/Tags.'
      : parseOptions.requireExplanation
        ? 'Нужны поля ID, Q, A1–A30, Correct и E (объяснение).'
        : 'Нужны поля ID, Q, A1–A30, Correct.';
    if (stats.idBlocks === 0) {
      hint = 'В файле не найдено ни одного "ID":"...". Проверьте кавычки.';
    } else if (stats.missingQ > 0 && stats.accepted === 0) {
      hint = `Найдено блоков ID: ${stats.idBlocks}, но нет поля "Q".`;
    } else if (stats.missingAnswers > 0 && stats.accepted === 0) {
      hint = `Найдено блоков ID: ${stats.idBlocks}, но мало ответов A1/A2… (нужно ≥ 2).`;
    } else if (stats.missingCorrect > 0 && stats.accepted === 0) {
      hint = `Найдено блоков ID: ${stats.idBlocks}, но нет/неверный "Correct".`;
    } else if (stats.missingExplanation > 0 && stats.accepted === 0) {
      hint = `Найдено вопросов без поля "E" (объяснение): ${stats.missingExplanation}.`;
    } else if (stats.missingTags > 0 && stats.accepted === 0) {
      hint = `Найдено вопросов без темы/тегов (Subject/System/Tags): ${stats.missingTags}.`;
    }
    res.status(400).json({ error: `Не удалось найти вопросы в TXT. ${hint}`, stats });
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

  const text = normalizeTxt(req.file.buffer.toString('utf8'));
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

/** Обычные вопросы: TXT с объяснениями, без тегов */
router.post('/upload-txt-explanations', adminAuth, upload.single('pdf'), async (req, res) => {
  try {
    await handleTxtUpload(req, res, {
      requireExplanation: true,
      requireTags: false,
      requireUsmle: false,
      parseTags: false
    });
  } catch (error) {
    console.error('Ошибка загрузки TXT с объяснениями (обычные):', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки TXT файла' });
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
 * Формат USMLE с объяснением и тегами: + E и Tags/Subject/System
 */
function parseQuestionsFromText(text, options = {}) {
  const {
    requireExplanation = false,
    requireTags = false,
    parseTags = false
  } = options;
  const questions = [];
  const stats = {
    idBlocks: 0,
    missingQ: 0,
    missingAnswers: 0,
    missingCorrect: 0,
    missingExplanation: 0,
    missingTags: 0,
    accepted: 0
  };

  const prepared = normalizeTxt(text);
  const blocks = prepared.split(/"ID"\s*:\s*"/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    stats.idBlocks++;

    try {
      const idMatch = block.match(/^([^"]+)"/);
      if (!idMatch) continue;
      const externalId = String(idMatch[1] || '').trim();

      const questionText = extractQuotedField(block, 'Q');
      if (!questionText) {
        stats.missingQ++;
        continue;
      }

      const answers = extractTxtAnswers(block);
      if (answers.length < 2) {
        stats.missingAnswers++;
        console.warn(`Вопрос ID ${externalId}: недостаточно ответов (минимум 2)`);
        continue;
      }

      const correctRaw = extractQuotedField(block, 'Correct');
      if (!correctRaw || !isValidCorrectIndex(answers, correctRaw)) {
        stats.missingCorrect++;
        console.warn(`Вопрос ID ${externalId}: нет/неверный Correct`);
        continue;
      }

      const explanation = extractQuotedField(block, 'E');
      if (requireExplanation && !explanation) {
        stats.missingExplanation++;
        console.warn(`Вопрос ID ${externalId}: нет поля E (объяснение)`);
        continue;
      }

      const rawTagStr = [
        extractQuotedField(block, 'Tags') || '',
        extractQuotedField(block, 'T') || '',
        extractQuotedField(block, 'Tag') || '',
        extractQuotedField(block, 'Subject') || '',
        extractQuotedField(block, 'System') || ''
      ].filter(Boolean).join(',');

      const tagNames = parseTagNames(rawTagStr);
      if (requireTags && !tagNames.length) {
        stats.missingTags++;
        console.warn(`Вопрос ID ${externalId}: нет поля Tags/Subject/System`);
        continue;
      }

      questions.push({
        text: questionText,
        explanation: explanation || null,
        tagNames: parseTags || requireTags ? tagNames : [],
        answers: mapAnswersWithCorrect(answers, correctRaw)
      });
      stats.accepted++;
    } catch (error) {
      console.error(`Ошибка парсинга блока ${i}:`, error);
    }
  }

  console.log(
    `Распарсено вопросов: ${questions.length}` +
    ` (блоков ID: ${stats.idBlocks}, без Q: ${stats.missingQ}, без ответов: ${stats.missingAnswers}` +
    `, без Correct: ${stats.missingCorrect}, без E: ${stats.missingExplanation}, без тегов: ${stats.missingTags})`
  );
  questions._parseStats = stats;
  return questions;
}

module.exports = router;
