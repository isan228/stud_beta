/// Конфигурация приложения.
/// Для локальной разработки:
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
class AppConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://stud.kg',
  );

  static String get apiUrl => '$baseUrl/api';

  static const String appName = 'stud.kg';
}
