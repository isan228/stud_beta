const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserDeviceAlert = sequelize.define('UserDeviceAlert', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  ipAddress: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  deviceSignature: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['isRead'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = UserDeviceAlert;

