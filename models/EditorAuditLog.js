const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EditorAuditLog = sequelize.define('EditorAuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  actorType: {
    type: DataTypes.ENUM('editor', 'admin'),
    allowNull: false
  },
  actorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  actorUsername: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  action: {
    type: DataTypes.ENUM('create', 'update', 'delete', 'error_report'),
    allowNull: false
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  testId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  testName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  questionTextBefore: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  questionTextAfter: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  updatedAt: false,
  indexes: [
    { fields: ['createdAt'] },
    { fields: ['actorType', 'actorId'] },
    { fields: ['questionId'] }
  ]
});

module.exports = EditorAuditLog;
