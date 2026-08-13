import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/question.dart';
import '../models/stats.dart';

class StatsService {
  StatsService(this._api);

  final ApiClient _api;

  Future<PlatformStats> getPlatformStats() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/platform',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return PlatformStats.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<({UserStatsModel stats, List<TestResultItem> recentResults})> getUserStats() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/stats',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      final stats = UserStatsModel.fromJson(data['stats'] as Map<String, dynamic>);
      final recent = (data['recentResults'] as List? ?? [])
          .map((e) => TestResultItem.fromJson(e as Map<String, dynamic>))
          .toList();
      return (stats: stats, recentResults: recent);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> saveTestResult({
    required int testId,
    required int score,
    required int totalQuestions,
    required int timeSpent,
    required Map<int, int> answers,
    required List<Question> questions,
    required Map<int, Map<String, dynamic>> results,
  }) async {
    try {
      await _api.post('/stats/test-result', data: {
        'testId': testId,
        'score': score,
        'totalQuestions': totalQuestions,
        'timeSpent': timeSpent,
        'answers': answers.map((k, v) => MapEntry(k.toString(), v)),
        'questions': questions.map((q) => {
              'id': q.id,
              'text': q.text,
              'Answers': q.answers
                  .map((a) => {
                        'id': a.id,
                        'text': a.text,
                        'isCorrect': a.isCorrect,
                        if (a.imageUrl != null) 'imageUrl': a.imageUrl,
                      })
                  .toList(),
            }).toList(),
        'results': results.map((k, v) => MapEntry(k.toString(), v)),
      });
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<Map<String, dynamic>> getTestResultDetail(int resultId) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/stats/test-result/$resultId',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return data;
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<({
    List<LeaderboardEntry> leaderboard,
    LeaderboardEntry? currentUserEntry,
    int totalParticipants,
    String period,
  })> getLeaderboard({int limit = 20}) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/leaderboard',
        queryParameters: {'limit': limit},
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      final list = (data['leaderboard'] as List? ?? [])
          .map((e) => LeaderboardEntry.fromJson(e as Map<String, dynamic>))
          .toList();
      final current = data['currentUserEntry'] != null
          ? LeaderboardEntry.fromJson(data['currentUserEntry'] as Map<String, dynamic>)
          : null;
      return (
        leaderboard: list,
        currentUserEntry: current,
        totalParticipants: data['totalParticipants'] as int? ?? 0,
        period: data['period'] as String? ?? '',
      );
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final statsServiceProvider = Provider<StatsService>(
  (ref) => StatsService(ref.watch(apiClientProvider)),
);
