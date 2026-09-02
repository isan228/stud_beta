import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/schedule.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../services/schedule_service.dart';
import '../../services/tests_service.dart';

class ProfileDirectionCard extends ConsumerStatefulWidget {
  const ProfileDirectionCard({super.key, required this.user});

  final UserModel user;

  @override
  ConsumerState<ProfileDirectionCard> createState() => _ProfileDirectionCardState();
}

class _ProfileDirectionCardState extends ConsumerState<ProfileDirectionCard> {
  List<FacultyModel> _faculties = [];
  ProfileGroupsResponse? _groupsData;
  int? _facultyId;
  int _course = 1;
  String? _kgmaGroupId;
  bool _loadingFaculties = true;
  bool _loadingGroups = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _facultyId = widget.user.facultyId;
    _course = widget.user.course ?? 1;
    _kgmaGroupId = widget.user.kgmaGroupId;
    _loadFaculties();
  }

  @override
  void didUpdateWidget(covariant ProfileDirectionCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.user.id != widget.user.id ||
        oldWidget.user.facultyId != widget.user.facultyId ||
        oldWidget.user.course != widget.user.course ||
        oldWidget.user.kgmaGroupId != widget.user.kgmaGroupId) {
      _facultyId = widget.user.facultyId;
      _course = widget.user.course ?? _course;
      _kgmaGroupId = widget.user.kgmaGroupId;
      _loadGroups();
    }
  }

  Future<void> _loadFaculties() async {
    final uniId = widget.user.universityId;
    if (uniId == null) {
      setState(() {
        _loadingFaculties = false;
        _error = 'Университет не указан';
      });
      return;
    }

    setState(() {
      _loadingFaculties = true;
      _error = null;
    });

    try {
      final faculties = await ref.read(testsServiceProvider).getFaculties(uniId);
      if (!mounted) return;
      setState(() {
        _faculties = faculties;
        _loadingFaculties = false;
        if (_facultyId == null && faculties.isNotEmpty) {
          _facultyId = faculties.first.id;
        }
      });
      await _loadGroups();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingFaculties = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadGroups() async {
    if (_facultyId == null) return;
    setState(() {
      _loadingGroups = true;
    });
    try {
      final data = await ref.read(scheduleServiceProvider).getProfileGroups(
            facultyId: _facultyId,
            course: _course,
          );
      if (!mounted) return;
      setState(() {
        _groupsData = data;
        _loadingGroups = false;
        if (_kgmaGroupId != null &&
            !data.groups.any((g) => g.id == _kgmaGroupId)) {
          _kgmaGroupId = data.selectedGroupId;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingGroups = false);
    }
  }

  Future<void> _save() async {
    if (_facultyId == null) return;
    setState(() => _saving = true);
    try {
      KgmaGroup? selectedGroup;
      if (_kgmaGroupId != null && _groupsData != null) {
        for (final g in _groupsData!.groups) {
          if (g.id == _kgmaGroupId) {
            selectedGroup = g;
            break;
          }
        }
      }

      await ref.read(authProvider.notifier).updateDirection(
            facultyId: _facultyId!,
            course: _course,
            kgmaGroupId: selectedGroup?.id,
            groupName: selectedGroup?.name,
            clearGroup: _kgmaGroupId == null || _kgmaGroupId!.isEmpty,
          );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Направление сохранено')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Направление обучения', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Факультет, курс и группа нужны для тестов и напоминаний о парах.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            if (_loadingFaculties)
              const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
            else if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))
            else ...[
              DropdownButtonFormField<int>(
                value: _facultyId,
                decoration: const InputDecoration(labelText: 'Факультет', border: OutlineInputBorder()),
                items: _faculties
                    .map((f) => DropdownMenuItem(value: f.id, child: Text(f.name, overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: (v) {
                  setState(() => _facultyId = v);
                  _loadGroups();
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                value: _course,
                decoration: const InputDecoration(labelText: 'Курс', border: OutlineInputBorder()),
                items: List.generate(
                  6,
                  (i) => DropdownMenuItem(value: i + 1, child: Text('${i + 1} курс')),
                ),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _course = v);
                  _loadGroups();
                },
              ),
              if (_groupsData?.isKgma == true) ...[
                const SizedBox(height: 12),
                if (_loadingGroups)
                  const LinearProgressIndicator()
                else
                  DropdownButtonFormField<String>(
                    value: _kgmaGroupId != null && _kgmaGroupId!.isNotEmpty ? _kgmaGroupId : null,
                    decoration: const InputDecoration(labelText: 'Группа', border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Выберите группу')),
                      ...?_groupsData?.groups.map(
                        (g) => DropdownMenuItem(value: g.id, child: Text(g.name)),
                      ),
                    ],
                    onChanged: (v) => setState(() => _kgmaGroupId = v),
                  ),
                const SizedBox(height: 4),
                Text(
                  'За день до пары придёт напоминание в уведомления.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Сохранить направление'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
