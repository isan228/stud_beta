const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminAuth = require('../middleware/adminAuth');
const { Setting } = require('../models');

const DOC_DIR = path.join(__dirname, '../public/documents');
const DOC_KEYS = { publicOfferUrl: 'publicOfferUrl', privacyPolicyUrl: 'privacyPolicyUrl' };

if (!fs.existsSync(DOC_DIR)) {
  fs.mkdirSync(DOC_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOC_DIR);
  },
  filename: (req, file, cb) => {
    const type = req.body.documentType === 'privacy' ? 'privacy' : 'offer';
    const ext = path.extname(file.originalname) || '.pdf';
    const safeExt = ['.pdf', '.doc', '.docx'].includes(ext.toLowerCase()) ? ext : '.pdf';
    cb(null, type + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|doc|docx)$/i.test(file.originalname) ||
      ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype);
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только PDF, DOC, DOCX'), false);
    }
  }
});

router.post('/upload-document', adminAuth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не выбран' });
    }
    const type = req.body.documentType;
    if (!type || !['offer', 'privacy'].includes(type)) {
      return res.status(400).json({ error: 'Укажите тип документа: offer или privacy' });
    }
    const relativePath = '/documents/' + req.file.filename;
    const key = type === 'privacy' ? DOC_KEYS.privacyPolicyUrl : DOC_KEYS.publicOfferUrl;
    let row = await Setting.findOne({ where: { key } });
    if (row) {
      row.value = relativePath;
      await row.save();
    } else {
      await Setting.create({ key, value: relativePath });
    }
    res.json({ url: relativePath, message: 'Документ загружен и ссылка сохранена' });
  } catch (err) {
    console.error('Ошибка загрузки документа:', err);
    res.status(500).json({ error: err.message || 'Ошибка загрузки' });
  }
});

module.exports = router;
