import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/cards.dart';
import '../../core/widgets/state_views.dart';
import '../../models/test.dart';
import '../../services/tests_service.dart';

class SubjectTestsScreen extends ConsumerStatefulWidget {
  const SubjectTestsScreen({
    super.key,
    required this.subjectId,
    required this.subjectName,
  });

  final int subjectId;
  final String subjectName;

  @override
  ConsumerState<SubjectTestsScreen> createState() => _SubjectTestsScreenState();
}

class _SubjectTestsScreenState extends ConsumerState<SubjectTestsScreen> {
  List<TestItem> _tests = [];
  bool _loading = true;
  String? _error;

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
      final tests = await ref.read(testsServiceProvider).getSubjectTests(widget.subjectId);
      if (!mounted) return;
      setState(() {
        _tests = tests;
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
      appBar: AppBar(title: Text(widget.subjectName)),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _tests.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 120),
                            EmptyView(message: 'Тесты не найдены'),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _tests.length,
                          itemBuilder: (context, index) {
                            final test = _tests[index];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: TestCard(
                                title: test.name,
                                subtitle: test.description,
                                questionCount: test.totalQuestions,
                                isFree: test.isFree,
                                onTap: () => context.push(
                                  '/test-settings/${test.id}?name=${Uri.encodeComponent(test.name)}',
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
