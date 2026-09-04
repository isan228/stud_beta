const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Раздел / тематика университетских flashcards (колода в Browse/Study). */
const FlashcardTopic = sequelize.define('FlashcardTopic', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
    comment: 'Название раздела, например Анатомия'
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Universities', key: 'id' }
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
  tableName: 'FlashcardTopics',
  indexes: [
    { fields: ['universityId'] },
    { fields: ['isActive'] },
    { unique: true, fields: ['universityId', 'name'], name: 'flashcard_topics_uni_name_unique' }
  ]
});

module.exports = FlashcardTopic;
