import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/schedule.dart';
import '../../models/user.dart';
import '../../services/schedule_service.dart';

class MyScheduleCard extends ConsumerStatefulWidget {
  const MyScheduleCard({super.key, required this.user});

  final UserModel user;

  @override
  ConsumerState<MyScheduleCard> createState() => _MyScheduleCardState();
}

class _MyScheduleCardState extends ConsumerState<MyScheduleCard> {
  MyWeekSchedule? _schedule;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant MyScheduleCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.user.kgmaGroupId != widget.user.kgmaGroupId ||
        oldWidget.user.groupName != widget.user.groupName) {
      _load();
    }
  }

  Future<void> _load() async {
    if (!widget.user.hasScheduleGroup) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final schedule = await ref.read(scheduleServiceProvider).getMyWeek();
      if (!mounted) return;
      setState(() {
        _schedule = schedule;
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
    if (!widget.user.hasScheduleGroup) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Моё расписание', style: Theme.of(context).textTheme.titleLarge),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loading ? null : _load,
                  tooltip: 'Обновить',
                ),
              ],
            ),
            if (widget.user.groupName != null)
              Text('Группа: ${widget.user.groupName}', style: Theme.of(context).textTheme.bodySmall),
            if (_schedule?.weekStart != null && _schedule?.weekEnd != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Неделя ${_schedule!.weekStart} — ${_schedule!.weekEnd}',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
            else if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))
            else if (_schedule == null || _schedule!.empty || _schedule!.days.isEmpty)
              Text(_schedule?.message ?? 'На эту неделю занятий нет')
            else
              ..._schedule!.days.map((day) => ScheduleDayBlock(day: day)),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => context.push('/schedule'),
                child: const Text('Полное расписание →'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ScheduleDayBlock extends StatelessWidget {
  const ScheduleDayBlock({super.key, required this.day});

  final ScheduleDay day;

  @override
  Widget build(BuildContext context) {
    final title = '${scheduleDayNames[day.dayOfWeek] ?? day.date} · ${day.date}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(title, style: Theme.of(context).textTheme.titleSmall),
          ),
          ...day.lessons.map(
            (les) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: SizedBox(
                width: 72,
                child: Text(
                  les.displayTime,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                    fontSize: 13,
                  ),
                ),
              ),
              title: Text(les.subjectName),
              subtitle: Text([
                if (les.lessonTypeLabel != null && les.lessonTypeLabel!.isNotEmpty) les.lessonTypeLabel,
                if (les.room != null && les.room!.isNotEmpty) 'ауд. ${les.room}',
                if (les.teacher != null && les.teacher!.isNotEmpty) les.teacher,
              ].join(' · ')),
            ),
          ),
        ],
      ),
    );
  }
}
