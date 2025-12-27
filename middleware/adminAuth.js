const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findByPk(decoded.adminId);

    if (!admin) {
      return res.status(401).json({ error: 'Администратор не найден' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Ошибка проверки токена админа:', error);
    res.status(401).json({ error: 'Недействительный токен' });
  }
};

module.exports = adminAuth;

