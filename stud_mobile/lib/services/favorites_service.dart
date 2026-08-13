import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/question.dart';

class FavoritesService {
  FavoritesService(this._api);

  final ApiClient _api;

  Future<List<Question>> getFavorites() async {
    try {
      final data = await _api.get<List<dynamic>>(
        '/favorites',
        parser: (d) => d as List<dynamic>,
      );
      return data.map((e) => Question.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<bool> isFavorite(int questionId) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/questions/$questionId/favorite',
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return data['isFavorite'] == true;
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> addFavorite(int questionId) async {
    try {
      await _api.post('/questions/$questionId/favorite');
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> removeFavorite(int questionId) async {
    try {
      await _api.delete('/questions/$questionId/favorite');
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final favoritesServiceProvider = Provider<FavoritesService>(
  (ref) => FavoritesService(ref.watch(apiClientProvider)),
);
