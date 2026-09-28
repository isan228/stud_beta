const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FaceProfile = sequelize.define('FaceProfile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    comment: 'null — лицо снято при регистрации, но оплата ещё не прошла'
  },
  enrollToken: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
    comment: 'Одноразовый токен регистрации; обнуляется после привязки к пользователю'
  },
  descriptors: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'JSON-массив дескрипторов face-api.js (по 128 чисел)',
    get() {
      const raw = this.getDataValue('descriptors');
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    },
    set(val) {
      this.setDataValue('descriptors', JSON.stringify(Array.isArray(val) ? val : []));
    }
  }
}, {
  tableName: 'FaceProfiles',
  indexes: [
    { fields: ['createdAt'] }
  ]
});

module.exports = FaceProfile;
