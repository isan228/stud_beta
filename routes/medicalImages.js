const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MedicalImage } = require('../models');

const router = express.Router();

const MEDICAL_IMAGES_DIR = path.join(__dirname, '../public/uploads/medical-images');
if (!fs.existsSync(MEDICAL_IMAGES_DIR)) {
  fs.mkdirSync(MEDICAL_IMAGES_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDICAL_IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `medimg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

// GET /api/medical-images — список всех изображений
router.get('/', async (req, res) => {
  try {
    const images = await MedicalImage.findAll({ order: [['createdAt', 'DESC']] });
    res.json(images.map(img => ({
      id: img.id,
      imageUrl: img.imageUrl,
      title: img.title,
      description: img.description,
      keywords: img.keywords
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-images/keywords — только слова для linkify (компактный ответ)
router.get('/keywords', async (req, res) => {
  try {
    const images = await MedicalImage.findAll({
      attributes: ['id', 'imageUrl', 'title', 'keywords']
    });
    const result = [];
    for (const img of images) {
      for (const kw of img.keywords) {
        if (kw && kw.trim()) {
          result.push({ keyword: kw.trim().toLowerCase(), imageUrl: img.imageUrl, title: img.title || kw, id: img.id });
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-images — создать запись с фото
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Изображение обязательно' });

    const imageUrl = `/uploads/medical-images/${req.file.filename}`;
    const { title, description, keywords } = req.body;

    let kwArray = [];
    if (keywords) {
      try {
        kwArray = JSON.parse(keywords);
      } catch {
        kwArray = String(keywords).split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const img = await MedicalImage.create({ imageUrl, title: title || null, description: description || null, keywords: kwArray });
    res.json({ id: img.id, imageUrl: img.imageUrl, title: img.title, description: img.description, keywords: img.keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/medical-images/:id — обновить слова/описание/фото
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    if (req.file) {
      // удалить старый файл
      const oldPath = path.join(__dirname, '../public', img.imageUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      img.imageUrl = `/uploads/medical-images/${req.file.filename}`;
    }

    const { title, description, keywords } = req.body;
    if (title !== undefined) img.title = title || null;
    if (description !== undefined) img.description = description || null;
    if (keywords !== undefined) {
      let kwArray = [];
      try { kwArray = JSON.parse(keywords); }
      catch { kwArray = String(keywords).split(',').map(s => s.trim()).filter(Boolean); }
      img.keywords = kwArray;
    }

    await img.save();
    res.json({ id: img.id, imageUrl: img.imageUrl, title: img.title, description: img.description, keywords: img.keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/medical-images/:id
router.delete('/:id', async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    const filePath = path.join(__dirname, '../public', img.imageUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await img.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
