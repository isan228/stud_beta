import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../providers/test_session.dart';

class TestResultScreen extends StatelessWidget {
  const TestResultScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = testSessionHolder.active;
    final result = session?.checkResult;

    if (session == null || result == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Результат')),
        body: Center(
          child: FilledButton(
            onPressed: () => context.go('/tests'),
            child: const Text('К тестам'),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Результат теста')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 24),
            Icon(
              result.percentage >= 70 ? Icons.emoji_events : Icons.school_outlined,
              size: 72,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(session.testName, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Text('${result.percentage}%', style: Theme.of(context).textTheme.displaySmall),
                    const SizedBox(height: 8),
                    Text(
                      '${result.score} из ${result.total} правильных',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            FilledButton(
              onPressed: () {
                testSessionHolder.active = null;
                context.go('/tests');
              },
              child: const Text('К тестам'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () {
                context.push(
                  '/test-settings/${session.testId}?name=${Uri.encodeComponent(session.testName)}&program=${session.program}',
                );
              },
              child: const Text('Пройти ещё раз'),
            ),
          ],
        ),
      ),
    );
  }
}
