import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/api/api_client.dart';
import '../models/misc.dart';
import '../models/user.dart';

class AuthService {
  AuthService(this._api, this._storage);

  final ApiClient _api;
  final FlutterSecureStorage _storage;

  static const _tokenKey = 'auth_token';

  Future<String?> loadToken() => _storage.read(key: _tokenKey);

  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);

  Future<UserModel> login(String identifier, String password) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'identifier': identifier, 'password': password},
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      final token = data['token'] as String;
      await saveToken(token);
      return UserModel.fromJson(data['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<UserModel> register({
    required String username,
    required String email,
    required String password,
    required int universityId,
    String? referralCode,
  }) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'username': username,
          'email': email,
          'password': password,
          'confirmPassword': password,
          'universityId': universityId,
          'dataConsent': 'true',
          'publicOffer': 'true',
          if (referralCode != null && referralCode.isNotEmpty)
            'referralCode': referralCode,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      final token = data['token'] as String;
      await saveToken(token);
      return UserModel.fromJson(data['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<UserModel> fetchMe() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/auth/me',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return UserModel.fromJson(data['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    try {
      await _api.post('/auth/change-password', data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      });
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<AccountAlert>> fetchDeviceAlerts() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/auth/account-alerts/device',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return (data['deviceAlerts'] as List? ?? [])
          .map((e) => AccountAlert.device(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<List<AccountAlert>> fetchBroadcastAlerts() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/auth/account-alerts/broadcast',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return (data['broadcastAlerts'] as List? ?? [])
          .map((e) => AccountAlert.broadcast(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> dismissDeviceAlert(int id) async {
    await _api.put('/auth/account-alerts/device/$id/dismiss');
  }

  Future<void> dismissBroadcastAlert(int id) async {
    await _api.put('/auth/account-alerts/broadcast/$id/dismiss');
  }
}

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(),
);

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    ref.watch(apiClientProvider),
    ref.watch(secureStorageProvider),
  );
});
