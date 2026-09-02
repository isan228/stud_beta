const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FlashcardTagMap = sequelize.define('FlashcardTagMap', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  flashcardId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Flashcards', key: 'id' }
  },
  tagId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'QuestionTags', key: 'id' }
  }
}, {
  tableName: 'FlashcardTagMaps',
  indexes: [
    {
      unique: true,
      fields: ['flashcardId', 'tagId'],
      name: 'flashcard_tag_maps_unique'
    }
  ]
});

module.exports = FlashcardTagMap;
