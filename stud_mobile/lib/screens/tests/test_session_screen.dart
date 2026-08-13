import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/utils/helpers.dart';
import '../../core/widgets/cards.dart';
import '../../providers/auth_provider.dart';
import '../../providers/test_session.dart';
import '../../services/favorites_service.dart';
import '../../services/misc_services.dart';
import '../../services/stats_service.dart';
import '../../services/tests_service.dart';

class TestSessionScreen extends ConsumerStatefulWidget {
  const TestSessionScreen({super.key});

  @override
  ConsumerState<TestSessionScreen> createState() => _TestSessionScreenState();
}

class _TestSessionScreenState extends ConsumerState<TestSessionScreen> {
  TestSessionState? _session;
  Timer? _timer;
  int _remainingSeconds = 0;
  final Map<int, bool> _favoriteCache = {};

  @override
  void initState() {
    super.initState();
    _session = testSessionHolder.active;
    if (_session == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.pop();
      });
      return;
    }
    final minutes = _session!.settings.timerMinutes;
    if (minutes != null && minutes > 0) {
      _remainingSeconds = minutes * 60;
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() {
          _remainingSeconds--;
          _session!.elapsedSeconds++;
          if (_remainingSeconds <= 0) {
            _timer?.cancel();
            _finishTest();
          }
        });
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  int get _currentIndex => _session?.currentIndex ?? 0;

  Future<void> _toggleFavorite(int questionId) async {
    if (!ref.read(authProvider).isAuthenticated) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Войдите, чтобы добавить в избранное')));
      return;
    }
    final favService = ref.read(favoritesServiceProvider);
    final isFav = _favoriteCache[questionId] ?? false;
    try {
      if (isFav) {
        await favService.removeFavorite(questionId);
      } else {
        await favService.addFavorite(questionId);
      }
      setState(() => _favoriteCache[questionId] = !isFav);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _reportError(int questionId, String questionText) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Сообщить об ошибке'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(hintText: 'Опишите проблему'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Отправить')),
        ],
      ),
    );
    if (reason == null || reason.length < 5) return;
    try {
      await ref.read(contactServiceProvider).reportTestError(
            questionId: questionId,
            testId: _session!.testId,
            reason: reason,
            questionText: questionText,
            questionNumber: _currentIndex + 1,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Отчёт отправлен')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  void _selectAnswer(int questionId, int answerId) {
    if (_session == null) return;
    final instant = _session!.settings.instantFeedbackMode;
    if (instant && _session!.checkResult != null) return;

    setState(() => _session!.answers[questionId] = answerId);

    if (instant) {
      _checkInstant(questionId);
    }
  }

  Future<void> _checkInstant(int questionId) async {
    try {
      final result = await ref.read(testsServiceProvider).checkAnswers(
            _session!.testId,
            {questionId: _session!.answers[questionId]!},
            [questionId],
          );
      setState(() {
        _session!.checkResult = result;
      });
    } catch (_) {}
  }

  Future<void> _finishTest() async {
    if (_session == null) return;
    _timer?.cancel();

    try {
      final questionIds = _session!.questions.map((q) => q.id).toList();
      final result = await ref.read(testsServiceProvider).checkAnswers(
            _session!.testId,
            _session!.answers,
            questionIds,
          );
      _session!.checkResult = result;

      if (ref.read(authProvider).isAuthenticated) {
        await ref.read(statsServiceProvider).saveTestResult(
              testId: _session!.testId,
              score: result.score,
              totalQuestions: result.total,
              timeSpent: _session!.elapsedSeconds,
              answers: _session!.answers,
              questions: _session!.questions,
              results: result.results,
            );
      }

      if (!mounted) return;
      context.pushReplacement('/test-result');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    if (session == null) return const Scaffold(body: Center(child: Text('Сессия не найдена')));

    if (session.questions.isEmpty) {
      return const Scaffold(body: Center(child: Text('Нет вопросов')));
    }

    final question = session.questions[_currentIndex];
    final selectedId = session.answers[question.id];
    final instant = session.settings.instantFeedbackMode;
    final instantResult = session.checkResult?.results[question.id];

    return Scaffold(
      appBar: AppBar(
        title: Text('${session.testName} (${_currentIndex + 1}/${session.questions.length})'),
        actions: [
          if (_remainingSeconds > 0)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(child: Text(formatDuration(_remainingSeconds))),
            ),
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            onPressed: () => _reportError(question.id, question.text),
          ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(value: (_currentIndex + 1) / session.questions.length),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Вопрос ${_currentIndex + 1}', style: Theme.of(context).textTheme.labelLarge)),
                    IconButton(
                      icon: Icon(
                        _favoriteCache[question.id] == true
                            ? Icons.bookmark
                            : Icons.bookmark_outline,
                      ),
                      onPressed: () => _toggleFavorite(question.id),
                    ),
                  ],
                ),
                Text(question.text, style: Theme.of(context).textTheme.titleMedium),
                if (question.imageUrl != null) ...[
                  const SizedBox(height: 12),
                  QuestionImage(url: question.imageUrl!),
                ],
                const SizedBox(height: 16),
                ...question.answers.map((answer) {
                  final isSelected = selectedId == answer.id;
                  Color? bg;
                  if (instant && instantResult != null && isSelected) {
                    bg = instantResult['correct'] == true
                        ? Colors.green.withValues(alpha: 0.15)
                        : Colors.red.withValues(alpha: 0.15);
                  }

                  return Card(
                    color: bg,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(answer.text),
                      leading: Radio<int>(
                        value: answer.id,
                        groupValue: selectedId,
                        onChanged: instant && instantResult != null
                            ? null
                            : (_) => _selectAnswer(question.id, answer.id),
                      ),
                      onTap: instant && instantResult != null
                          ? null
                          : () => _selectAnswer(question.id, answer.id),
                      trailing: answer.imageUrl != null ? QuestionImage(url: answer.imageUrl!) : null,
                    ),
                  );
                }),
                if (instant && question.explanation != null && instantResult != null) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Объяснение', style: Theme.of(context).textTheme.titleSmall),
                          const SizedBox(height: 8),
                          Text(question.explanation!),
                          if (question.explanationImageUrl != null)
                            QuestionImage(url: question.explanationImageUrl!),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _currentIndex > 0
                          ? () => setState(() {
                                session.currentIndex--;
                                session.checkResult = null;
                              })
                          : null,
                      child: const Text('Назад'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () {
                        if (_currentIndex < session.questions.length - 1) {
                          setState(() {
                            session.currentIndex++;
                            session.checkResult = null;
                          });
                        } else {
                          _finishTest();
                        }
                      },
                      child: Text(_currentIndex < session.questions.length - 1 ? 'Далее' : 'Завершить'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
