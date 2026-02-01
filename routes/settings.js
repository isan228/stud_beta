const express = require('express');
const router = express.Router();
const { Setting } = require('../models');

const DOC_KEYS = {
  publicOfferUrl: 'publicOfferUrl',
  privacyPolicyUrl: 'privacyPolicyUrl'
};

/**
 * Получить ссылки на документы (публичный API для футера и страниц)
 * GET /api/settings/docs
 */
router.get('/docs', async (req, res) => {
  try {
    const rows = await Setting.findAll({
      where: { key: Object.values(DOC_KEYS) }
    });
    const map = {};
    rows.forEach(r => { map[r.key] = r.value || ''; });
    res.json({
      publicOfferUrl: map[DOC_KEYS.publicOfferUrl] || '',
      privacyPolicyUrl: map[DOC_KEYS.privacyPolicyUrl] || ''
    });
  } catch (error) {
    console.error('Ошибка получения настроек документов:', error);
    res.json({ publicOfferUrl: '', privacyPolicyUrl: '' });
  }
});

module.exports = router;
