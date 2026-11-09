const express = require('express');
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const { requireFullAdmin } = require('../middleware/adminAuth');
const mailbox = require('../utils/mailbox');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }
});

router.use(adminAuth, requireFullAdmin);

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error('Почта (админка):', error.message);
  res.status(status).json({ error: error.message || 'Ошибка почты' });
}

// busboy отдаёт имена файлов в latin1 — кириллица ломается без перекодировки
function decodeFilename(name) {
  const raw = String(name || 'file');
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}

function parseUid(value) {
  const uid = parseInt(value, 10);
  return Number.isFinite(uid) && uid > 0 ? uid : null;
}

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await mailbox.listAccounts();
    res.json({ accounts: accounts.map(mailbox.publicAccount) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/accounts', async (req, res) => {
  try {
    const { email, label, fromName, password } = req.body || {};
    res.json({ account: await mailbox.saveAccount({ email, label, fromName, password }) });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/accounts/:id', async (req, res) => {
  try {
    const { label, fromName, password, clearPassword } = req.body || {};
    res.json({
      account: await mailbox.saveAccount({
        id: req.params.id,
        label,
        fromName,
        password,
        clearPassword: clearPassword === true
      })
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    res.json(await mailbox.removeAccount(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/accounts/:id/test', async (req, res) => {
  try {
    res.json(await mailbox.testAccount(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/summary', async (req, res) => {
  try {
    res.json({ accounts: await mailbox.unreadSummary() });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:account/folders', async (req, res) => {
  try {
    res.json({ folders: await mailbox.listFolders(req.params.account) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:account/messages', async (req, res) => {
  try {
    const data = await mailbox.listMessages(req.params.account, {
      folder: req.query.folder || 'INBOX',
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      unseenOnly: req.query.unseen === '1'
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:account/messages/:uid', async (req, res) => {
  const uid = parseUid(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'Некорректный UID' });
  try {
    const message = await mailbox.getMessage(req.params.account, req.query.folder || 'INBOX', uid, {
      markSeen: req.query.peek !== '1'
    });
    res.json(message);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:account/messages/:uid/attachments/:index', async (req, res) => {
  const uid = parseUid(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'Некорректный UID' });
  try {
    const att = await mailbox.getAttachment(req.params.account, req.query.folder || 'INBOX', uid, req.params.index);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
    res.send(att.content);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:account/messages/:uid', async (req, res) => {
  const uid = parseUid(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'Некорректный UID' });
  try {
    const { folder, seen, flagged } = req.body || {};
    res.json(await mailbox.updateFlags(req.params.account, folder || 'INBOX', uid, {
      seen: typeof seen === 'boolean' ? seen : undefined,
      flagged: typeof flagged === 'boolean' ? flagged : undefined
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:account/messages/:uid', async (req, res) => {
  const uid = parseUid(req.params.uid);
  if (!uid) return res.status(400).json({ error: 'Некорректный UID' });
  try {
    res.json(await mailbox.deleteMessage(req.params.account, req.query.folder || 'INBOX', uid));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:account/send', upload.array('attachments', 10), async (req, res) => {
  try {
    const body = req.body || {};
    const attachments = (req.files || []).map((f) => ({
      filename: decodeFilename(f.originalname),
      content: f.buffer,
      contentType: f.mimetype
    }));
    const result = await mailbox.sendMail(req.params.account, {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      inReplyTo: body.inReplyTo,
      references: body.references,
      replyToUid: parseUid(body.replyToUid),
      replyFolder: body.replyFolder,
      attachments
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
