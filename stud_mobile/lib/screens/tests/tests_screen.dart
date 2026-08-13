import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/cards.dart';
import '../../core/widgets/state_views.dart';
import '../../models/test.dart';
import '../../services/tests_service.dart';

class TestsScreen extends ConsumerStatefulWidget {
  const TestsScreen({super.key});

  @override
  ConsumerState<TestsScreen> createState() => _TestsScreenState();
}

class _TestsScreenState extends ConsumerState<TestsScreen> {
  List<Subject> _subjects = [];
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
      final subjects = await ref.read(testsServiceProvider).getSubjects();
      if (!mounted) return;
      setState(() {
        _subjects = subjects;
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
    if (_loading) return const LoadingView();
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      child: _subjects.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 120),
                EmptyView(message: 'Предметы не найдены'),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _subjects.length,
              itemBuilder: (context, index) {
                final subject = _subjects[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: SubjectTile(
                    name: subject.name,
                    onTap: () => context.push(
                      '/tests/subject/${subject.id}?name=${Uri.encodeComponent(subject.name)}',
                    ),
                  ),
                );
              },
            ),
    );
  }
}
