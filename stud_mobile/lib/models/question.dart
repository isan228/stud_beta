class Answer {
  Answer({
    required this.id,
    required this.text,
    this.imageUrl,
    this.isCorrect,
  });

  final int id;
  final String text;
  final String? imageUrl;
  final bool? isCorrect;

  factory Answer.fromJson(Map<String, dynamic> json) => Answer(
        id: json['id'] as int,
        text: json['text'] as String? ?? '',
        imageUrl: json['imageUrl'] as String?,
        isCorrect: json['isCorrect'] == null ? null : json['isCorrect'] == true,
      );
}

class Question {
  Question({
    required this.id,
    required this.text,
    required this.testId,
    this.testName,
    this.imageUrl,
    this.explanation,
    this.explanationImageUrl,
    this.answers = const [],
  });

  final int id;
  final String text;
  final int testId;
  final String? testName;
  final String? imageUrl;
  final String? explanation;
  final String? explanationImageUrl;
  final List<Answer> answers;

  factory Question.fromJson(Map<String, dynamic> json) {
    final rawAnswers = json['Answers'] as List? ?? [];
    return Question(
      id: json['id'] as int,
      text: json['text'] as String? ?? '',
      testId: json['testId'] as int? ?? 0,
      testName: json['testName'] as String?,
      imageUrl: json['imageUrl'] as String?,
      explanation: json['explanation'] as String?,
      explanationImageUrl: json['explanationImageUrl'] as String?,
      answers: rawAnswers
          .map((e) => Answer.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class CheckResult {
  CheckResult({
    required this.score,
    required this.total,
    required this.percentage,
    required this.results,
  });

  final int score;
  final int total;
  final int percentage;
  final Map<int, Map<String, dynamic>> results;

  factory CheckResult.fromJson(Map<String, dynamic> json) {
    final raw = json['results'] as Map<String, dynamic>? ?? {};
    final parsed = <int, Map<String, dynamic>>{};
    raw.forEach((key, value) {
      parsed[int.parse(key)] = Map<String, dynamic>.from(value as Map);
    });
    return CheckResult(
      score: json['score'] as int? ?? 0,
      total: json['total'] as int? ?? 0,
      percentage: json['percentage'] as int? ?? 0,
      results: parsed,
    );
  }
}

class TestSettings {
  TestSettings({
    this.questionCount,
    this.randomizeAnswers = true,
    this.instantFeedbackMode = false,
    this.timerMinutes,
    this.questionFilters = const QuestionFilters(all: true),
    this.isUsmleCustom = false,
    this.usmleSubjectTagIds = const [],
    this.usmleSystemTagIds = const [],
    this.usmleQuestionMode = 'unsolved',
  });

  final int? questionCount;
  final bool randomizeAnswers;
  final bool instantFeedbackMode;
  final int? timerMinutes;
  final QuestionFilters questionFilters;
  final bool isUsmleCustom;
  final List<int> usmleSubjectTagIds;
  final List<int> usmleSystemTagIds;
  final String usmleQuestionMode;

  Map<String, dynamic> toApiBody() => {
        'questionCount': questionCount,
        'randomizeAnswers': randomizeAnswers,
        'instantFeedbackMode': instantFeedbackMode,
        'questionFilters': questionFilters.toJson(),
      };

  Map<String, dynamic> toUsmleCustomBody(int testId) => {
        'testId': testId,
        'subjectTagIds': usmleSubjectTagIds,
        'systemTagIds': usmleSystemTagIds,
        'questionCount': questionCount ?? 40,
        'questionMode': usmleQuestionMode,
        'randomizeAnswers': randomizeAnswers,
        'instantFeedbackMode': instantFeedbackMode,
      };
}

class QuestionFilters {
  const QuestionFilters({
    this.all = false,
    this.unsolved = false,
    this.solved = false,
    this.correct = false,
    this.incorrect = false,
    this.favorites = false,
  });

  final bool all;
  final bool unsolved;
  final bool solved;
  final bool correct;
  final bool incorrect;
  final bool favorites;

  Map<String, dynamic> toJson() => {
        'all': all,
        'unsolved': unsolved,
        'solved': solved,
        'correct': correct,
        'incorrect': incorrect,
        'favorites': favorites,
      };

  QuestionFilters copyWith({
    bool? all,
    bool? unsolved,
    bool? solved,
    bool? correct,
    bool? incorrect,
    bool? favorites,
  }) {
    return QuestionFilters(
      all: all ?? this.all,
      unsolved: unsolved ?? this.unsolved,
      solved: solved ?? this.solved,
      correct: correct ?? this.correct,
      incorrect: incorrect ?? this.incorrect,
      favorites: favorites ?? this.favorites,
    );
  }
}
