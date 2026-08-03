const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuestionTag = sequelize.define('QuestionTag', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Название тега USMLE, например Pathology'
  },
  slug: {
    type: DataTypes.STRING(120),
    allowNull: false,
    comment: 'URL/slug тега'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
  indexes: [
    { unique: true, fields: ['slug'], name: 'question_tags_slug_unique' },
    { unique: true, fields: ['name'], name: 'question_tags_name_unique' }
  ]
});

module.exports = QuestionTag;
