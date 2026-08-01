require('dotenv').config();
const sequelize = require('../config/database');
const Subject = require('../models/Subject');
const { ensureUniversities } = require('../utils/ensureUniversities');

const subjects = [
  'Оториноларингология',
  'Инфекционные болезни',
  'Дерматовенерология',
  'Хирургия',
  'Общая гигиена',
  'Эпидемиология',
  'Ортопедическая стоматология',
  'Сестринское дело в терапии',
  'Педагогика высшей школы',
  'Клиническая фармакология с основами клинической фармации',
  'Офтальмология',
  'Психиатрия и наркология',
  'Нервные болезни с курсом медгенетики и нейрохирургии',
  'Акушерство и гинекология',
  'Фармакология',
  'Биохимия',
  'Нормальная физиология',
  'Гистология',
  'Патологическая анатомия',
  'Нормальная анатомия'
];

async function addSubjects() {
  try {
    await sequelize.authenticate();
    console.log('✓ Подключение к БД установлено');

    const kgma = await ensureUniversities();

    let added = 0;
    let skipped = 0;

    for (const subjectName of subjects) {
      try {
        const [subject, created] = await Subject.findOrCreate({
          where: { name: subjectName, universityId: kgma.id },
          defaults: {
            name: subjectName,
            description: `Тесты по предмету ${subjectName}`,
            universityId: kgma.id
          }
        });

        if (created) {
          console.log(`✓ Добавлен: ${subjectName}`);
          added++;
        } else {
          console.log(`⊘ Пропущен (уже существует): ${subjectName}`);
          skipped++;
        }
      } catch (error) {
        console.error(`✗ Ошибка при добавлении "${subjectName}":`, error.message);
      }
    }

    console.log('\n=== Результат ===');
    console.log(`Добавлено: ${added}`);
    console.log(`Пропущено (уже существуют): ${skipped}`);
    console.log(`Всего: ${subjects.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    process.exit(1);
  }
}

addSubjects();
