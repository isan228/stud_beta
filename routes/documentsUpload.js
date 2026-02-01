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
    // Тип по имени поля — req.body при multipart часто ещё пустой, поэтому не используем documentType
    const baseName = file.fieldname === 'documentPrivacy' ? 'politika_konfidencialnosti' : 'publichnaya_oferta';
    const ext = path.extname(file.originalname) || '.pdf';
    const safeExt = ['.pdf', '.doc', '.docx'].includes(ext.toLowerCase()) ? ext : '.pdf';
    cb(null, baseName + safeExt);
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

router.post('/upload-document', adminAuth, upload.fields([
  { name: 'documentOffer', maxCount: 1 },
  { name: 'documentPrivacy', maxCount: 1 }
]), async (req, res) => {
  try {
    const fileOffer = req.files?.documentOffer?.[0];
    const filePrivacy = req.files?.documentPrivacy?.[0];
    if (!fileOffer && !filePrivacy) {
      return res.status(400).json({ error: 'Файл не выбран' });
    }
    if (fileOffer && filePrivacy) {
      return res.status(400).json({ error: 'Загрузите только один документ за раз' });
    }

    const file = fileOffer || filePrivacy;
    const key = filePrivacy ? DOC_KEYS.privacyPolicyUrl : DOC_KEYS.publicOfferUrl;
    const relativePath = '/documents/' + file.filename;

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
