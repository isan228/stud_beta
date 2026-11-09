const crypto = require('crypto');
const net = require('net');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { simpleParser } = require('mailparser');

const DEFAULT_ACCOUNTS = 'support,info,dev,noreply';

const ACCOUNT_LABELS = {
  support: 'Поддержка',
  info: 'Общая',
  dev: 'Разработка',
  noreply: 'Уведомления'
};

const SPECIAL_FOLDERS = {
  '\\Inbox': { order: 0, name: 'Входящие' },
  '\\Sent': { order: 1, name: 'Отправленные', aliases: ['sent', 'sent messages', 'sent items', 'отправленные'] },
  '\\Drafts': { order: 2, name: 'Черновики', aliases: ['drafts', 'черновики'] },
  '\\Junk': { order: 3, name: 'Спам', aliases: ['junk', 'spam', 'спам'] },
  '\\Trash': { order: 4, name: 'Корзина', aliases: ['trash', 'deleted', 'deleted items', 'корзина'] },
  '\\Archive': { order: 5, name: 'Архив', aliases: ['archive', 'архив'] }
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function envKey(name) {
  return String(name).replace(/[^a-z0-9]/gi, '_').toUpperCase();
}

function mailConfig() {
  const domain = process.env.MAIL_DOMAIN || 'stud.kg';
  const host = process.env.MAIL_HOST || `mail.${domain}`;
  return {
    domain,
    imapHost: process.env.MAIL_IMAP_HOST || host,
    imapPort: Number(process.env.MAIL_IMAP_PORT) || 993,
    smtpHost: process.env.MAIL_SMTP_HOST || host,
    smtpPort: Number(process.env.MAIL_SMTP_PORT) || 587,
    tlsServername: process.env.MAIL_TLS_SERVERNAME || (net.isIP(host) ? undefined : host),
    rejectUnauthorized: process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
    fromName: process.env.MAIL_FROM_NAME || 'stud.kg'
  };
}

function listAccounts() {
  const { domain, fromName } = mailConfig();
  return String(process.env.MAIL_ACCOUNTS || DEFAULT_ACCOUNTS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((id) => {
      const key = envKey(id);
      const pass = process.env[`MAIL_PASS_${key}`] || '';
      return {
        id,
        email: process.env[`MAIL_USER_${key}`] || `${id}@${domain}`,
        label: process.env[`MAIL_LABEL_${key}`] || ACCOUNT_LABELS[id] || id,
        fromName: process.env[`MAIL_FROM_NAME_${key}`] || fromName,
        configured: !!pass,
        pass
      };
    });
}

function publicAccount(a) {
  return { id: a.id, email: a.email, label: a.label, fromName: a.fromName, configured: a.configured };
}

function getAccount(id) {
  const account = listAccounts().find((a) => a.id === String(id || '').toLowerCase());
  if (!account) throw httpError(404, 'Почтовый ящик не найден');
  if (!account.configured) {
    throw httpError(400, `Пароль для ${account.email} не задан (MAIL_PASS_${envKey(account.id)} в .env)`);
  }
  return account;
}

function describeMailError(error, account) {
  if (error?.status) return error;
  if (error?.authenticationFailed) {
    return httpError(502, `Не удалось войти в ${account?.email || 'ящик'}: проверьте пароль`);
  }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(error?.code)) {
    return httpError(502, `Почтовый сервер недоступен (${error.message || error.code})`);
  }
  if (error?.code === 'EAUTH') {
    return httpError(502, `SMTP отклонил вход для ${account?.email || 'ящика'}: проверьте пароль`);
  }
  return httpError(502, error?.responseText || error?.message || 'Ошибка почтового сервера');
}

async function withImap(account, fn) {
  const cfg = mailConfig();
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapPort === 993,
    auth: { user: account.email, pass: account.pass },
    logger: false,
    tls: { rejectUnauthorized: cfg.rejectUnauthorized, servername: cfg.tlsServername },
    socketTimeout: 60000
  });
  // Без обработчика необработанное 'error' уронит процесс
  client.on('error', (err) => console.error(`IMAP ${account.email}:`, err.message));
  try {
    await client.connect();
  } catch (error) {
    throw describeMailError(error, account);
  }
  try {
    return await fn(client);
  } catch (error) {
    throw describeMailError(error, account);
  } finally {
    try {
      await client.logout();
    } catch (_) {
      client.close();
    }
  }
}

function detectSpecialUse(box) {
  if (String(box.path).toUpperCase() === 'INBOX') return '\\Inbox';
  if (box.specialUse && SPECIAL_FOLDERS[box.specialUse]) return box.specialUse;
  const lower = String(box.name || box.path).toLowerCase();
  for (const [use, meta] of Object.entries(SPECIAL_FOLDERS)) {
    if (meta.aliases && meta.aliases.includes(lower)) return use;
  }
  return null;
}

