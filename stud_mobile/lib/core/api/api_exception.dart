class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.details});

  final String message;
  final int? statusCode;
  final dynamic details;

  @override
  String toString() => message;
}

String extractErrorMessage(dynamic data, {String fallback = 'Ошибка сервера'}) {
  if (data == null) return fallback;
  if (data is String && data.trim().isNotEmpty) return data;
  if (data is Map) {
    if (data['error'] is String) return data['error'] as String;
    if (data['message'] is String) return data['message'] as String;
    if (data['errors'] is List && (data['errors'] as List).isNotEmpty) {
      final first = (data['errors'] as List).first;
      if (first is Map && first['msg'] is String) return first['msg'] as String;
    }
  }
  return fallback;
}
