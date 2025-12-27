require('dotenv').config();
const { Admin, sequelize } = require('../models');

async function testAdminLogin() {
  try {
    await sequelize.authenticate();
    console.log('✓ Подключение к базе данных установлено\n');

    const username = process.argv[2] || 'admin';
    const password = process.argv[3] || 'admin123';

    console.log('Тестирование входа администратора:');
    console.log('Username:', username);
    console.log('Password:', password, '\n');

    // Ищем администратора
    const admin = await Admin.findOne({ 
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('username')), 
        username.toLowerCase()
      )
    });

    if (!admin) {
      console.log('✗ Администратор не найден');
      
      // Показываем всех администраторов
      const allAdmins = await Admin.findAll({
        attributes: ['id', 'username', 'email', 'role']
      });
      
      if (allAdmins.length === 0) {
        console.log('\nВ базе данных нет администраторов!');
        console.log('Создайте администратора: npm run create-admin');
      } else {
        console.log('\nНайденные администраторы:');
        allAdmins.forEach(a => {
          console.log(`  - ID: ${a.id}, Username: ${a.username}, Email: ${a.email}`);
        });
      }
      
      process.exit(1);
    }

    console.log('✓ Администратор найден:');
    console.log('  ID:', admin.id);
    console.log('  Username:', admin.username);
    console.log('  Email:', admin.email);
    console.log('  Role:', admin.role);
    console.log('  Password hash:', admin.password.substring(0, 20) + '...\n');

    // Проверяем пароль
    console.log('Проверка пароля...');
    const isMatch = await admin.comparePassword(password);
    
    if (isMatch) {
      console.log('✓ Пароль верный!');
      console.log('\nВход должен работать. Проверьте:');
      console.log('  1. JWT_SECRET установлен в .env');
      console.log('  2. Сервер перезапущен после изменений');
      console.log('  3. Нет ошибок в логах сервера');
    } else {
      console.log('✗ Пароль неверный!');
      console.log('\nПопробуйте:');
      console.log('  1. Изменить пароль администратора через скрипт');
      console.log('  2. Создать нового администратора: npm run create-admin');
    }
    
    process.exit(isMatch ? 0 : 1);
  } catch (error) {
    console.error('✗ Ошибка:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAdminLogin();

