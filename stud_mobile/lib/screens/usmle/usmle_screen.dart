import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/widgets/cards.dart';
import '../../core/widgets/state_views.dart';
import '../../models/test.dart';
import '../../models/usmle.dart';
import '../../providers/auth_provider.dart';
import '../../services/tests_service.dart';

class UsmleScreen extends ConsumerStatefulWidget {
  const UsmleScreen({super.key});

  @override
  ConsumerState<UsmleScreen> createState() => _UsmleScreenState();
}

class _UsmleScreenState extends ConsumerState<UsmleScreen> {
  UsmleDashboard? _dashboard;
  bool _loading = true;
  String? _error;
  bool _needsSubscription = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _hasUsmleAccess() {
    final user = ref.read(authProvider).user;
    return user?.hasUsmleSubscription == true;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _needsSubscription = false;
    });

    if (!ref.read(authProvider).isAuthenticated) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Войдите, чтобы открыть раздел USMLE';
      });
      return;
    }

    if (!_hasUsmleAccess()) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _needsSubscription = true;
      });
      return;
    }

    try {
      final dashboard = await ref.read(testsServiceProvider).getUsmleDashboard();
      if (!mounted) return;
      setState(() {
        _dashboard = dashboard;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final isSubRequired = e is ApiException &&
          (e.statusCode == 403 ||
              e.message.contains('подписк') ||
              e.message.contains('USMLE'));
      setState(() {
        _needsSubscription = isSubRequired;
        _error = isSubRequired ? null : e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_needsSubscription) {
      return _UsmleLockedView(
        onSubscribe: () => context.push('/subscriptions?program=usmle'),
      );
    }
    if (_error != null) {
      return ErrorView(
        message: _error!,
        onRetry: _load,
      );
    }

    final dashboard = _dashboard!;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('USMLE', style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  const Text('Подготовка к USMLE: Step 1, Step 2, Step 3. Конструктор тестов по тегам.'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _StepSection(
            title: 'Step 1',
            tests: dashboard.step1,
            onOpen: _openTest,
            onBuilder: _openBuilder,
          ),
          _StepSection(
            title: 'Step 2',
            tests: dashboard.step2,
            onOpen: _openTest,
            onBuilder: _openBuilder,
          ),
          _StepSection(
            title: 'Step 3',
            tests: dashboard.step3,
            onOpen: _openTest,
            onBuilder: _openBuilder,
          ),
        ],
      ),
    );
  }

  void _openTest(TestItem test) {
    context.push(
      '/test-settings/${test.id}?name=${Uri.encodeComponent(test.name)}&program=usmle',
    );
  }

  void _openBuilder(TestItem test) {
    context.push(
      '/usmle-builder/${test.id}?name=${Uri.encodeComponent(test.name)}',
    );
  }
}

class _UsmleLockedView extends StatelessWidget {
  const _UsmleLockedView({required this.onSubscribe});

  final VoidCallback onSubscribe;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(
              'Раздел USMLE доступен только с активной подпиской USMLE',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onSubscribe,
              child: const Text('Оформить подписку'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepSection extends StatelessWidget {
  const _StepSection({
    required this.title,
    required this.tests,
    required this.onOpen,
    required this.onBuilder,
  });

  final String title;
  final List<TestItem> tests;
  final void Function(TestItem test) onOpen;
  final void Function(TestItem test) onBuilder;

  @override
  Widget build(BuildContext context) {
    if (tests.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        ...tests.map(
          (test) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TestCard(
                      title: test.name,
                      subtitle: '${test.usedQuestions}/${test.totalQuestions} • ${test.percentage.toStringAsFixed(1)}%',
                      questionCount: test.totalQuestions,
                      isFree: test.isFree,
                      onTap: () => onOpen(test),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => onBuilder(test),
                      icon: const Icon(Icons.build_outlined),
                      label: const Text('Конструктор теста'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}
