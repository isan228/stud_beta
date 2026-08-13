import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../providers/token_holder.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({Dio? dio})
      : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: AppConfig.apiUrl,
                connectTimeout: const Duration(seconds: 30),
                receiveTimeout: const Duration(seconds: 30),
                headers: {'Content-Type': 'application/json'},
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = authTokenHolder.token;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final response = error.response;
          if (response != null) {
            handler.reject(
              DioException(
                requestOptions: error.requestOptions,
                response: response,
                type: error.type,
                error: ApiException(
                  extractErrorMessage(response.data),
                  statusCode: response.statusCode,
                  details: response.data,
                ),
              ),
            );
            return;
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio _dio;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    T Function(dynamic data)? parser,
  }) async {
    final response = await _dio.get<dynamic>(path, queryParameters: queryParameters);
    return _parse(response.data, parser);
  }

  Future<T> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    T Function(dynamic data)? parser,
  }) async {
    final response = await _dio.post<dynamic>(
      path,
      data: data,
      queryParameters: queryParameters,
    );
    return _parse(response.data, parser);
  }

  Future<T> put<T>(
    String path, {
    dynamic data,
    T Function(dynamic data)? parser,
  }) async {
    final response = await _dio.put<dynamic>(path, data: data);
    return _parse(response.data, parser);
  }

  Future<T> delete<T>(
    String path, {
    T Function(dynamic data)? parser,
  }) async {
    final response = await _dio.delete<dynamic>(path);
    return _parse(response.data, parser);
  }

  T _parse<T>(dynamic data, T Function(dynamic data)? parser) {
    if (parser != null) return parser(data);
    return data as T;
  }

  Never rethrowAsApi(DioException e) {
    if (e.error is ApiException) throw e.error as ApiException;
    throw ApiException('Ошибка соединения с сервером');
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});
