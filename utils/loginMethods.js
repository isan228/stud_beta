const { Setting } = require('../models');

const SETTING_KEY = 'loginMethods';
const CACHE_TTL_MS = 30 * 1000;

/**
 * password   — вход по email/никнейму и паролю
 * face       — Face ID (вход по лицу, сканирование при регистрации, напоминание привязать лицо)
 * faceStepUp — обязательное подтверждение лицом раз в 4 дня и с нового устройства/IP
 * telegram   — вход по коду из Telegram-бота и напоминание привязать Telegram
 */
const DEFAULT_LOGIN_METHODS = Object.freeze({
  password: true,
  face: true,
  faceStepUp: true,
  telegram: true
});

const PRIMARY_METHODS = ['password', 'face', 'telegram'];

let cache = null;
let cacheAt = 0;

function normalizeLoginMethods(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_LOGIN_METHODS)) {
    out[key] = typeof src[key] === 'boolean' ? src[key] : DEFAULT_LOGIN_METHODS[key];
  }
  if (!out.face) out.faceStepUp = false;
  return out;
}

async function getLoginMethods() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  let parsed = null;
  try {
    const row = await Setting.findOne({ where: { key: SETTING_KEY } });
    if (row && row.value) parsed = JSON.parse(row.value);
  } catch (error) {
    console.error('Ошибка чтения настроек способов входа:', error.message);
  }
  cache = normalizeLoginMethods(parsed);
  cacheAt = Date.now();
  return cache;
}

/** @returns {Promise<{ok: true, methods: object} | {ok: false, error: string}>} */
async function saveLoginMethods(input) {
  const methods = normalizeLoginMethods(input);
  if (!PRIMARY_METHODS.some((key) => methods[key])) {
    return { ok: false, error: 'Должен остаться включённым хотя бы один способ входа' };
  }
  const value = JSON.stringify(methods);
  const row = await Setting.findOne({ where: { key: SETTING_KEY } });
  if (row) {
    row.value = value;
    await row.save();
  } else {
    await Setting.create({ key: SETTING_KEY, value });
  }
  cache = methods;
  cacheAt = Date.now();
  return { ok: true, methods };
}

module.exports = {
  DEFAULT_LOGIN_METHODS,
  getLoginMethods,
  saveLoginMethods
};
