import '../models/question.dart';

/// Состояние активной сессии теста (передаётся между экранами).
class TestSessionState {
  TestSessionState({
    required this.testId,
    required this.testName,
    required this.settings,
    required this.questions,
    this.program = 'university',
  });

  final int testId;
  final String testName;
  final TestSettings settings;
  final List<Question> questions;
  final String program;

  final Map<int, int> answers = {};
  int currentIndex = 0;
  int elapsedSeconds = 0;
  CheckResult? checkResult;
}

class TestSessionHolder {
  TestSessionState? active;
}

final testSessionHolder = TestSessionHolder();
