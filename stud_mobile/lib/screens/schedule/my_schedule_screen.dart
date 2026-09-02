import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/schedule.dart';
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
      final schedule = await ref.read(scheduleServiceProvider).getMyWeek(weekStart: _weekStart);
      if (!mounted) return;
      setState(() {
        _schedule = schedule;
        _weekStart = schedule.weekStart;
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
