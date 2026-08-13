class Subject {
  Subject({
    required this.id,
    required this.name,
    this.programType,
    this.stepGroup,
    this.universityId,
  });

  final int id;
  final String name;
  final String? programType;
  final String? stepGroup;
  final int? universityId;

  factory Subject.fromJson(Map<String, dynamic> json) => Subject(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        programType: json['programType'] as String?,
        stepGroup: json['stepGroup'] as String?,
        universityId: json['universityId'] as int?,
      );
}

class TestItem {
  TestItem({
    required this.id,
    required this.name,
    this.description,
    this.subjectId,
    this.isFree = false,
    this.programType,
    this.totalQuestions = 0,
    this.usedQuestions = 0,
    this.correctCount = 0,
    this.percentage = 0,
    this.stepGroup,
  });

  final int id;
  final String name;
  final String? description;
  final int? subjectId;
  final bool isFree;
  final String? programType;
  final int totalQuestions;
  final int usedQuestions;
  final int correctCount;
  final double percentage;
  final String? stepGroup;

  factory TestItem.fromJson(Map<String, dynamic> json) {
    final questions = json['Questions'] as List?;
    return TestItem(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      subjectId: json['subjectId'] as int?,
      isFree: json['isFree'] == true,
      programType: json['programType'] as String?,
      totalQuestions: json['totalQuestions'] as int? ?? questions?.length ?? 0,
      usedQuestions: json['usedQuestions'] as int? ?? 0,
      correctCount: json['correctCount'] as int? ?? 0,
      percentage: (json['percentage'] as num?)?.toDouble() ?? 0,
      stepGroup: json['stepGroup'] as String?,
    );
  }
}

class TestProgress {
  TestProgress({
    required this.totalQuestions,
    required this.solved,
    required this.unsolved,
    required this.correct,
    required this.incorrect,
    required this.favorites,
  });

  final int totalQuestions;
  final int solved;
  final int unsolved;
  final int correct;
  final int incorrect;
  final int favorites;

  factory TestProgress.fromJson(Map<String, dynamic> json) => TestProgress(
        totalQuestions: json['totalQuestions'] as int? ?? 0,
        solved: json['solved'] as int? ?? 0,
        unsolved: json['unsolved'] as int? ?? 0,
        correct: json['correct'] as int? ?? 0,
        incorrect: json['incorrect'] as int? ?? 0,
        favorites: json['favorites'] as int? ?? 0,
      );
}
