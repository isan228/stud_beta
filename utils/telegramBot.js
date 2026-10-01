/* Telegram-бот для входа по 4-значному коду.
   Нужны переменные окружения TELEGRAM_BOT_TOKEN (от @BotFather) и, по желанию, TELEGRAM_BOT_USERNAME.
   Обновления читаются long polling'ом — бот должен работать только в одном процессе сервера. */
const crypto = require('crypto');
const { TelegramLink, User } = require('../models');

const fetchImpl = globalThis.fetch || require('node-fetch');

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;

const linkTokens = new Map(); // token -> { userId, expiresAt }
const loginCodes = new Map(); // userId -> { hash, expiresAt, attempts, sentAt }

let botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
let polling = false;

function isEnabled() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

async function api(method, params = {}) {
  const resp = await fetchImpl(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(data.description || `Telegram API ${method} failed`);
    err.code = data.error_code;
    throw err;
  }
  return data.result;
}

function sendMessage(chatId, text) {
  return api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

function purgeExpired(map) {
  const now = Date.now();
  for (const [k, v] of map) {
    if (v.expiresAt <= now) map.delete(k);
  }
}

function hashCode(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${code}:${process.env.JWT_SECRET || ''}`).digest('hex');
}

/** Ссылка t.me/<бот>?start=<токен>: открыв её, пользователь привязывает свой Telegram к аккаунту. */
function createLinkUrl(userId) {
  purgeExpired(linkTokens);
  const token = crypto.randomBytes(16).toString('hex');
  linkTokens.set(token, { userId, expiresAt: Date.now() + LINK_TOKEN_TTL_MS });
  return botUsername ? `https://t.me/${botUsername}?start=${token}` : null;
}

async function handleStart(message, token) {
  const chatId = String(message.chat.id);
  const tgUsername = message.from?.username || null;

  if (!token) {
    await sendMessage(chatId,
      'Здравствуйте! Это бот stud.kg для входа по коду.\n\n'
      + 'Чтобы привязать Telegram, откройте сайт → <b>Профиль</b> → «Вход через Telegram» → «Привязать Telegram».');
    return;
  }

  const entry = linkTokens.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    await sendMessage(chatId, 'Ссылка устарела. Откройте профиль на stud.kg и нажмите «Привязать Telegram» ещё раз.');
    return;
  }
  linkTokens.delete(token);

  const taken = await TelegramLink.findOne({ where: { chatId } });
  if (taken && taken.userId !== entry.userId) {
    await sendMessage(chatId, 'Этот Telegram уже привязан к другому аккаунту stud.kg. Один Telegram — один аккаунт.');
    return;
  }

  const link = (await TelegramLink.findOne({ where: { userId: entry.userId } }))
    || TelegramLink.build({ userId: entry.userId });
  link.chatId = chatId;
  link.tgUsername = tgUsername;
  await link.save();

  const user = await User.findByPk(entry.userId, { attributes: ['username'] });
  await sendMessage(chatId,
    `✅ Telegram привязан к аккаунту <b>${escapeHtml(user?.username || '')}</b>.\n\n`
    + 'Теперь на странице входа можно выбрать «Войти по коду из Telegram» — код придёт сюда.');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return;
  const match = message.text.trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/);
  if (match) {
    await handleStart(message, match[1]);
  } else {
    await sendMessage(String(message.chat.id), 'Коды для входа будут приходить сюда автоматически. Отвечать боту не нужно.');
  }
}

async function pollLoop() {
  let offset = 0;
  while (polling) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (err) {
          console.error('[telegram] update error:', err.message);
        }
      }
    } catch (err) {
      console.error('[telegram] polling error:', err.message);
      // 409 — бот уже опрашивается другим процессом
      await new Promise((r) => setTimeout(r, err.code === 409 ? 30000 : 5000));
    }
  }
}

async function startPolling() {
  if (!isEnabled() || polling) return;
  if (process.env.TELEGRAM_POLLING === 'false') return;
  polling = true;
  try {
    await api('deleteWebhook', { drop_pending_updates: false });
    const me = await api('getMe');
    if (!botUsername) botUsername = me.username;
    console.log(`🤖 Telegram-бот @${me.username} запущен`);
  } catch (err) {
    console.error('[telegram] start error:', err.message);
  }
  pollLoop();
}

async function getLink(userId) {
  return TelegramLink.findOne({ where: { userId } });
}

/**
 * Отправляет 4-значный код в Telegram пользователя.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'not_linked'|'cooldown'|'send_failed', retryAfter?: number }>}
 */
async function sendLoginCode(userId) {
  const link = await getLink(userId);
  if (!link) return { ok: false, reason: 'not_linked' };

  purgeExpired(loginCodes);
  const existing = loginCodes.get(userId);
  if (existing && Date.now() - existing.sentAt < CODE_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', retryAfter: Math.ceil((CODE_RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000) };
  }

  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  try {
    await sendMessage(link.chatId,
      `Код для входа на stud.kg: <b>${code}</b>\n\nДействует 5 минут. Никому не сообщайте этот код.`);
  } catch (err) {
    console.error('[telegram] send code error:', err.message);
    return { ok: false, reason: 'send_failed' };
  }
  loginCodes.set(userId, { hash: hashCode(userId, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() });
  return { ok: true };
}

/** @returns {'ok'|'invalid'|'expired'|'too_many'} */
function verifyLoginCode(userId, code) {
  const entry = loginCodes.get(userId);
  if (!entry || entry.expiresAt <= Date.now()) {
    loginCodes.delete(userId);
    return 'expired';
  }
  if (entry.attempts >= CODE_MAX_ATTEMPTS) {
    loginCodes.delete(userId);
    return 'too_many';
  }
  entry.attempts += 1;
  const given = Buffer.from(hashCode(userId, String(code || '').trim()));
  const expected = Buffer.from(entry.hash);
  if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
    loginCodes.delete(userId);
    return 'ok';
  }
  return entry.attempts >= CODE_MAX_ATTEMPTS ? 'too_many' : 'invalid';
}

module.exports = {
  isEnabled,
  startPolling,
  createLinkUrl,
  getLink,
  sendLoginCode,
  verifyLoginCode
};
