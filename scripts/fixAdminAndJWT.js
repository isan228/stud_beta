require('dotenv').config();
const { Admin, sequelize } = require('../models');
const crypto = require('crypto');

async function fixAdminAndJWT() {
  try {
    await sequelize.authenticate();
    console.log('✓ Подключение к базе данных установлено\n');

    // Генерируем новый JWT_SECRET
    const newJWTSecret = crypto.randomBytes(64).toString('hex');
    
    console.log('🔧 Исправление конфигурации:\n');
    
    // Проверяем текущий JWT_SECRET
    const currentJWTSecret = process.env.JWT_SECRET;
    if (!currentJWTSecret || currentJWTSecret === 'your_jwt_secret_key_here') {
      console.log('⚠️  JWT_SECRET установлен на значение по умолчанию!');
      console.log('\n📝 Добавьте в .env файл:');
      console.log(`JWT_SECRET=${newJWTSecret}\n`);
    } else {
      console.log('✓ JWT_SECRET уже настроен\n');
    }

    // Проверяем администраторов
    const admins = await Admin.findAll({
      attributes: ['id', 'username', 'email', 'role']
    });

    if (admins.length === 0) {
      console.log('❌ Администраторы не найдены!');
      console.log('\nСоздайте администратора:');
      console.log('  npm run create-admin\n');
      process.exit(1);
    }

    console.log('📋 Найденные администраторы:');
    admins.forEach(a => {
      console.log(`  - ID: ${a.id}, Username: ${a.username}, Email: ${a.email}`);
    });

    console.log('\n✅ Для входа используйте:');
    console.log(`  Username: ${admins[0].username}`);
    console.log('  Password: (пароль, который вы указали при создании)');
    
    console.log('\n💡 Если забыли пароль, создайте нового администратора:');
    console.log('  npm run create-admin новый_username новый_email новый_пароль\n');

    // Тестируем вход с первым администратором
    console.log('🧪 Тестирование входа...');
    const testUsername = admins[0].username;
    const testPassword = process.argv[2] || 'admin123'; // Можно передать пароль как аргумент
    
    const admin = await Admin.findOne({ 
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('username')), 
        testUsername.toLowerCase()
      )
    });

    if (admin) {
      const isMatch = await admin.comparePassword(testPassword);
      if (isMatch) {
        console.log(`✓ Пароль "${testPassword}" верный для пользователя "${testUsername}"`);
      } else {
        console.log(`✗ Пароль "${testPassword}" неверный для пользователя "${testUsername}"`);
        console.log('\nПопробуйте другие пароли или создайте нового администратора.');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Ошибка:', error.message);
    process.exit(1);
  }
}

fixAdminAndJWT();

