require('dotenv').config();
const { Admin, sequelize } = require('../models');
const { Op } = require('sequelize');

async function checkAdmin() {
  try {
    await sequelize.authenticate();
    console.log('✓ Подключение к базе данных установлено\n');

    // Ищем всех администраторов
    const admins = await Admin.findAll({
      attributes: ['id', 'username', 'email', 'role', 'createdAt']
    });
    
    if (admins.length === 0) {
      console.log('❌ Администраторы не найдены!');
      console.log('\n📝 Создайте администратора:');
      console.log('   cd /root/stud_beta');
      console.log('   npm run create-admin\n');
      console.log('Или с вашими данными:');
      console.log('   npm run create-admin ваш_логин ваш_email ваш_пароль\n');
      process.exit(1);
    }

    console.log(`📋 Найдено администраторов: ${admins.length}\n`);
    
    for (let index = 0; index < admins.length; index++) {
      const admin = admins[index];
      console.log(`Администратор #${index + 1}:`);
      console.log(`  ID: ${admin.id}`);
      console.log(`  Username: ${admin.username}`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Role: ${admin.role}`);
      console.log(`  Создан: ${admin.createdAt}`);
      
      // Проверяем стандартные пароли
      const testPasswords = ['admin123', 'admin', 'password', '123456'];
      console.log(`\n  Проверка паролей:`);
      let foundPassword = false;
      for (const testPass of testPasswords) {
        const isMatch = await admin.comparePassword(testPass);
        if (isMatch) {
          console.log(`    ✓ Пароль "${testPass}" - ПРАВИЛЬНЫЙ!`);
          foundPassword = true;
          break;
        }
      }
      if (!foundPassword) {
        console.log(`    ✗ Стандартные пароли не подходят`);
        console.log(`    💡 Пароль был установлен при создании администратора`);
      }
      console.log('');
    }

    console.log('✅ Для входа в админ-панель используйте:');
    console.log(`   URL: https://stud.kg/admin`);
    console.log(`   Username: ${admins[0].username}`);
    console.log(`   Password: (пароль, который вы указали при создании)`);
    console.log('\n💡 Если забыли пароль, создайте нового администратора:');
    console.log('   cd /root/stud_beta');
    console.log('   npm run create-admin новый_логин новый_email новый_пароль\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkAdmin();

