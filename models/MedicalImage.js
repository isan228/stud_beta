const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalImage = sequelize.define('MedicalImage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  imageUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    comment: 'Путь к изображению /uploads/medical-images/... или null если только видео'
  },
  videoUrl: {
    type: DataTypes.STRING(1024),
    allowNull: true,
    comment: 'Путь к загруженному видео /uploads/medical-videos/...'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Название/заголовок'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Описание'
  },
  keywords: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '[]',
    comment: 'JSON-массив ключевых слов',
    get() {
      const raw = this.getDataValue('keywords');
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    },
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('keywords', JSON.stringify(val));
      } else {
        this.setDataValue('keywords', String(val || '[]'));
      }
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'MedicalImages'
});

module.exports = MedicalImage;
