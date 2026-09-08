import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/schedule.dart';

class SchedulePrefs {
  SchedulePrefs({
    this.facultyId,
    this.course,
    this.groupId,
    this.groupName,
    this.remindersEnabled = true,
  });

  final int? facultyId;
  final int? course;
  final String? groupId;
  final String? groupName;
  final bool remindersEnabled;

  factory SchedulePrefs.fromJson(Map<String, dynamic> json) => SchedulePrefs(
        facultyId: json['facultyId'] is int
            ? json['facultyId'] as int
            : int.tryParse('${json['facultyId'] ?? ''}'),
        course: json['course'] is int
            ? json['course'] as int
            : int.tryParse('${json['course'] ?? ''}'),
        groupId: json['groupId']?.toString() ?? json['kgmaGroupId']?.toString(),
        groupName: json['groupName'] as String?,
        remindersEnabled: json['remindersEnabled'] != false &&
            json['scheduleRemindersEnabled'] != false,
      );
}

class ScheduleService {
  ScheduleService(this._api);

  final ApiClient _api;

  Future<ProfileGroupsResponse> getProfileGroups({
    int? facultyId,
    int? course,
  }) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/schedule/kgma/profile-groups',
        queryParameters: {
          if (facultyId != null) 'facultyId': facultyId,
          if (course != null) 'course': course,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return ProfileGroupsResponse.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<MyWeekSchedule> getMyWeek({String? weekStart}) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/schedule/my/week',
        queryParameters: {
          if (weekStart != null && weekStart.isNotEmpty) 'weekStart': weekStart,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return MyWeekSchedule.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<String> getCurrentWeekStart() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/schedule/kgma/current-week-start',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return data['weekStart'] as String? ?? '';
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<SchedulePrefs> getMyPrefs() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/schedule/my-prefs',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return SchedulePrefs.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<SchedulePrefs> saveMyPrefs({
    int? facultyId,
    int? course,
    String? groupId,
    String? groupName,
    bool? remindersEnabled,
  }) async {
    try {
      final data = await _api.put<Map<String, dynamic>>(
        '/schedule/my-prefs',
        data: {
          if (facultyId != null) 'kgmaFacultyId': facultyId,
          if (course != null) 'course': course,
          if (groupId != null) 'kgmaGroupId': groupId,
          if (groupName != null) 'groupName': groupName,
          if (remindersEnabled != null) 'remindersEnabled': remindersEnabled,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      final prefs = data['prefs'];
      if (prefs is Map) {
        return SchedulePrefs.fromJson(Map<String, dynamic>.from(prefs));
      }
      return SchedulePrefs.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final scheduleServiceProvider = Provider<ScheduleService>(
  (ref) => ScheduleService(ref.watch(apiClientProvider)),
);
