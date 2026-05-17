const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserBroadcastNotification = sequelize.define('UserBroadcastNotification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  broadcastMessageId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  dismissedByUser: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'UserBroadcastNotifications',
  indexes: [
    { fields: ['userId'] },
    { fields: ['userId', 'dismissedByUser'] },
    { fields: ['broadcastMessageId'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = UserBroadcastNotification;
