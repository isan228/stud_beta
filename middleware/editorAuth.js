const jwt = require('jsonwebtoken');
const { Editor } = require('../models');

const editorAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.editorId) {
      return res.status(401).json({ error: 'Недействительный токен редактора' });
    }

    const editor = await Editor.findByPk(decoded.editorId);

    if (!editor || !editor.isActive) {
      return res.status(401).json({ error: 'Редактор не найден или отключен' });
    }

    req.editor = editor;
    next();
  } catch (error) {
    console.error('Ошибка проверки токена редактора:', error);
    res.status(401).json({ error: 'Недействительный токен' });
  }
};

module.exports = editorAuth;
