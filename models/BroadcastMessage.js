const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BroadcastMessage = sequelize.define('BroadcastMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  recipientCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'BroadcastMessages',
  indexes: [
    { fields: ['createdAt'] }
  ]
});

module.exports = BroadcastMessage;
