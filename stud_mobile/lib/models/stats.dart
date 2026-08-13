class UserStatsModel {
  UserStatsModel({
    required this.totalTestsCompleted,
    required this.totalQuestionsAnswered,
    required this.correctAnswers,
    required this.accuracy,
    required this.currentStreak,
    required this.longestStreak,
  });

  final int totalTestsCompleted;
  final int totalQuestionsAnswered;
  final int correctAnswers;
  final int accuracy;
  final int currentStreak;
  final int longestStreak;

  factory UserStatsModel.fromJson(Map<String, dynamic> json) => UserStatsModel(
        totalTestsCompleted: json['totalTestsCompleted'] as int? ?? 0,
        totalQuestionsAnswered: json['totalQuestionsAnswered'] as int? ?? 0,
        correctAnswers: json['correctAnswers'] as int? ?? 0,
        accuracy: json['accuracy'] as int? ?? 0,
        currentStreak: json['currentStreak'] as int? ?? 0,
        longestStreak: json['longestStreak'] as int? ?? 0,
      );
}

class TestResultItem {
  TestResultItem({
    required this.id,
    required this.testId,
    required this.score,
    required this.totalQuestions,
    this.timeSpent,
    this.createdAt,
    this.testName,
    this.subjectName,
  });

  final int id;
  final int testId;
  final int score;
  final int totalQuestions;
  final int? timeSpent;
  final String? createdAt;
  final String? testName;
  final String? subjectName;

  factory TestResultItem.fromJson(Map<String, dynamic> json) {
    final test = json['Test'] as Map<String, dynamic>?;
    final subject = test?['Subject'] as Map<String, dynamic>?;
    return TestResultItem(
      id: json['id'] as int,
      testId: json['testId'] as int,
      score: json['score'] as int? ?? 0,
      totalQuestions: json['totalQuestions'] as int? ?? 0,
      timeSpent: json['timeSpent'] as int?,
      createdAt: json['createdAt'] as String?,
      testName: test?['name'] as String?,
      subjectName: subject?['name'] as String?,
    );
  }
}

class LeaderboardEntry {
  LeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.username,
    required this.correctAnswers,
    required this.totalQuestionsAnswered,
    required this.totalTestsCompleted,
    required this.accuracy,
  });

  final int rank;
  final int userId;
  final String username;
  final int correctAnswers;
  final int totalQuestionsAnswered;
  final int totalTestsCompleted;
  final int accuracy;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) => LeaderboardEntry(
        rank: json['rank'] as int? ?? 0,
        userId: json['userId'] as int? ?? 0,
        username: json['username'] as String? ?? '—',
        correctAnswers: json['correctAnswers'] as int? ?? 0,
        totalQuestionsAnswered: json['totalQuestionsAnswered'] as int? ?? 0,
        totalTestsCompleted: json['totalTestsCompleted'] as int? ?? 0,
        accuracy: json['accuracy'] as int? ?? 0,
      );
}

class PlatformStats {
  PlatformStats({
    required this.questionsCount,
    required this.subjectsCount,
    required this.testsCount,
  });

  final int questionsCount;
  final int subjectsCount;
  final int testsCount;

  factory PlatformStats.fromJson(Map<String, dynamic> json) => PlatformStats(
        questionsCount: json['questionsCount'] as int? ?? 0,
        subjectsCount: json['subjectsCount'] as int? ?? 0,
        testsCount: json['testsCount'] as int? ?? 0,
      );
}
