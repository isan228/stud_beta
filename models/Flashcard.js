const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Flashcard = sequelize.define('Flashcard', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  frontText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Вопрос с пропусками (______)'
  },
  backText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Полный ответ'
  },
  keyword: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Ключевое слово / тег внизу карточки'
  },
  frontImageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'URL изображения на лицевой стороне'
  },
  backImageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'URL изображения на обороте'
  },
  testId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Tests', key: 'id' }
  },
  stepGroup: {
    type: DataTypes.ENUM('step1', 'step2', 'step3'),
    allowNull: false,
    defaultValue: 'step1'
  },
  externalId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'ID из TXT — для обновления при повторной загрузке без дубликатов'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'Flashcards',
  indexes: [
    { fields: ['testId'] },
    { fields: ['stepGroup'] },
    { fields: ['isActive'] },
    { fields: ['testId', 'stepGroup', 'externalId'], name: 'flashcards_test_step_external' }
  ]
});

module.exports = Flashcard;