async function findSpecialFolder(client, use, create = false) {
  const list = await client.list();
  const found = list.find((box) => detectSpecialUse(box) === use);
  if (found) return found.path;
  if (!create) return null;
  const name = use === '\\Sent' ? 'Sent' : use === '\\Trash' ? 'Trash' : use.replace('\\', '');
  const created = await client.mailboxCreate(name);
  try {
    await client.mailboxSubscribe(created.path);
  } catch (_) { /* не критично */ }
  return created.path;
}

async function listFolders(accountId) {
  const account = getAccount(accountId);
  return withImap(account, async (client) => {
    const list = await client.list({ statusQuery: { messages: true, unseen: true } });
    return list
      .filter((box) => !(box.flags && box.flags.has('\\Noselect')))
      .map((box) => {
        const specialUse = detectSpecialUse(box);
        return {
          path: box.path,
          name: specialUse ? SPECIAL_FOLDERS[specialUse].name : box.name,
          specialUse,
          messages: box.status?.messages ?? null,
          unseen: box.status?.unseen ?? null
        };
      })
      .sort((a, b) => {
        const oa = a.specialUse ? SPECIAL_FOLDERS[a.specialUse].order : 50;
        const ob = b.specialUse ? SPECIAL_FOLDERS[b.specialUse].order : 50;
        if (oa !== ob) return oa - ob;
        return String(a.name).localeCompare(String(b.name), 'ru');
      });
  });
}

function hasAttachmentsInStructure(node) {
  if (!node) return false;
  if (node.disposition === 'attachment') return true;
  if (node.disposition === 'inline' && node.type && !node.type.startsWith('text/')) return true;
  return Array.isArray(node.childNodes) && node.childNodes.some(hasAttachmentsInStructure);
}

function mapAddresses(list) {
  return (list || []).map((a) => ({ name: a.name || '', address: a.address || '' }));
}

async function listMessages(accountId, { folder = 'INBOX', page = 1, limit = 30, search = '', unseenOnly = false } = {}) {
  const account = getAccount(accountId);
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 5), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const q = String(search || '').trim();

  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      let query = { all: true };
      if (q) {
        query = { or: [{ subject: q }, { from: q }, { to: q }, { body: q }] };
      }
      if (unseenOnly) query = { ...query, seen: false };

      const uids = (await client.search(query, { uid: true })) || [];
      uids.sort((a, b) => b - a);
      const total = uids.length;
      const pageUids = uids.slice((safePage - 1) * safeLimit, safePage * safeLimit);
      const messages = [];

      if (pageUids.length) {
        for await (const msg of client.fetch(pageUids.join(','), {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true,
          bodyStructure: true
        }, { uid: true })) {
          const env = msg.envelope || {};
          messages.push({
            uid: msg.uid,
            subject: env.subject || '',
            from: mapAddresses(env.from),
            to: mapAddresses(env.to),
            date: env.date || msg.internalDate || null,
            seen: msg.flags ? msg.flags.has('\\Seen') : false,
            flagged: msg.flags ? msg.flags.has('\\Flagged') : false,
            answered: msg.flags ? msg.flags.has('\\Answered') : false,
            size: msg.size || 0,
            hasAttachments: hasAttachmentsInStructure(msg.bodyStructure)
          });
        }
        messages.sort((a, b) => b.uid - a.uid);
      }

      return {
        folder,
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        messages
      };
    } finally {
      lock.release();
    }
  });
}

async function fetchParsed(client, uid) {
  const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
  if (!msg || !msg.source) throw httpError(404, 'Письмо не найдено');
  const parsed = await simpleParser(msg.source);
  return { msg, parsed };
}

function inlineCidImages(html, attachments) {
  if (!html) return html;
  let out = html;
  for (const att of attachments) {
    if (!att.contentId || !att.content) continue;
    if (att.size > 5 * 1024 * 1024) continue;
    const cid = String(att.contentId).replace(/^<|>$/g, '');
    const dataUri = `data:${att.contentType || 'application/octet-stream'};base64,${att.content.toString('base64')}`;
    out = out.split(`cid:${cid}`).join(dataUri);
  }
  return out;
}

function addressList(field) {
  if (!field) return [];
  const groups = Array.isArray(field) ? field : [field];
  return groups.flatMap((g) => mapAddresses(g.value));
}

async function getMessage(accountId, folder, uid, { markSeen = true } = {}) {
  const account = getAccount(accountId);
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const { msg, parsed } = await fetchParsed(client, uid);
      const wasSeen = msg.flags ? msg.flags.has('\\Seen') : false;
      if (markSeen && !wasSeen) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
      const attachments = parsed.attachments || [];
      const html = parsed.html ? inlineCidImages(parsed.html, attachments) : null;
      const references = Array.isArray(parsed.references)
        ? parsed.references
        : (parsed.references ? [parsed.references] : []);

      return {
        uid: Number(uid),
        folder: folder || 'INBOX',
        subject: parsed.subject || '',
        from: addressList(parsed.from),
        to: addressList(parsed.to),
        cc: addressList(parsed.cc),
        replyTo: addressList(parsed.replyTo),
        date: parsed.date || null,
        messageId: parsed.messageId || null,
        references,
        html,
        text: parsed.text || '',
        seen: true,
        flagged: msg.flags ? msg.flags.has('\\Flagged') : false,
        attachments: attachments
          .map((a, index) => ({
            index,
            filename: a.filename || `attachment-${index + 1}`,
            contentType: a.contentType || 'application/octet-stream',
            size: a.size || 0,
            inline: !!(a.contentId && a.related)
          }))
          .filter((a) => !a.inline)
      };
    } finally {
      lock.release();
    }
  });
}

