import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/schedule.dart';
import '../../providers/auth_provider.dart';
import '../../services/schedule_notification_service.dart';
import '../../services/schedule_service.dart';

/// Компактный виджет расписания на главном экране.
class HomeScheduleWidget extends ConsumerStatefulWidget {
  const HomeScheduleWidget({super.key});

  @override
  ConsumerState<HomeScheduleWidget> createState() => _HomeScheduleWidgetState();
}

class _HomeScheduleWidgetState extends ConsumerState<HomeScheduleWidget> {
  MyWeekSchedule? _schedule;
  bool _loading = true;
  String? _error;
  bool _remindersEnabled = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated || auth.user?.hasScheduleGroup != true) {
      if (mounted) {
        setState(() {
          _loading = false;
          _schedule = null;
        });
      }
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final svc = ref.read(scheduleServiceProvider);
      final results = await Future.wait([
        svc.getMyWeek(),
        svc.getMyPrefs().then<SchedulePrefs>((p) => p).catchError((_) => SchedulePrefs(remindersEnabled: true)),
      ]);
      final week = results[0] as MyWeekSchedule;
      final prefs = results[1] as SchedulePrefs;

      if (!mounted) return;
      setState(() {
        _schedule = week;
        _remindersEnabled = prefs.remindersEnabled;
        _loading = false;
      });

      if (prefs.remindersEnabled) {
        await ScheduleNotificationService.instance.init();
        await ScheduleNotificationService.instance.requestPermission();
        await ScheduleNotificationService.instance.scheduleDailyTomorrowReminder(week: week);
      } else {
        await ScheduleNotificationService.instance.cancelScheduleReminders();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  ScheduleDay? get _today {
    final week = _schedule;
    if (week == null) return null;
    final now = DateTime.now();
    final key =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    for (final d in week.days) {
      if (d.date == key) return d;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (!auth.isAuthenticated) return const SizedBox.shrink();
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();

    if (!user.hasScheduleGroup) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.calendar_month_outlined),
          title: const Text('Расписание'),
          subtitle: const Text('Укажите группу в профиле'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/profile'),
        ),
      );
    }

    final today = _today;
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/schedule'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.calendar_month, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Моё расписание', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  if (_remindersEnabled)
                    Icon(Icons.notifications_active_outlined, size: 18, color: theme.colorScheme.primary),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: _loading ? null : _load,
                    icon: const Icon(Icons.refresh, size: 20),
                  ),
                ],
              ),
              if (user.groupName != null)
                Text('Группа ${user.groupName}', style: theme.textTheme.bodySmall),
              const SizedBox(height: 10),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                )
              else if (_error != null)
                Text(_error!, style: TextStyle(color: theme.colorScheme.error, fontSize: 13))
              else if (today == null || today.lessons.isEmpty)
                Text('Сегодня пар нет', style: theme.textTheme.bodyMedium)
              else ...[
                Text('Сегодня', style: theme.textTheme.labelLarge),
                const SizedBox(height: 6),
                ...today.lessons.take(3).map(
                      (l) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 72,
                              child: Text(l.displayTime, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
                            ),
                            Expanded(
                              child: Text(
                                '${l.subjectName}${l.room != null && l.room!.isNotEmpty ? ' · ${l.room}' : ''}',
                                style: theme.textTheme.bodyMedium,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                if (today.lessons.length > 3)
                  Text('+ ещё ${today.lessons.length - 3}', style: theme.textTheme.bodySmall),
              ],
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Открыть неделю →',
                  style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
