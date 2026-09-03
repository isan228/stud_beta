import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/utils/helpers.dart';
import '../../core/widgets/state_views.dart';
import '../../models/stats.dart';
import '../../providers/auth_provider.dart';
import '../../services/stats_service.dart';
import 'my_schedule_card.dart';
import 'profile_direction_card.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  UserStatsModel? _stats;
  List<TestResultItem> _recent = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!ref.read(authProvider).isAuthenticated) return;
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).refreshUser();
      final data = await ref.read(statsServiceProvider).getUserStats();
      if (!mounted) return;
      setState(() {
        _stats = data.stats;
        _recent = data.recentResults;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final user = auth.user;

    if (!auth.isAuthenticated) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.person_outline, size: 64),
              const SizedBox(height: 16),
              const Text('Войдите, чтобы видеть профиль и статистику'),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => context.push('/login'), child: const Text('Войти')),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: () => context.push('/register'), child: const Text('Регистрация')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user!.username, style: Theme.of(context).textTheme.headlineSmall),
                  Text(user.email),
                  if (user.university != null) Text(user.university!.name),
                  if (user.faculty != null) Text('${user.faculty!.name}, ${user.course ?? '—'} курс'),
                  if (user.groupName != null) Text('Группа: ${user.groupName}'),
                  const SizedBox(height: 8),
                  Text('Монеты: ${user.coins}'),
                  if (user.referralCode != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(child: Text('Реф. код: ${user.referralCode}')),
                        IconButton(
                          icon: const Icon(Icons.copy),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: user.referralCode!));
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
                          },
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          ProfileDirectionCard(user: user),
          const SizedBox(height: 12),
          MyScheduleCard(user: user),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (user.hasScheduleGroup)
                ActionChip(
                  label: const Text('Расписание'),
                  onPressed: () => context.push('/schedule'),
                ),
              ActionChip(
                label: const Text('Подписка вуз'),
                onPressed: () => context.push('/subscriptions?program=university'),
              ),
              ActionChip(
                label: const Text('Подписка USMLE'),
                onPressed: () => context.push('/subscriptions?program=usmle'),
              ),
              ActionChip(
                label: const Text('Избранное'),
                onPressed: () => context.push('/favorites'),
              ),
              ActionChip(
                label: const Text('Сменить пароль'),
                onPressed: () => context.push('/change-password'),
              ),
            ],
          ),
          if (_loading) const Padding(padding: EdgeInsets.all(24), child: LoadingView()),
          if (_stats != null) ...[
            const SizedBox(height: 16),
            Text('Статистика', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _StatsGrid(stats: _stats!),
          ],
          if (_recent.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Последние результаты', style: Theme.of(context).textTheme.titleLarge),
            ..._recent.map(
              (r) => Card(
                child: ListTile(
                  title: Text(r.testName ?? 'Тест #${r.testId}'),
                  subtitle: Text('${r.score}/${r.totalQuestions} • ${formatDate(DateTime.tryParse(r.createdAt ?? ''))}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/test-review/${r.id}'),
                ),
              ),
            ),
          ],
          if (user.isAdminAccount)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('Админ: доступ ко всем подпискам без ограничений'),
            )
          else ...[
            if (isSubscriptionActive(user.subscriptionEndDate))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Подписка вуз до: ${formatDate(DateTime.tryParse(user.subscriptionEndDate!))}'),
              ),
            if (isSubscriptionActive(user.usmleSubscriptionEndDate))
              Text('Подписка USMLE до: ${formatDate(DateTime.tryParse(user.usmleSubscriptionEndDate!))}'),
          ],
        ],
      ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.stats});

  final UserStatsModel stats;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.6,
      children: [
        _StatCard('Тестов', '${stats.totalTestsCompleted}'),
        _StatCard('Вопросов', '${stats.totalQuestionsAnswered}'),
        _StatCard('Точность', '${stats.accuracy}%'),
        _StatCard('Стрик', '${stats.currentStreak}'),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
