const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Может быть null для анонимных платежей
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  finikTransactionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  finikAccountId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  net: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'SUCCEEDED', 'FAILED'),
    defaultValue: 'PENDING',
    allowNull: false
  },
  transactionType: {
    type: DataTypes.ENUM('DEBIT', 'CREDIT'),
    allowNull: true
  },
  receiptNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  requestDate: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  transactionDate: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  itemId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  serviceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fields: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  rawPayload: {
    type: DataTypes.JSONB,
    allowNull: true // Для хранения полного payload от Finik
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

module.exports = Transaction;

