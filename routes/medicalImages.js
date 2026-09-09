const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MedicalImage } = require('../models');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');

const router = express.Router();

const MEDICAL_IMAGES_DIR = path.join(__dirname, '../public/uploads/medical-images');
const MEDICAL_VIDEOS_DIR = path.join(__dirname, '../public/uploads/medical-videos');
for (const dir of [MEDICAL_IMAGES_DIR, MEDICAL_VIDEOS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_IMAGE = /\.(jpe?g|jfif|png|gif|webp)$/i;
const ALLOWED_VIDEO = /\.(mp4|webm|ogg|mov|m4v)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') cb(null, MEDICAL_VIDEOS_DIR);
    else cb(null, MEDICAL_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase()
      || (file.fieldname === 'video' ? '.mp4' : '.jpg');
    if (ext === '.jpeg' || ext === '.jfif') ext = '.jpg';
    const prefix = file.fieldname === 'video' ? 'medvid' : 'medimg';
    cb(null, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    if (file.fieldname === 'video') {
      if (/^video\//i.test(file.mimetype) || ALLOWED_VIDEO.test(name)) cb(null, true);
      else cb(new Error('Видео: MP4, WEBM, OGG, MOV'));
      return;
    }
    if (/^image\/(jpeg|jpg|jfif|pjpeg|png|gif|webp)$/i.test(file.mimetype) || ALLOWED_IMAGE.test(name)) {
      cb(null, true);
    } else {
      cb(new Error('Фото: JPG, JFIF, PNG, GIF, WEBP'));
    }
  }
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

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

function unlinkUpload(relUrl) {
  if (!relUrl || !String(relUrl).startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '../public', relUrl);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
}

function getUploaded(req, field) {
  return req.files?.[field]?.[0] || null;
}

// GET /api/medical-images
router.get('/', async (req, res) => {
  try {
    const images = await MedicalImage.findAll({ order: [['createdAt', 'DESC']] });
    res.json(images.map(serializeMedical));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-images/keywords
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

// POST — фото и/или видео с устройства
router.post('/', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    const imageFile = getUploaded(req, 'image');
    const videoFile = getUploaded(req, 'video');
    const imageUrl = imageFile ? `/uploads/medical-images/${imageFile.filename}` : null;
    const videoUrl = videoFile ? `/uploads/medical-videos/${videoFile.filename}` : null;

    if (!imageUrl && !videoUrl) {
      return res.status(400).json({ error: 'Загрузите фото или видео с устройства' });
    }

    const kwArray = parseKeywords(req.body.keywords);
    if (!kwArray.length) {
      unlinkUpload(imageUrl);
      unlinkUpload(videoUrl);
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

// PUT
router.put('/:id', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    const imageFile = getUploaded(req, 'image');
    const videoFile = getUploaded(req, 'video');

    if (imageFile) {
      unlinkUpload(img.imageUrl);
      img.imageUrl = `/uploads/medical-images/${imageFile.filename}`;
    }
    if (videoFile) {
      unlinkUpload(img.videoUrl);
      img.videoUrl = `/uploads/medical-videos/${videoFile.filename}`;
    }

    if (req.body.clearImage === '1' || req.body.clearImage === 'true') {
      unlinkUpload(img.imageUrl);
      img.imageUrl = null;
    }
    if (req.body.clearVideo === '1' || req.body.clearVideo === 'true') {
      unlinkUpload(img.videoUrl);
      img.videoUrl = null;
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
      return res.status(400).json({ error: 'Нужно фото или видео' });
    }

    await img.save();
    res.json(serializeMedical(img));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const img = await MedicalImage.findByPk(req.params.id);
    if (!img) return res.status(404).json({ error: 'Не найдено' });

    unlinkUpload(img.imageUrl);
    unlinkUpload(img.videoUrl);
    await img.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
