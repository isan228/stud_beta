import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/subscription.dart';

class PaymentsService {
  PaymentsService(this._api);

  final ApiClient _api;

  Future<PlansResponse> getPlans({String program = 'university'}) async {
    try {
      final data = await _api.get<Map<String, dynamic>>(
        '/payments/plans',
        queryParameters: {'program': program},
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return PlansResponse.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<({bool valid, int discountPercent, String promoCode})> validatePromo(String code) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/payments/validate-promo',
        data: {'promoCode': code},
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return (
        valid: data['valid'] == true,
        discountPercent: data['discountPercent'] as int? ?? 0,
        promoCode: data['promoCode'] as String? ?? code,
      );
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<PaymentCreateResponse> createPayment({
    required int months,
    String programType = 'university',
    int coinsToUse = 0,
    String? promoCode,
  }) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/payments/create',
        data: {
          'subscriptionType': months.toString(),
          'programType': programType,
          'coinsToUse': coinsToUse,
          if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return PaymentCreateResponse.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final paymentsServiceProvider = Provider<PaymentsService>(
  (ref) => PaymentsService(ref.watch(apiClientProvider)),
);
