import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../models/question.dart';
import '../../models/test.dart';
import '../../providers/test_session.dart';
import '../../services/tests_service.dart';

class TestSettingsScreen extends ConsumerStatefulWidget {
  const TestSettingsScreen({
    super.key,
    required this.testId,
    required this.testName,
    this.program = 'university',
  });

  final int testId;
  final String testName;
  final String program;

  @override
  ConsumerState<TestSettingsScreen> createState() => _TestSettingsScreenState();
}

class _TestSettingsScreenState extends ConsumerState<TestSettingsScreen> {
  TestProgress? _progress;
  bool _loading = true;
  String? _error;

  int? _questionCount;
  int? _timerMinutes;
  bool _randomizeAnswers = true;
  bool _instantFeedback = false;

  bool _filterAll = true;
  bool _filterUnsolved = false;
  bool _filterSolved = false;
  bool _filterCorrect = false;
  bool _filterIncorrect = false;
  bool _filterFavorites = false;

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
      final progress = await ref.read(testsServiceProvider).getTestProgress(widget.testId);
      if (!mounted) return;
      setState(() {
        _progress = progress;
        _questionCount = progress.totalQuestions > 0 ? progress.totalQuestions : 20;
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

  QuestionFilters _buildFilters() {
    if (_filterAll) {
      return const QuestionFilters(all: true);
    }
    return QuestionFilters(
      unsolved: _filterUnsolved,
      solved: _filterSolved,
      correct: _filterCorrect,
      incorrect: _filterIncorrect,
      favorites: _filterFavorites,
    );
  }

  Future<void> _start() async {
    setState(() => _starting = true);
    try {
      final settings = TestSettings(
        questionCount: _questionCount,
        randomizeAnswers: _randomizeAnswers,
        instantFeedbackMode: _instantFeedback,
        timerMinutes: _timerMinutes,
        questionFilters: _buildFilters(),
      );

      final questions = await ref.read(testsServiceProvider).getQuestions(widget.testId, settings);
      if (questions.isEmpty) {
        throw ApiException('Нет вопросов по выбранным настройкам');
      }

      testSessionHolder.active = TestSessionState(
        testId: widget.testId,
        testName: widget.testName,
        settings: settings,
        questions: questions,
        program: widget.program,
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
      appBar: AppBar(title: Text(widget.testName)),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_progress != null) ...[
                      Text('Прогресс', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _ChipStat('Всего', '${_progress!.totalQuestions}'),
                          _ChipStat('Решено', '${_progress!.solved}'),
                          _ChipStat('Верно', '${_progress!.correct}'),
                          _ChipStat('Ошибки', '${_progress!.incorrect}'),
                          _ChipStat('Избранное', '${_progress!.favorites}'),
                        ],
                      ),
                      const SizedBox(height: 24),
                    ],
                    Text('Настройки', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: '${_questionCount ?? ''}',
                      decoration: const InputDecoration(labelText: 'Количество вопросов'),
                      keyboardType: TextInputType.number,
                      onChanged: (v) => _questionCount = int.tryParse(v),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: _timerMinutes?.toString() ?? '',
                      decoration: const InputDecoration(labelText: 'Таймер (минуты, необязательно)'),
                      keyboardType: TextInputType.number,
                      onChanged: (v) => _timerMinutes = int.tryParse(v),
                    ),
                    SwitchListTile(
                      value: _randomizeAnswers,
                      onChanged: (v) => setState(() => _randomizeAnswers = v),
                      title: const Text('Перемешать ответы'),
                    ),
                    SwitchListTile(
                      value: _instantFeedback,
                      onChanged: (v) => setState(() => _instantFeedback = v),
                      title: const Text('Ответы сразу'),
                      subtitle: const Text('Показывать правильный ответ и объяснение'),
                    ),
                    const SizedBox(height: 16),
                    Text('Режим вопросов', style: Theme.of(context).textTheme.titleMedium),
                    CheckboxListTile(
                      value: _filterAll,
                      onChanged: (v) => setState(() {
                        _filterAll = v ?? false;
                        if (_filterAll) {
                          _filterUnsolved = _filterSolved = _filterCorrect = _filterIncorrect = _filterFavorites = false;
                        }
                      }),
                      title: const Text('Все'),
                    ),
                    CheckboxListTile(
                      value: _filterUnsolved,
                      onChanged: (v) => setState(() {
                        _filterUnsolved = v ?? false;
                        if (_filterUnsolved) _filterAll = false;
                      }),
                      title: Text('Нерешённые (${_progress?.unsolved ?? 0})'),
                    ),
                    CheckboxListTile(
                      value: _filterSolved,
                      onChanged: (v) => setState(() {
                        _filterSolved = v ?? false;
                        if (_filterSolved) _filterAll = false;
                      }),
                      title: Text('Решённые (${_progress?.solved ?? 0})'),
                    ),
                    CheckboxListTile(
                      value: _filterCorrect,
                      onChanged: (v) => setState(() {
                        _filterCorrect = v ?? false;
                        if (_filterCorrect) _filterAll = false;
                      }),
                      title: Text('Верные (${_progress?.correct ?? 0})'),
                    ),
                    CheckboxListTile(
                      value: _filterIncorrect,
                      onChanged: (v) => setState(() {
                        _filterIncorrect = v ?? false;
                        if (_filterIncorrect) _filterAll = false;
                      }),
                      title: Text('С ошибками (${_progress?.incorrect ?? 0})'),
                    ),
                    CheckboxListTile(
                      value: _filterFavorites,
                      onChanged: (v) => setState(() {
                        _filterFavorites = v ?? false;
                        if (_filterFavorites) _filterAll = false;
                      }),
                      title: Text('Избранное (${_progress?.favorites ?? 0})'),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _starting ? null : _start,
                      child: _starting
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Начать тест'),
                    ),
                  ],
                ),
    );
  }
}

class _ChipStat extends StatelessWidget {
  const _ChipStat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Chip(label: Text('$label: $value'));
  }
}
