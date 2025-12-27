const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserStats = sequelize.define('UserStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  totalTestsCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalQuestionsAnswered: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  correctAnswers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  currentStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Текущая серия дней'
  },
  longestStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Самая длинная серия дней'
  },
  lastActivityDate: {
    type: DataTypes.DATE
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

module.exports = UserStats;

