import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/state_views.dart';
import '../../services/stats_service.dart';

class TestReviewScreen extends ConsumerStatefulWidget {
  const TestReviewScreen({super.key, required this.resultId});

  final int resultId;

  @override
  ConsumerState<TestReviewScreen> createState() => _TestReviewScreenState();
}

class _TestReviewScreenState extends ConsumerState<TestReviewScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ref.read(statsServiceProvider).getTestResultDetail(widget.resultId);
      if (!mounted) return;
      setState(() {
        _data = data;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Разбор теста')),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final result = _data?['result'] as Map<String, dynamic>?;
    if (result == null) return const EmptyView(message: 'Данные не найдены');

    final test = result['Test'] as Map<String, dynamic>?;
    final questions = result['questions'] as List? ?? [];
    final resultsMap = result['results'] as Map<String, dynamic>? ?? {};

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(test?['name'] as String? ?? 'Тест', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text('Результат: ${result['score']}/${result['totalQuestions']}'),
        const SizedBox(height: 16),
        ...questions.map((q) {
          final question = q as Map<String, dynamic>;
          final qId = question['id'].toString();
          final outcome = resultsMap[qId] as Map<String, dynamic>?;
          final correct = outcome?['correct'] == true;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text(question['text'] as String? ?? ''),
              subtitle: Text(correct ? 'Верно' : 'Неверно'),
              leading: Icon(
                correct ? Icons.check_circle : Icons.cancel,
                color: correct ? Colors.green : Colors.red,
              ),
            ),
          );
        }),
      ],
    );
  }
}
