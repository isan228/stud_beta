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
  },
  lastVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Последнее подтверждение лицом (регистрация лица, вход по лицу)'
  },
  trustedDevices: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON { sigs: [...], ips: [...] } — устройства и IP, подтверждённые лицом',
    get() {
      const raw = this.getDataValue('trustedDevices');
      try {
        const parsed = JSON.parse(raw || '{}');
        return {
          sigs: Array.isArray(parsed.sigs) ? parsed.sigs : [],
          ips: Array.isArray(parsed.ips) ? parsed.ips : []
        };
      } catch {
        return { sigs: [], ips: [] };
      }
    },
    set(val) {
      this.setDataValue('trustedDevices', JSON.stringify(val || { sigs: [], ips: [] }));
    }
  }
}, {
  tableName: 'FaceProfiles',
  indexes: [
    { fields: ['createdAt'] }
  ]
});

module.exports = FaceProfile;
