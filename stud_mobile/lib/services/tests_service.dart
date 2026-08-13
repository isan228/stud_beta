import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/question.dart';
import '../models/test.dart';
import '../models/usmle.dart';

class TestsService {
  TestsService(this._api);

  final ApiClient _api;

  Future<List<Subject>> getSubjects({String program = 'university', bool freeOnly = false}) async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/tests/subjects',
        queryParameters: {
          'program': program,
          if (freeOnly) 'free': 'true',
        },
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => Subject.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<TestItem>> getLatestTests({String program = 'university', bool freeOnly = false}) async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/tests/latest',
        queryParameters: {
          'program': program,
          if (freeOnly) 'free': 'true',
        },
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => TestItem.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<TestItem>> getSubjectTests(int subjectId) async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/tests/subjects/$subjectId/tests',
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => TestItem.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<TestItem> getTest(int testId) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/tests/tests/$testId',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return TestItem.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<TestProgress> getTestProgress(int testId) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/tests/tests/$testId/progress',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return TestProgress.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<Question>> getQuestions(int testId, TestSettings settings) async {
    try {
      final data = await _api.post<List<dynamic>>(
        '/tests/tests/$testId/questions',
        data: settings.toApiBody(),
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => Question.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<CheckResult> checkAnswers(
    int testId,
    Map<int, int> answers,
    List<int> questionIds,
  ) async {
    try {
      final answersMap = answers.map((k, v) => MapEntry(k.toString(), v));
      final data = await _api.post<Map<String, dynamic>>(
        '/tests/tests/$testId/check',
        data: {
          'answers': answersMap,
          'questionIds': questionIds,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return CheckResult.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<UsmleDashboard> getUsmleDashboard() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/tests/usmle/dashboard',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return UsmleDashboard.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<UsmleGroupedTags> getUsmleGroupedTags({int? testId}) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/tests/usmle/tags/grouped',
        queryParameters: testId != null ? {'testId': testId} : null,
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return UsmleGroupedTags.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<Question>> getUsmleCustomQuestions(int testId, TestSettings settings) async {
    try {
      final data = await _api.post<List<dynamic>>(
        '/tests/usmle/custom-test/questions',
        data: settings.toUsmleCustomBody(testId),
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => Question.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final testsServiceProvider = Provider<TestsService>(
  (ref) => TestsService(ref.watch(apiClientProvider)),
);
