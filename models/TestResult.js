const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TestResult = sequelize.define('TestResult', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  testId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Tests',
      key: 'id'
    }
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  totalQuestions: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  timeSpent: {
    type: DataTypes.INTEGER,
    comment: 'Время в секундах'
  },
  answers: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  questions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Детальная информация о вопросах для разбора'
  },
  results: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Результаты проверки каждого вопроса для разбора'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = TestResult;

