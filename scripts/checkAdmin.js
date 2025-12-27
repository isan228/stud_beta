require('dotenv').config();
const { Admin, sequelize } = require('../models');

async function checkAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к базе данных установлено');

    const admin = await Admin.findOne({ where: { username: 'admin' } });
    
    if (admin) {
      console.log('Администратор найден:');
      console.log('ID:', admin.id);
      console.log('Username:', admin.username);
      console.log('Email:', admin.email);
      console.log('Role:', admin.role);
      console.log('Password hash:', admin.password.substring(0, 20) + '...');
      
      // Проверяем пароль
      const testPassword = 'admin123';
      const isMatch = await admin.comparePassword(testPassword);
      console.log('\nПроверка пароля "admin123":', isMatch ? '✓ Пароль верный' : '✗ Пароль неверный');
    } else {
      console.log('Администратор не найден!');
      console.log('Запустите: npm run create-admin');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

checkAdmin();

