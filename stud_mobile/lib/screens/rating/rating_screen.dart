import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/state_views.dart';
import '../../models/stats.dart';
import '../../services/stats_service.dart';

class RatingScreen extends ConsumerStatefulWidget {
  const RatingScreen({super.key});

  @override
  ConsumerState<RatingScreen> createState() => _RatingScreenState();
}

class _RatingScreenState extends ConsumerState<RatingScreen> {
  List<LeaderboardEntry> _leaderboard = [];
  LeaderboardEntry? _currentUser;
  String _period = '';
  int _total = 0;
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
      final data = await ref.read(statsServiceProvider).getLeaderboard();
      if (!mounted) return;
      setState(() {
        _leaderboard = data.leaderboard;
        _currentUser = data.currentUserEntry;
        _period = data.period;
        _total = data.totalParticipants;
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
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Рейтинг месяца', style: Theme.of(context).textTheme.titleLarge),
                  if (_period.isNotEmpty) Text('Период: $_period'),
                  Text('Участников: $_total'),
                ],
              ),
            ),
          ),
          if (_currentUser != null) ...[
            const SizedBox(height: 12),
            Card(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
              child: ListTile(
                leading: CircleAvatar(child: Text('#${_currentUser!.rank}')),
                title: Text('Вы — ${_currentUser!.username}'),
                subtitle: Text(
                  '${_currentUser!.correctAnswers} правильных • ${_currentUser!.accuracy}% точность',
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (_leaderboard.isEmpty)
            const EmptyView(message: 'Пока нет данных рейтинга')
          else
            ..._leaderboard.map(
              (entry) => Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: entry.rank <= 3
                        ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                        : null,
                    child: Text('#${entry.rank}'),
                  ),
                  title: Text(entry.username),
                  subtitle: Text('${entry.correctAnswers} правильных • ${entry.accuracy}%'),
                  trailing: Text('${entry.totalTestsCompleted} тестов'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
