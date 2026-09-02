import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/schedule.dart';

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
}

final scheduleServiceProvider = Provider<ScheduleService>(
  (ref) => ScheduleService(ref.watch(apiClientProvider)),
);
