import 'test.dart';

class UsmleTag {
  UsmleTag({
    required this.id,
    required this.name,
    this.slug,
    this.questionCount = 0,
    this.questionIds = const [],
  });

  final int id;
  final String name;
  final String? slug;
  final int questionCount;
  final List<int> questionIds;

  factory UsmleTag.fromJson(Map<String, dynamic> json) => UsmleTag(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String?,
        questionCount: json['questionCount'] as int? ?? 0,
        questionIds: (json['questionIds'] as List? ?? [])
            .map((e) => e is int ? e : int.tryParse('$e') ?? 0)
            .where((e) => e > 0)
            .toList(),
      );
}

class UsmleGroupedTags {
  UsmleGroupedTags({
    required this.subjects,
    required this.systems,
    this.testMeta,
  });

  final List<UsmleTag> subjects;
  final List<UsmleTag> systems;
  final Map<String, dynamic>? testMeta;

  factory UsmleGroupedTags.fromJson(Map<String, dynamic> json) => UsmleGroupedTags(
        subjects: (json['subjects'] as List? ?? [])
            .map((e) => UsmleTag.fromJson(e as Map<String, dynamic>))
            .toList(),
        systems: (json['systems'] as List? ?? [])
            .map((e) => UsmleTag.fromJson(e as Map<String, dynamic>))
            .toList(),
        testMeta: json['test'] as Map<String, dynamic>?,
      );
}

class UsmleDashboard {
  UsmleDashboard({
    required this.step1,
    required this.step2,
    required this.step3,
  });

  final List<TestItem> step1;
  final List<TestItem> step2;
  final List<TestItem> step3;

  factory UsmleDashboard.fromJson(Map<String, dynamic> json) => UsmleDashboard(
        step1: (json['step1'] as List? ?? [])
            .map((e) => TestItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        step2: (json['step2'] as List? ?? [])
            .map((e) => TestItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        step3: (json['step3'] as List? ?? [])
            .map((e) => TestItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
