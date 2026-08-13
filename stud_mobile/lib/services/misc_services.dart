import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/misc.dart';
import '../models/user.dart';

class UniversitiesService {
  UniversitiesService(this._api);

  final ApiClient _api;

  Future<List<University>> getUniversities() async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/universities',
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => University.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

class ChatService {
  ChatService(this._api);

  final ApiClient _api;

  Future<List<ChatMessageModel>> getMessages() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/chat/messages',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return (data['messages'] as List? ?? [])
          .map((e) => ChatMessageModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<ChatMessageModel> sendMessage(String text) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/chat/messages',
        data: {'text': text},
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return ChatMessageModel.fromJson(data['message'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<int> getUnreadCount() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/chat/unread-count',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return data['unreadCount'] as int? ?? 0;
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> markRead() async {
    await _api.put('/chat/read');
  }
}

class ContactService {
  ContactService(this._api);

  final ApiClient _api;

  Future<void> sendContact({
    required String name,
    required String email,
    required String subject,
    required String message,
  }) async {
    try {
      await _api.post('/contact', data: {
        'name': name,
        'email': email,
        'subject': subject,
        'message': message,
      });
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> reportTestError({
    required int questionId,
    required int testId,
    required String reason,
    String? questionText,
    int? questionNumber,
  }) async {
    try {
      await _api.post('/test-error-report', data: {
        'questionId': questionId,
        'testId': testId,
        'reason': reason,
        if (questionText != null) 'questionText': questionText,
        if (questionNumber != null) 'questionNumber': questionNumber,
      });
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

class NewsService {
  NewsService(this._api);

  final ApiClient _api;

  Future<List<NewsItem>> getNews() async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/news',
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => NewsItem.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

class SettingsService {
  SettingsService(this._api);

  final ApiClient _api;

  Future<({String publicOfferUrl, String privacyPolicyUrl})> getDocs() async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/settings/docs',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return (
        publicOfferUrl: data['publicOfferUrl'] as String? ?? '',
        privacyPolicyUrl: data['privacyPolicyUrl'] as String? ?? '',
      );
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final universitiesServiceProvider = Provider<UniversitiesService>(
  (ref) => UniversitiesService(ref.watch(apiClientProvider)),
);

final chatServiceProvider = Provider<ChatService>(
  (ref) => ChatService(ref.watch(apiClientProvider)),
);

final contactServiceProvider = Provider<ContactService>(
  (ref) => ContactService(ref.watch(apiClientProvider)),
);

final newsServiceProvider = Provider<NewsService>(
  (ref) => NewsService(ref.watch(apiClientProvider)),
);

final settingsServiceProvider = Provider<SettingsService>(
  (ref) => SettingsService(ref.watch(apiClientProvider)),
);
