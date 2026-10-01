const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TelegramLink = sequelize.define('TelegramLink', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  chatId: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
    comment: 'Telegram chat_id личного чата с ботом — один Telegram на один аккаунт'
  },
  tgUsername: {
    type: DataTypes.STRING(64),
    allowNull: true
  }
}, {
  tableName: 'TelegramLinks'
});

module.exports = TelegramLink;
