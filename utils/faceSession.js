const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { FaceProfile } = require('../models');
const { getLoginMethods } = require('./loginMethods');

/** Пользователь с привязанным лицом обязан подтверждать его не реже этого срока. */
const FACE_REVERIFY_MS = 4 * 24 * 60 * 60 * 1000;
const MIN_SESSION_SECONDS = 5 * 60;
const MAX_TRUSTED = 20;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.headers['x-real-ip'] || req.ip || null;
}

function getDeviceSignature(req) {
  const userAgent = req.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(userAgent.toLowerCase()).digest('hex');
}

function pushTrusted(list, value) {
  if (!value) return list;
  return [value, ...list.filter((v) => v !== value)].slice(0, MAX_TRUSTED);
}

/** Текущее устройство и IP запроса — в доверенные, время подтверждения — сейчас. */
function applyFaceVerification(profile, req) {
  const trusted = profile.trustedDevices;
  profile.trustedDevices = {
    sigs: pushTrusted(trusted.sigs, getDeviceSignature(req)),
    ips: pushTrusted(trusted.ips, getClientIp(req))
  };
  profile.lastVerifiedAt = new Date();
}

async function markFaceVerified(userId, req) {
  const profile = await FaceProfile.findOne({ where: { userId } });
  if (!profile) return null;
  applyFaceVerification(profile, req);
  await profile.save();
  return profile;
}

/**
 * Нужно ли подтвердить лицо при входе по паролю.
 * @returns {Promise<null|'expired'|'new_device'>} null — лицо не привязано или всё в порядке
 */
async function getFaceCheckReason(userId, req) {
  if (!(await getLoginMethods()).faceStepUp) return null;
  const profile = await FaceProfile.findOne({ where: { userId } });
  if (!profile) return null;
  const last = profile.lastVerifiedAt ? new Date(profile.lastVerifiedAt).getTime() : 0;
  if (!last || Date.now() - last >= FACE_REVERIFY_MS) return 'expired';
  const { sigs, ips } = profile.trustedDevices;
  if (!sigs.includes(getDeviceSignature(req)) || !ips.includes(getClientIp(req))) return 'new_device';
  return null;
}

/**
 * Сессия пользователя с лицом живёт до истечения 4 дней с последнего подтверждения лицом.
 * fresh — пользователь только что подтвердил личность другим способом (код из Telegram): полные 4 дня.
 */
async function signUserSession(userId, { fresh = false } = {}) {
  let expiresIn = '30d';
  if (!(await getLoginMethods()).faceStepUp) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
  }
  const profile = await FaceProfile.findOne({ where: { userId }, attributes: ['lastVerifiedAt'] });
  if (profile && fresh) {
    expiresIn = Math.floor(FACE_REVERIFY_MS / 1000);
  } else if (profile && profile.lastVerifiedAt) {
    const left = Math.floor((new Date(profile.lastVerifiedAt).getTime() + FACE_REVERIFY_MS - Date.now()) / 1000);
    expiresIn = Math.max(MIN_SESSION_SECONDS, left);
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
}

module.exports = {
  getClientIp,
  getDeviceSignature,
  applyFaceVerification,
  markFaceVerified,
  getFaceCheckReason,
  signUserSession
};
