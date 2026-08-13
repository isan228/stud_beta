import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/user.dart';
import '../services/auth_service.dart';
import 'token_holder.dart';

class AuthState {
  const AuthState({
    this.user,
    this.token,
    this.isLoading = false,
    this.isInitialized = false,
  });

  final UserModel? user;
  final String? token;
  final bool isLoading;
  final bool isInitialized;

  bool get isAuthenticated => user != null && token != null;

  AuthState copyWith({
    UserModel? user,
    String? token,
    bool? isLoading,
    bool? isInitialized,
    bool clearUser = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      token: clearUser ? null : (token ?? this.token),
      isLoading: isLoading ?? this.isLoading,
      isInitialized: isInitialized ?? this.isInitialized,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authService) : super(const AuthState());

  final AuthService _authService;

  Future<void> initialize() async {
    state = state.copyWith(isLoading: true);
    try {
      final token = await _authService.loadToken();
      if (token == null || token.isEmpty) {
        authTokenHolder.token = null;
        state = state.copyWith(isLoading: false, isInitialized: true, clearUser: true);
        return;
      }
      authTokenHolder.token = token;
      state = state.copyWith(token: token);
      final user = await _authService.fetchMe();
      state = state.copyWith(user: user, isLoading: false, isInitialized: true);
    } catch (_) {
      await _authService.clearToken();
      authTokenHolder.token = null;
      state = state.copyWith(isLoading: false, isInitialized: true, clearUser: true);
    }
  }

  Future<void> login(String identifier, String password) async {
    state = state.copyWith(isLoading: true);
    try {
      final user = await _authService.login(identifier, password);
      final token = await _authService.loadToken();
      authTokenHolder.token = token;
      state = state.copyWith(user: user, token: token, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
      rethrow;
    }
  }

  Future<void> register({
    required String username,
    required String email,
    required String password,
    required int universityId,
    String? referralCode,
  }) async {
    state = state.copyWith(isLoading: true);
    try {
      final user = await _authService.register(
        username: username,
        email: email,
        password: password,
        universityId: universityId,
        referralCode: referralCode,
      );
      final token = await _authService.loadToken();
      authTokenHolder.token = token;
      state = state.copyWith(user: user, token: token, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
      rethrow;
    }
  }

  Future<void> refreshUser() async {
    if (state.token == null) return;
    try {
      final user = await _authService.fetchMe();
      state = state.copyWith(user: user);
    } catch (_) {}
  }

  Future<void> logout() async {
    await _authService.clearToken();
    authTokenHolder.token = null;
    state = state.copyWith(clearUser: true);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authServiceProvider));
});
