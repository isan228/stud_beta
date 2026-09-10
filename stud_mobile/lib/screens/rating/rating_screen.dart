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
  String? _message;

  String _scope = 'usmle';
  int? _universityId;
  List<Map<String, dynamic>> _universities = [];
  Map<String, dynamic>? _university;
  Map<String, dynamic>? _direction;
  Map<String, dynamic>? _myDirection;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({String? scope, int? universityId}) async {
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });
    try {
      final data = await ref.read(statsServiceProvider).getLeaderboard(
            scope: scope,
            universityId: universityId,
          );
      if (!mounted) return;
      setState(() {
        _leaderboard = data.leaderboard;
        _currentUser = data.currentUserEntry;
        _period = data.period;
        _total = data.totalParticipants;
        _scope = data.scope;
        _universityId = data.universityId;
        _universities = data.universities;
        _university = data.university;
        _direction = data.direction;
        _myDirection = data.myDirection;
        _message = data.message;
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

  String get _scopeTitle {
    if (_scope == 'usmle') return 'USMLE';
    if (_scope == 'direction') {
      final d = _direction ?? _myDirection;
      final fac = (d?['facultyName'] as String?)?.isNotEmpty == true
          ? d!['facultyName'] as String
          : ((d?['facultyShortName'] as String?) ?? 'Направление');
      final course = d?['course'];
      final uni = _university?['shortName'] as String? ?? _university?['name'] as String?;
      return [
        if (uni != null && uni.isNotEmpty) uni,
        fac,
        if (course != null) '$course курс',
      ].join(' · ');
    }
    final shortName = _university?['shortName'] as String?;
    final name = _university?['name'] as String?;
    if (shortName != null && shortName.isNotEmpty) {
      return name != null && name.isNotEmpty ? '$shortName — $name' : shortName;
    }
    return name ?? 'Университет';
  }

  String _uniChipLabel(Map<String, dynamic> u) {
    final shortName = u['shortName'] as String?;
    if (shortName != null && shortName.isNotEmpty) return shortName;
    return (u['name'] as String?) ?? 'Вуз';
  }

  String get _directionChipLabel {
    final d = _myDirection;
    if (d == null) return 'Моё направление';
    final fac = (d['facultyShortName'] as String?)?.isNotEmpty == true
        ? d['facultyShortName'] as String
        : ((d['facultyName'] as String?) ?? 'Направление');
    final course = d['course'];
    return course != null ? '$fac · $course курс' : fac;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _universities.isEmpty && _leaderboard.isEmpty) {
      return const LoadingView();
    }
    if (_error != null && _universities.isEmpty) {
      return ErrorView(message: _error!, onRetry: () => _load());
    }

    return RefreshIndicator(
      onRefresh: () => _load(scope: _scope, universityId: _universityId),
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
                  const SizedBox(height: 4),
                  const Text('USMLE, университеты и ваше направление (факультет + курс)'),
                  if (_period.isNotEmpty) Text('Период: $_period'),
                  Text('$_scopeTitle · участников: $_total'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('USMLE'),
                    selected: _scope == 'usmle',
                    selectedColor: Colors.red.shade100,
                    onSelected: (_) {
                      if (_scope != 'usmle') _load(scope: 'usmle');
                    },
                  ),
                ),
                if (_myDirection != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_directionChipLabel),
                      selected: _scope == 'direction',
                      selectedColor: Colors.green.shade100,
                      onSelected: (_) {
                        if (_scope != 'direction') _load(scope: 'direction');
                      },
                    ),
                  ),
                ..._universities.map((u) {
                  final id = u['id'] as int?;
                  final selected =
                      _scope == 'university' && id != null && id == _universityId;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_uniChipLabel(u)),
                      selected: selected,
                      onSelected: (_) {
                        if (id == null) return;
                        if (!selected) {
                          _load(scope: 'university', universityId: id);
                        }
                      },
                    ),
                  );
                }),
              ],
            ),
          ),
          if (_loading) ...[
            const SizedBox(height: 24),
            const Center(child: CircularProgressIndicator()),
          ] else ...[
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
              EmptyView(message: _message ?? 'Пока нет данных рейтинга')
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
        ],
      ),
    );
  }
}
