import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../models/question.dart';
import '../../models/usmle.dart';
import '../../providers/test_session.dart';
import '../../services/tests_service.dart';

class UsmleTestBuilderScreen extends ConsumerStatefulWidget {
  const UsmleTestBuilderScreen({
    super.key,
    required this.testId,
    required this.testName,
  });

  final int testId;
  final String testName;

  @override
  ConsumerState<UsmleTestBuilderScreen> createState() => _UsmleTestBuilderScreenState();
}

class _UsmleTestBuilderScreenState extends ConsumerState<UsmleTestBuilderScreen> {
  UsmleGroupedTags? _tags;
  bool _loading = true;
  String? _error;

  final Set<int> _subjectTagIds = {};
  final Set<int> _systemTagIds = {};
  int _questionCount = 40;
  String _questionMode = 'unsolved';
  bool _randomizeAnswers = true;
  bool _instantFeedback = false;
  bool _useTimer = true;
  int _timerMinutes = 60;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final tags = await ref.read(testsServiceProvider).getUsmleGroupedTags(testId: widget.testId);
      if (!mounted) return;
      setState(() {
        _tags = tags;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _start() async {
    setState(() => _starting = true);
    try {
      final settings = TestSettings(
        questionCount: _questionCount,
        randomizeAnswers: _randomizeAnswers,
        instantFeedbackMode: _instantFeedback,
        timerMinutes: (!_instantFeedback && _useTimer) ? _timerMinutes.clamp(1, 600) : null,
        isUsmleCustom: true,
        usmleSubjectTagIds: _subjectTagIds.toList(),
        usmleSystemTagIds: _systemTagIds.toList(),
        usmleQuestionMode: _questionMode,
      );

      final questions = await ref.read(testsServiceProvider).getUsmleCustomQuestions(widget.testId, settings);
      if (questions.isEmpty) {
        throw ApiException('Нет вопросов по выбранным фильтрам');
      }

      testSessionHolder.active = TestSessionState(
        testId: widget.testId,
        testName: widget.testName,
        settings: settings,
        questions: questions,
        program: 'usmle',
      );

      if (!mounted) return;
      context.push('/test-session');
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : e.toString();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Конструктор: ${widget.testName}')),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('Предметы', style: Theme.of(context).textTheme.titleMedium),
                    ..._tags!.subjects.map(
                      (tag) => CheckboxListTile(
                        value: _subjectTagIds.contains(tag.id),
                        onChanged: (v) => setState(() {
                          if (v == true) {
                            _subjectTagIds.add(tag.id);
                          } else {
                            _subjectTagIds.remove(tag.id);
                          }
                        }),
                        title: Text('${tag.name} (${tag.questionCount})'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Системы', style: Theme.of(context).textTheme.titleMedium),
                    ..._tags!.systems.map(
                      (tag) => CheckboxListTile(
                        value: _systemTagIds.contains(tag.id),
                        onChanged: (v) => setState(() {
                          if (v == true) {
                            _systemTagIds.add(tag.id);
                          } else {
                            _systemTagIds.remove(tag.id);
                          }
                        }),
                        title: Text('${tag.name} (${tag.questionCount})'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      initialValue: '$_questionCount',
                      decoration: const InputDecoration(labelText: 'Количество вопросов'),
                      keyboardType: TextInputType.number,
                      onChanged: (v) => _questionCount = int.tryParse(v) ?? 40,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: _questionMode,
                      decoration: const InputDecoration(labelText: 'Режим вопросов'),
                      items: const [
                        DropdownMenuItem(value: 'all', child: Text('Все')),
                        DropdownMenuItem(value: 'unsolved', child: Text('Нерешённые')),
                        DropdownMenuItem(value: 'solved', child: Text('Решённые')),
                        DropdownMenuItem(value: 'correct', child: Text('Верные')),
                        DropdownMenuItem(value: 'incorrect', child: Text('С ошибками')),
                      ],
                      onChanged: (v) => setState(() => _questionMode = v ?? 'unsolved'),
                    ),
                    SwitchListTile(
                      value: _randomizeAnswers,
                      onChanged: (v) => setState(() => _randomizeAnswers = v),
                      title: const Text('Перемешать ответы'),
                    ),
                    const SizedBox(height: 8),
                    Text('Режим теста', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: false, label: Text('С таймером'), icon: Icon(Icons.timer_outlined)),
                        ButtonSegment(value: true, label: Text('Ответы сразу'), icon: Icon(Icons.bolt_outlined)),
                      ],
                      selected: {_instantFeedback},
                      onSelectionChanged: (selection) {
                        final instant = selection.first;
                        setState(() {
                          _instantFeedback = instant;
                          _useTimer = !instant;
                        });
                      },
                    ),
                    if (!_instantFeedback && _useTimer) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        initialValue: '$_timerMinutes',
                        decoration: const InputDecoration(
                          labelText: 'Таймер (минуты)',
                          helperText: 'Время на весь блок',
                        ),
                        keyboardType: TextInputType.number,
                        onChanged: (v) {
                          final parsed = int.tryParse(v);
                          if (parsed != null && parsed > 0) {
                            _timerMinutes = parsed;
                          }
                        },
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _starting ? null : _start,
                      child: _starting
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Создать тест'),
                    ),
                  ],
                ),
    );
  }
}
