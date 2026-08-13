import '../../config/app_config.dart';

String resolveImageUrl(String? path) {
  if (path == null || path.trim().isEmpty) return '';
  final trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) return '${AppConfig.baseUrl}$trimmed';
  return '${AppConfig.baseUrl}/$trimmed';
}

String formatDuration(int seconds) {
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

String formatDate(DateTime? date) {
  if (date == null) return '—';
  final d = date.toLocal();
  return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

bool isSubscriptionActive(String? endDateIso) {
  if (endDateIso == null || endDateIso.isEmpty) return false;
  final end = DateTime.tryParse(endDateIso);
  if (end == null) return false;
  return end.isAfter(DateTime.now());
}