async function getAttachment(accountId, folder, uid, index) {
  const account = getAccount(accountId);
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX', { readOnly: true });
    try {
      const { parsed } = await fetchParsed(client, uid);
      const att = (parsed.attachments || [])[Number(index)];
      if (!att) throw httpError(404, 'Вложение не найдено');
      return {
        filename: att.filename || `attachment-${Number(index) + 1}`,
        contentType: att.contentType || 'application/octet-stream',
        content: att.content
      };
    } finally {
      lock.release();
    }
  });
}

async function updateFlags(accountId, folder, uid, { seen, flagged } = {}) {
  const account = getAccount(accountId);
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const id = String(uid);
      if (seen === true) await client.messageFlagsAdd(id, ['\\Seen'], { uid: true });
      if (seen === false) await client.messageFlagsRemove(id, ['\\Seen'], { uid: true });
      if (flagged === true) await client.messageFlagsAdd(id, ['\\Flagged'], { uid: true });
      if (flagged === false) await client.messageFlagsRemove(id, ['\\Flagged'], { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessage(accountId, folder, uid) {
  const account = getAccount(accountId);
  return withImap(account, async (client) => {
    const source = folder || 'INBOX';
    const trash = await findSpecialFolder(client, '\\Trash', true);
    const lock = await client.getMailboxLock(source);
    try {
      if (trash && trash !== source) {
        await client.messageMove(String(uid), trash, { uid: true });
        return { ok: true, movedTo: trash };
      }
      await client.messageDelete(String(uid), { uid: true });
      return { ok: true, deleted: true };
    } finally {
      lock.release();
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text) {
  const body = escapeHtml(text || '')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\r?\n/g, '<br>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">${body}</div>`;
}

async function sendMail(accountId, { to, cc, bcc, subject, text, inReplyTo, references, attachments = [], replyToUid, replyFolder }) {
  const account = getAccount(accountId);
  const cfg = mailConfig();
  if (!String(to || '').trim()) throw httpError(400, 'Укажите получателя');

  const mail = {
    from: { name: account.fromName, address: account.email },
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: subject || '(без темы)',
    text: text || '',
    html: textToHtml(text || ''),
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    attachments,
    messageId: `<${crypto.randomUUID()}@${cfg.domain}>`,
    date: new Date()
  };

  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    requireTLS: cfg.smtpPort !== 465,
    auth: { user: account.email, pass: account.pass },
    tls: { rejectUnauthorized: cfg.rejectUnauthorized, servername: cfg.tlsServername },
    connectionTimeout: 20000
  });

  let info;
  try {
    info = await transport.sendMail(mail);
  } catch (error) {
    throw describeMailError(error, account);
  } finally {
    transport.close();
  }

  let savedToSent = false;
  try {
    const compiled = new MailComposer(mail).compile();
    compiled.keepBcc = true;
    const raw = await compiled.build();
    await withImap(account, async (client) => {
      const sentPath = await findSpecialFolder(client, '\\Sent', true);
      await client.append(sentPath, raw, ['\\Seen']);
      if (replyToUid) {
        const lock = await client.getMailboxLock(replyFolder || 'INBOX');
        try {
          await client.messageFlagsAdd(String(replyToUid), ['\\Answered'], { uid: true });
        } finally {
          lock.release();
        }
      }
    });
    savedToSent = true;
  } catch (error) {
    console.error(`Не удалось сохранить копию в «Отправленные» (${account.email}):`, error.message);
  }

  return {
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    savedToSent
  };
}

async function unreadSummary() {
  const accounts = listAccounts();
  return Promise.all(accounts.map(async (a) => {
    if (!a.configured) return { ...publicAccount(a), unseen: null, error: 'Пароль не задан' };
    try {
      const status = await withImap(a, (client) => client.status('INBOX', { unseen: true, messages: true }));
      return { ...publicAccount(a), unseen: status.unseen ?? 0, messages: status.messages ?? 0 };
    } catch (error) {
      return { ...publicAccount(a), unseen: null, error: error.message };
    }
  }));
}

module.exports = {
  listAccounts,
  publicAccount,
  listFolders,
  listMessages,
  getMessage,
  getAttachment,
  updateFlags,
  deleteMessage,
  sendMail,
  unreadSummary
};
