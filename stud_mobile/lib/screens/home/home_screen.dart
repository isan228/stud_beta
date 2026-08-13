import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/cards.dart';
import '../../core/widgets/state_views.dart';
import '../../models/stats.dart';
import '../../models/test.dart';
import '../../services/stats_service.dart';
import '../../services/tests_service.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  PlatformStats? _platformStats;
  List<TestItem> _latestTests = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final statsService = ref.read(statsServiceProvider);
      final testsService = ref.read(testsServiceProvider);
      final results = await Future.wait([
        statsService.getPlatformStats(),
        testsService.getLatestTests(),
      ]);
      if (!mounted) return;
      setState(() {
        _platformStats = results[0] as PlatformStats;
        _latestTests = results[1] as List<TestItem>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView(message: 'Загрузка...');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HeroBanner(onStart: () => context.go('/tests')),
          const SizedBox(height: 20),
          if (_platformStats != null) _StatsRow(stats: _platformStats!),
          const SizedBox(height: 24),
          Text('Возможности', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          _FeatureTile(
            icon: Icons.library_books_outlined,
            title: 'База тестов',
            subtitle: 'Терапия, педиатрия, хирургия, ГИА, ГАК и другие',
          ),
          _FeatureTile(
            icon: Icons.tune,
            title: 'Гибкие настройки',
            subtitle: 'Количество вопросов, таймер, перемешивание ответов',
          ),
          _FeatureTile(
            icon: Icons.insights_outlined,
            title: 'Статистика и стрики',
            subtitle: 'Отслеживайте прогресс и соревнуйтесь в рейтинге',
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Новые тесты', style: Theme.of(context).textTheme.titleLarge),
              TextButton(onPressed: () => context.go('/tests'), child: const Text('Все')),
            ],
          ),
          if (_latestTests.isEmpty)
            const EmptyView(message: 'Пока нет новых тестов')
          else
            ..._latestTests.map(
              (t) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TestCard(
                  title: t.name,
                  questionCount: t.totalQuestions,
                  isFree: t.isFree,
                  onTap: () => context.push(
                    '/test-settings/${t.id}?name=${Uri.encodeComponent(t.name)}',
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.primary,
            Theme.of(context).colorScheme.primary.withValues(alpha: 0.75),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Подготовка к экзаменам',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 8),
          Text(
            'Интерактивные тесты, прогресс и рейтинг — всё в одном приложении',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Theme.of(context).colorScheme.primary),
            onPressed: onStart,
            child: const Text('Начать'),
          ),
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});

  final PlatformStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatChip(label: 'Вопросов', value: '${stats.questionsCount}')),
        const SizedBox(width: 8),
        Expanded(child: _StatChip(label: 'Предметов', value: '${stats.subjectsCount}')),
        const SizedBox(width: 8),
        Expanded(child: _StatChip(label: 'Тестов', value: '${stats.testsCount}')),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        child: Column(
          children: [
            Text(value, style: Theme.of(context).textTheme.titleLarge),
            Text(label, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  const _FeatureTile({required this.icon, required this.title, required this.subtitle});

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
