require('dotenv').config();
const { Admin, sequelize } = require('../models');
const { Op } = require('sequelize');

async function createAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к базе данных установлено');

    const username = process.argv[2] || 'admin';
    const email = process.argv[3] || 'admin@stud.kg';
    const password = process.argv[4] || 'admin123';

    // Проверяем, существует ли уже администратор
    const existingAdmin = await Admin.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (existingAdmin) {
      console.log('Администратор с таким именем или email уже существует');
      return;
    }

    // Создаем администратора
    const admin = await Admin.create({
      username,
      email,
      password,
      role: 'admin'
    });

    console.log('Администратор успешно создан!');
    console.log('Имя пользователя:', admin.username);
    console.log('Email:', admin.email);
    console.log('Пароль:', password);
    console.log('\nТеперь вы можете войти в админ-панель по адресу: http://localhost:3000/admin');
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка создания администратора:', error);
    process.exit(1);
  }
}

createAdmin();

