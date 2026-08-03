const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Test = sequelize.define('Test', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Subjects',
      key: 'id'
    }
  },
  universityId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Universities',
      key: 'id'
    },
    comment: 'Университет (для programType=university)'
  },
  programType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'university',
    comment: 'university | usmle'
  },
  isFree: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'Бесплатный тест для неавторизованных пользователей'
  },
  hasExplanations: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'В тесте есть пояснения к ответам (показ в конце или в режиме «Ответы сразу»)'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = Test;

