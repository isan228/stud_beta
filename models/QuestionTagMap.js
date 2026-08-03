const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Связь вопрос ↔ тег (для USMLE) */
const QuestionTagMap = sequelize.define('QuestionTagMap', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Questions', key: 'id' }
  },
  tagId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'QuestionTags', key: 'id' }
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'QuestionTagMaps',
  indexes: [
    {
      unique: true,
      fields: ['questionId', 'tagId'],
      name: 'question_tag_maps_unique'
    }
  ]
});

module.exports = QuestionTagMap;
