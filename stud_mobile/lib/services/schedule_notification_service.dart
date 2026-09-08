import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../models/schedule.dart';

/// Локальные уведомления о расписании (пары на завтра).
class ScheduleNotificationService {
  ScheduleNotificationService._();
  static final ScheduleNotificationService instance = ScheduleNotificationService._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  static const _channelId = 'schedule_reminders';
  static const _channelName = 'Расписание';
  static const _notifId = 71001;

  Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {
      tz.setLocalLocation(tz.getLocation('Asia/Bishkek'));
    }

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'Напоминания о парах на завтра',
        importance: Importance.high,
      ),
    );

    _ready = true;
  }

  Future<bool> requestPermission() async {
    if (defaultTargetPlatform == TargetPlatform.android) {
      final status = await Permission.notification.request();
      return status.isGranted || status.isLimited;
    }
    final ios = _plugin.resolvePlatformSpecificImplementation<
        IOSFlutterLocalNotificationsPlugin>();
    return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
  }

  Future<void> cancelScheduleReminders() async {
    if (!_ready) await init();
    await _plugin.cancel(_notifId);
  }

  /// Планирует ежедневное напоминание в [hour]:[minute] с текстом пар на завтра.
  Future<void> scheduleDailyTomorrowReminder({
    required MyWeekSchedule week,
    int hour = 17,
    int minute = 0,
  }) async {
    if (!_ready) await init();
    await cancelScheduleReminders();

    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final key =
        '${tomorrow.year.toString().padLeft(4, '0')}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}';
    final day = week.days.cast<ScheduleDay?>().firstWhere(
          (d) => d?.date == key,
          orElse: () => null,
        );

    String body;
    if (day == null || day.lessons.isEmpty) {
      body = 'Завтра пар нет. Хорошего отдыха!';
    } else {
      final lines = day.lessons.take(4).map((l) {
        final room = (l.room != null && l.room!.isNotEmpty) ? ' · ${l.room}' : '';
        return '${l.displayTime} ${l.subjectName}$room';
      }).join('\n');
      final more = day.lessons.length > 4 ? '\nи ещё ${day.lessons.length - 4}…' : '';
      body = 'Завтра у вас такие пары:\n$lines$more';
    }

    final now = tz.TZDateTime.now(tz.local);
    var when = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!when.isAfter(now)) {
      when = when.add(const Duration(days: 1));
    }

    await _plugin.zonedSchedule(
      _notifId,
      'Расписание на завтра',
      body,
      when,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: 'Напоминания о парах на завтра',
          importance: Importance.high,
          priority: Priority.high,
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }
}
