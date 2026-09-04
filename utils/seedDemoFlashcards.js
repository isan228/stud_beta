const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  Test,
  Flashcard,
  FlashcardTagMap,
  QuestionTag
} = require('../models');
const { parseFlashcardsFromText } = require('./parseFlashcardsTxt');
const { normalizeTagName, slugifyTag } = require('./usmleTagNormalize');

const SAMPLE_PATH = path.join(__dirname, '../data/sample-usmle-flashcards.txt');

async function findOrCreateTagByName(rawName) {
  const name = normalizeTagName(String(rawName || '').trim());
  if (!name) return null;

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
    return existing;
  }

  try {
    return await QuestionTag.create({
      name,
      slug: slugifyTag(name),
      isActive: true
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return QuestionTag.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: name } },
            { slug: slugifyTag(name) }
          ]
        }
      });
    }
    throw error;
  }
}

async function syncFlashcardTag(flashcardId, tag) {
  if (!tag) return;
  await FlashcardTagMap.findOrCreate({
    where: { flashcardId, tagId: tag.id },
    defaults: { flashcardId, tagId: tag.id }
  });
}

/**
 * Загружает демо-flashcards из data/sample-usmle-flashcards.txt
 * @param {{ testId?: number|null, stepGroup?: string }} options
 */
async function seedDemoFlashcards(options = {}) {
  let testId = options.testId != null ? parseInt(options.testId, 10) : null;
  if (!Number.isFinite(testId) || testId <= 0) testId = null;

  const stepGroup = ['step1', 'step2', 'step3'].includes(options.stepGroup)
    ? options.stepGroup
    : 'step1';

  // Если testId не указан — карточки без привязки к банку (видны на всём Step)
  if (testId) {
    const test = await Test.findByPk(testId, {
      attributes: ['id', 'name', 'programType']
    });
    if (!test) {
      throw new Error(`Тест #${testId} не найден`);
    }
    if (test.programType !== 'usmle') {
      throw new Error('Демо flashcards можно привязать только к USMLE-тесту');
    }
  }

  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`Файл не найден: ${SAMPLE_PATH}`);
  }

  const text = fs.readFileSync(SAMPLE_PATH, 'utf8');
  const cards = parseFlashcardsFromText(text, { requireTopic: true });
  if (!cards.length) {
    throw new Error('Не удалось распарсить демо TXT flashcards');
  }

  let createdCount = 0;
  let updatedCount = 0;
  const topics = new Set();

  for (const card of cards) {
    const externalId = card.externalId ? String(card.externalId).trim() : '';
    const where = {
      stepGroup,
      isActive: true,
      programType: 'usmle',
      externalId: externalId || null
    };
    if (testId != null) where.testId = testId;
    else where.testId = null;

    let row = externalId
      ? await Flashcard.findOne({ where })
      : null;

    if (row) {
      row.frontText = card.frontText;
      row.backText = card.backText;
      row.keyword = card.keyword || null;
      row.programType = 'usmle';
      await row.save();
      updatedCount += 1;
    } else {
      const sortFromId = externalId && /^\d+$/.test(externalId)
        ? parseInt(externalId, 10)
        : undefined;
      row = await Flashcard.create({
        frontText: card.frontText,
        backText: card.backText,
        keyword: card.keyword || null,
        programType: 'usmle',
        testId,
        stepGroup,
        externalId: externalId || null,
        frontImageUrl: null,
        backImageUrl: null,
        isFree: false,
        sortOrder: Number.isFinite(sortFromId) ? sortFromId : 0,
        isActive: true
      });
      createdCount += 1;
    }

    if (card.topicName) {
      topics.add(card.topicName);
      const tag = await findOrCreateTagByName(card.topicName);
      await FlashcardTagMap.destroy({ where: { flashcardId: row.id } });
      await syncFlashcardTag(row.id, tag);
    }
  }

  return {
    createdCount,
    updatedCount,
    total: cards.length,
    testId,
    stepGroup,
    topics: [...topics]
  };
}

module.exports = {
  seedDemoFlashcards,
  SAMPLE_PATH
};
