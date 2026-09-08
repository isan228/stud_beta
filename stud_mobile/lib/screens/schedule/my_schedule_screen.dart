import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/schedule.dart';
import '../../services/schedule_notification_service.dart';
import '../../services/schedule_service.dart';
import '../profile/my_schedule_card.dart';

class MyScheduleScreen extends ConsumerStatefulWidget {
  const MyScheduleScreen({super.key});

  @override
  ConsumerState<MyScheduleScreen> createState() => _MyScheduleScreenState();
}

class _MyScheduleScreenState extends ConsumerState<MyScheduleScreen> {
  MyWeekSchedule? _schedule;
  String? _weekStart;
  bool _loading = true;
  String? _error;
  bool _remindersEnabled = true;
  bool _savingReminders = false;

  @override
  void initState() {
    super.initState();
    _initWeek();
  }

  Future<void> _initWeek() async {
    try {
      final start = await ref.read(scheduleServiceProvider).getCurrentWeekStart();
      _weekStart = start.isNotEmpty ? start : null;
    } catch (_) {}
    await _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final svc = ref.read(scheduleServiceProvider);
      final schedule = await svc.getMyWeek(weekStart: _weekStart);
      SchedulePrefs? prefs;
      try {
        prefs = await svc.getMyPrefs();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _schedule = schedule;
        _weekStart = schedule.weekStart;
        if (prefs != null) _remindersEnabled = prefs.remindersEnabled;
        _loading = false;
      });
      await _syncLocalNotifications(schedule);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _syncLocalNotifications(MyWeekSchedule schedule) async {
    final notifications = ScheduleNotificationService.instance;
    await notifications.init();
    if (_remindersEnabled) {
      await notifications.requestPermission();
      await notifications.scheduleDailyTomorrowReminder(week: schedule);
    } else {
      await notifications.cancelScheduleReminders();
    }
  }

  Future<void> _toggleReminders(bool value) async {
    setState(() {
      _remindersEnabled = value;
      _savingReminders = true;
    });
    try {
      await ref.read(scheduleServiceProvider).saveMyPrefs(remindersEnabled: value);
      if (_schedule != null) await _syncLocalNotifications(_schedule!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(value ? 'Уведомления о парах включены' : 'Уведомления выключены')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _remindersEnabled = !value);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось сохранить: $e')),
      );
    } finally {
      if (mounted) setState(() => _savingReminders = false);
    }
  }

  void _shiftWeek(int days) {
    if (_weekStart == null) return;
    final d = DateTime.parse('${_weekStart!}T12:00:00');
    final next = d.add(Duration(days: days));
    _weekStart =
        '${next.year.toString().padLeft(4, '0')}-${next.month.toString().padLeft(2, '0')}-${next.day.toString().padLeft(2, '0')}';
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Моё расписание')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: SwitchListTile(
                secondary: const Icon(Icons.notifications_active_outlined),
                title: const Text('Уведомления о парах'),
                subtitle: const Text('Напоминание в 17:00 о занятиях на завтра'),
                value: _remindersEnabled,
                onChanged: _savingReminders ? null : _toggleReminders,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                IconButton(onPressed: () => _shiftWeek(-7), icon: const Icon(Icons.chevron_left)),
                Expanded(
                  child: Text(
                    _schedule?.weekStart != null && _schedule?.weekEnd != null
                        ? '${_schedule!.weekStart} — ${_schedule!.weekEnd}'
                        : 'Текущая неделя',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(onPressed: () => _shiftWeek(7), icon: const Icon(Icons.chevron_right)),
              ],
            ),
            if (_schedule?.groupName != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text('Группа: ${_schedule!.groupName}'),
              ),
            if (_loading)
              const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Padding(padding: const EdgeInsets.all(16), child: Text(_error!))
            else if (_schedule == null || _schedule!.empty || _schedule!.days.isEmpty)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('На эту неделю занятий нет')))
            else
              ..._schedule!.days.map((day) => ScheduleDayBlock(day: day)),
          ],
        ),
      ),
    );
  }
}
