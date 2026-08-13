import 'package:flutter/material.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('О нас')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text('stud.kg', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          const Text(
            'stud.kg — профессиональная платформа для подготовки к экзаменам. '
            'Интерактивные тесты по медицинским и другим дисциплинам, гибкие настройки, '
            'отслеживание прогресса, рейтинг и программа USMLE.',
          ),
          const SizedBox(height: 24),
          Text('Возможности', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const _AboutTile(
            icon: Icons.quiz_outlined,
            title: 'Тесты по предметам',
            subtitle: 'Терапия, педиатрия, хирургия, ГИА, ГАК и другие',
          ),
          const _AboutTile(
            icon: Icons.medical_services_outlined,
            title: 'USMLE',
            subtitle: 'Step 1–3, конструктор тестов по тегам',
          ),
          const _AboutTile(
            icon: Icons.insights_outlined,
            title: 'Статистика',
            subtitle: 'Прогресс, стрики, история результатов',
          ),
          const _AboutTile(
            icon: Icons.emoji_events_outlined,
            title: 'Рейтинг',
            subtitle: 'Соревнуйтесь с другими студентами',
          ),
          const _AboutTile(
            icon: Icons.bookmark_outline,
            title: 'Избранное',
            subtitle: 'Сохраняйте сложные вопросы',
          ),
        ],
      ),
    );
  }
}

class _AboutTile extends StatelessWidget {
  const _AboutTile({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
        title: Text(title),
        subtitle: Text(subtitle),
      ),
    );
  }
}
