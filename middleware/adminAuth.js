const jwt = require('jsonwebtoken');
const { Admin, Editor } = require('../models');
const { buildActorScope, normalizePermissions } = require('../utils/editorScope');

/**
 * Авторизация админа ИЛИ редактора.
 * Редактор получает req.scope с правами (usmle / universityIds).
 */
const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.adminId) {
      const admin = await Admin.findByPk(decoded.adminId);
      if (!admin) {
        return res.status(401).json({ error: 'Администратор не найден' });
      }
      req.actorType = 'admin';
      req.admin = admin;
      req.editor = null;
      req.scope = buildActorScope('admin');
      return next();
    }

    if (decoded.editorId) {
      const editor = await Editor.findByPk(decoded.editorId);
      if (!editor || !editor.isActive) {
        return res.status(401).json({ error: 'Редактор не найден или отключен' });
      }
      const permissions = normalizePermissions(editor.permissions);
      req.actorType = 'editor';
      req.editor = editor;
      req.admin = null;
      req.scope = buildActorScope('editor', permissions);
      // Совместимость со старым кодом аудита
      req.actor = {
        type: 'editor',
        id: editor.id,
        username: editor.username,
        displayName: editor.displayName,
        permissions
      };
      return next();
    }

    return res.status(401).json({ error: 'Недействительный токен' });
  } catch (error) {
    console.error('Ошибка проверки токена админа/редактора:', error);
    res.status(401).json({ error: 'Недействительный токен' });
  }
};

/** Только полный администратор (не редактор) */
const requireFullAdmin = (req, res, next) => {
  if (req.actorType === 'admin' && req.scope?.full) {
    return next();
  }
  return res.status(403).json({ error: 'Доступно только администратору' });
};

module.exports = adminAuth;
module.exports.requireFullAdmin = requireFullAdmin;
