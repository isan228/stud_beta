const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MedicalImage } = require('../models');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');

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
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

function serializeMedical(img) {
  return {
    id: img.id,
    imageUrl: img.imageUrl || null,
    videoUrl: img.videoUrl || null,
    title: img.title,
    description: img.description,
    keywords: img.keywords,
    mediaType: img.videoUrl ? (img.imageUrl ? 'both' : 'video') : 'image'
  };
}

function parseKeywords(raw) {
  if (raw == null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch (_) { /* comma list */ }
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeVideoUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Ссылка на видео должна начинаться с http:// или https://');
  }
  if (url.length > 1024) throw new Error('Ссылка на видео слишком длинная');
  return url;
}

function unlinkLocalImage(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '../public', imageUrl);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
}

// GET /api/medical-images — список
router.get('/', async (req, res) => {
  try {
    const images = await MedicalImage.findAll({ order: [['createdAt', 'DESC']] });
    res.json(images.map(serializeMedical));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-images/keywords — слова для linkify
router.get('/keywords', async (req, res) => {
  try {
    const images = await MedicalImage.findAll({
      attributes: ['id', 'imageUrl', 'videoUrl', 'title', 'keywords']
    });
    const result = [];
    for (const img of images) {
      for (const kw of img.keywords) {
        if (kw && kw.trim()) {
          result.push({
            keyword: kw.trim().toLowerCase(),
            imageUrl: img.imageUrl || null,
            videoUrl: img.videoUrl || null,
            title: img.title || kw,
            id: img.id,
            mediaType: img.videoUrl ? (img.imageUrl ? 'both' : 'video') : 'image'
          });
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-images — фото и/или ссылка на видео
router.post('/', upload.single('image'), async (req, res) => {
  try {
    let videoUrl = null;
    try {
      videoUrl = normalizeVideoUrl(req.body.videoUrl);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const imageUrl = req.file ? `/uploads/medical-images/${req.file.filename}` : null;
    if (!imageUrl && !videoUrl) {
      return res.status(400).json({ error: 'Нужно фото или ссылка на видео' });
    }

    const kwArray = parseKeywords(req.body.keywords);
    if (!kwArray.length) {
      if (req.file) unlinkLocalImage(imageUrl);
      return res.status(400).json({ error: 'Укажите хотя бы одно ключевое слово' });
    }

    const img = await MedicalImage.create({
      imageUrl,
      videoUrl,
      title: req.body.title || null,
      description: req.body.description || null,
      keywords: kwArray
    });
    res.json(serializeMedical(img));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/medical-images/:id
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    if (req.file) {
      unlinkLocalImage(img.imageUrl);
      img.imageUrl = `/uploads/medical-images/${req.file.filename}`;
    }

    if (req.body.videoUrl !== undefined) {
      try {
        img.videoUrl = normalizeVideoUrl(req.body.videoUrl);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    if (req.body.clearImage === '1' || req.body.clearImage === 'true') {
      unlinkLocalImage(img.imageUrl);
      img.imageUrl = null;
    }

    if (req.body.title !== undefined) img.title = req.body.title || null;
    if (req.body.description !== undefined) img.description = req.body.description || null;
    if (req.body.keywords !== undefined) {
      const kwArray = parseKeywords(req.body.keywords);
      if (!kwArray.length) {
        return res.status(400).json({ error: 'Укажите хотя бы одно ключевое слово' });
      }
      img.keywords = kwArray;
    }

    if (!img.imageUrl && !img.videoUrl) {
      return res.status(400).json({ error: 'Нужно фото или ссылка на видео' });
    }

    await img.save();
    res.json(serializeMedical(img));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/medical-images/:id
router.delete('/:id', async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    unlinkLocalImage(img.imageUrl);
    await img.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
