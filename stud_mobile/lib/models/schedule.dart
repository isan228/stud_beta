class KgmaGroup {
  KgmaGroup({required this.id, required this.name});

  final String id;
  final String name;

  factory KgmaGroup.fromJson(Map<String, dynamic> json) => KgmaGroup(
        id: '${json['id'] ?? json['i'] ?? ''}',
        name: json['name'] as String? ?? json['n'] as String? ?? '',
      );
}

class ProfileGroupsResponse {
  ProfileGroupsResponse({
    this.isKgma = false,
    this.needDirection = false,
    this.groups = const [],
    this.selectedGroupId,
    this.selectedGroupName,
    this.error,
  });

  final bool isKgma;
  final bool needDirection;
  final List<KgmaGroup> groups;
  final String? selectedGroupId;
  final String? selectedGroupName;
  final String? error;

  factory ProfileGroupsResponse.fromJson(Map<String, dynamic> json) =>
      ProfileGroupsResponse(
        isKgma: json['isKgma'] == true,
        needDirection: json['needDirection'] == true,
        groups: (json['groups'] as List? ?? [])
            .map((e) => KgmaGroup.fromJson(e as Map<String, dynamic>))
            .toList(),
        selectedGroupId: json['selectedGroupId'] as String?,
        selectedGroupName: json['selectedGroupName'] as String?,
        error: json['error'] as String?,
      );
}

class ScheduleLesson {
  ScheduleLesson({
    this.lessonNumber,
    this.timeStart,
    this.timeEnd,
    this.timeLabel,
    required this.subjectName,
    this.lessonTypeLabel,
    this.room,
    this.teacher,
  });

  final int? lessonNumber;
  final String? timeStart;
  final String? timeEnd;
  final String? timeLabel;
  final String subjectName;
  final String? lessonTypeLabel;
  final String? room;
  final String? teacher;

  String get displayTime {
    if (timeLabel != null && timeLabel!.isNotEmpty) return timeLabel!;
    if (timeStart != null && timeEnd != null) return '$timeStart–$timeEnd';
    if (lessonNumber != null) return 'пара $lessonNumber';
    return '—';
  }

  factory ScheduleLesson.fromJson(Map<String, dynamic> json) => ScheduleLesson(
        lessonNumber: json['lessonNumber'] as int?,
        timeStart: json['timeStart'] as String?,
        timeEnd: json['timeEnd'] as String?,
        timeLabel: json['timeLabel'] as String?,
        subjectName: json['subjectName'] as String? ?? '',
        lessonTypeLabel: json['lessonTypeLabel'] as String?,
        room: json['room'] as String?,
        teacher: json['teacher'] as String?,
      );
}

class ScheduleDay {
  ScheduleDay({
    required this.date,
    required this.dayOfWeek,
    this.lessons = const [],
  });

  final String date;
  final int dayOfWeek;
  final List<ScheduleLesson> lessons;

  factory ScheduleDay.fromJson(Map<String, dynamic> json) => ScheduleDay(
        date: json['date'] as String? ?? '',
        dayOfWeek: json['dayOfWeek'] as int? ?? 0,
        lessons: (json['lessons'] as List? ?? [])
            .map((e) => ScheduleLesson.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class MyWeekSchedule {
  MyWeekSchedule({
    this.configured = false,
    this.source,
    this.weekStart,
    this.weekEnd,
    this.groupName,
    this.kgmaGroupId,
    this.empty = false,
    this.message,
    this.days = const [],
  });

  final bool configured;
  final String? source;
  final String? weekStart;
  final String? weekEnd;
  final String? groupName;
  final String? kgmaGroupId;
  final bool empty;
  final String? message;
  final List<ScheduleDay> days;

  factory MyWeekSchedule.fromJson(Map<String, dynamic> json) => MyWeekSchedule(
        configured: json['configured'] == true,
        source: json['source'] as String?,
        weekStart: json['weekStart'] as String?,
        weekEnd: json['weekEnd'] as String?,
        groupName: json['groupName'] as String?,
        kgmaGroupId: json['kgmaGroupId'] as String?,
        empty: json['empty'] == true,
        message: json['message'] as String?,
        days: (json['days'] as List? ?? [])
            .map((e) => ScheduleDay.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

const scheduleDayNames = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};
