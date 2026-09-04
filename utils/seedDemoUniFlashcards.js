const { Op } = require('sequelize');
const { Flashcard, FlashcardTopic, University } = require('../models');

const DEMO_TOPICS = [
  { name: 'Анатомия', sortOrder: 1 },
  { name: 'Физиология', sortOrder: 2 }
];

const DEMO_CARDS = [
  {
    topicName: 'Анатомия',
    externalId: 'kgma-demo-anat-1',
    frontText: 'Самая крупная артерия организма человека — ______.',
    backText: 'Самая крупная артерия организма человека — аорта.',
    isFree: true,
    sortOrder: 1
  },
  {
    topicName: 'Анатомия',
    externalId: 'kgma-demo-anat-2',
    frontText: 'Сколько пар черепных нервов у человека?',
    backText: '12 пар черепных нервов.',
    isFree: true,
    sortOrder: 2
  },
  {
    topicName: 'Физиология',
    externalId: 'kgma-demo-phys-1',
    frontText: 'Нормальная частота сердечных сокращений в покое у взрослого — около ______ уд/мин.',
    backText: 'Нормальная частота сердечных сокращений в покое у взрослого — около 60–80 уд/мин.',
    isFree: true,
    sortOrder: 1
  },
  {
    topicName: 'Физиология',
    externalId: 'kgma-demo-phys-2',
    frontText: 'Гормон, снижающий уровень глюкозы в крови, — ______.',
    backText: 'Гормон, снижающий уровень глюкозы в крови, — инсулин.',
    isFree: false,
    sortOrder: 2
  }
];

/**
 * Создаёт демо-разделы и карточки для КГМА (идемпотентно по externalId).
 * @param {{ universityId?: number }} [options]
 */
async function seedDemoUniFlashcards(options = {}) {
  let universityId = options.universityId != null ? parseInt(options.universityId, 10) : null;
  let uni = null;

  if (Number.isFinite(universityId) && universityId > 0) {
    uni = await University.findByPk(universityId);
  }
  if (!uni) {
    uni = await University.findOne({ where: { shortName: 'КГМА' } });
  }
  if (!uni) {
    return { createdCount: 0, updatedCount: 0, topicsCreated: 0, skipped: true, reason: 'КГМА не найдена' };
  }
  universityId = uni.id;

  const topicByName = new Map();
  let topicsCreated = 0;
  for (const t of DEMO_TOPICS) {
    let topic = await FlashcardTopic.findOne({
      where: {
        universityId,
        name: { [Op.iLike]: t.name }
      }
    });
    if (!topic) {
      topic = await FlashcardTopic.create({
        name: t.name,
        universityId,
        sortOrder: t.sortOrder,
        isActive: true
      });
      topicsCreated += 1;
    } else if (!topic.isActive) {
      topic.isActive = true;
      topic.sortOrder = t.sortOrder;
      await topic.save();
    }
    topicByName.set(t.name, topic);
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const demo of DEMO_CARDS) {
    const topic = topicByName.get(demo.topicName);
    const payload = {
      frontText: demo.frontText,
      backText: demo.backText,
      programType: 'university',
      universityId,
      topicId: topic?.id || null,
      subjectId: null,
      testId: null,
      stepGroup: null,
      isFree: !!demo.isFree,
      externalId: demo.externalId,
      sortOrder: demo.sortOrder,
      isActive: true,
      keyword: null
    };

    const existing = await Flashcard.findOne({
      where: {
        programType: 'university',
        universityId,
        externalId: demo.externalId
      }
    });

    if (existing) {
      await existing.update(payload);
      updatedCount += 1;
    } else {
      await Flashcard.create(payload);
      createdCount += 1;
    }
  }

  return { createdCount, updatedCount, topicsCreated, universityId, skipped: false };
}

module.exports = { seedDemoUniFlashcards, DEMO_TOPICS, DEMO_CARDS };
