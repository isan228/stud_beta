import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../models/subscription.dart';

class MobilePaymentPrepare {
  MobilePaymentPrepare({
    required this.transactionId,
    required this.requestId,
    required this.amount,
    required this.originalAmount,
    required this.coinsUsed,
    required this.apiKey,
    required this.accountId,
    required this.isBeta,
    required this.nameEn,
    required this.callbackUrl,
    required this.description,
    required this.requiredFields,
    this.promoCode,
    this.promoDiscountPercent = 0,
  });

  final int transactionId;
  final String requestId;
  final double amount;
  final double originalAmount;
  final int coinsUsed;
  final String apiKey;
  final String accountId;
  final bool isBeta;
  final String nameEn;
  final String callbackUrl;
  final String description;
  final Map<String, String> requiredFields;
  final String? promoCode;
  final int promoDiscountPercent;

  factory MobilePaymentPrepare.fromJson(Map<String, dynamic> json) {
    final sdk = json['sdk'] as Map<String, dynamic>? ?? {};
    final rawFields = json['requiredFields'] as Map<String, dynamic>? ?? {};
    return MobilePaymentPrepare(
      transactionId: json['transactionId'] as int,
      requestId: json['requestId'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      originalAmount: (json['originalAmount'] as num?)?.toDouble() ?? 0,
      coinsUsed: json['coinsUsed'] as int? ?? 0,
      apiKey: sdk['apiKey'] as String? ?? '',
      accountId: sdk['accountId'] as String? ?? '',
      isBeta: sdk['isBeta'] == true,
      nameEn: sdk['nameEn'] as String? ?? 'stud.kg Payment',
      callbackUrl: sdk['callbackUrl'] as String? ?? '',
      description: sdk['description'] as String? ?? 'Подписка stud.kg',
      requiredFields: rawFields.map((k, v) => MapEntry(k, v?.toString() ?? '')),
      promoCode: json['promoCode'] as String?,
      promoDiscountPercent: json['promoDiscountPercent'] as int? ?? 0,
    );
  }
}

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

  Future<MobilePaymentPrepare> prepareMobilePayment({
    required int months,
    String programType = 'university',
    int coinsToUse = 0,
    String? promoCode,
  }) async {
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/payments/mobile-prepare',
        data: {
          'subscriptionType': months.toString(),
          'programType': programType,
          'coinsToUse': coinsToUse,
          if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
        },
        parser: (d) => Map<String, dynamic>.from(d as Map),
      );
      return MobilePaymentPrepare.fromJson(data);
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }

  Future<void> bindMobilePayment({
    required int transactionId,
    String? finikTransactionId,
    String? itemId,
    Map<String, dynamic>? createdPayload,
  }) async {
    try {
      await _api.post('/payments/mobile-bind', data: {
        'transactionId': transactionId,
        if (finikTransactionId != null) 'finikTransactionId': finikTransactionId,
        if (itemId != null) 'itemId': itemId,
        if (createdPayload != null) 'createdPayload': createdPayload,
      });
    } on DioException catch (e) {
      throw _api.rethrowAsApi(e);
    }
  }
}

final paymentsServiceProvider = Provider<PaymentsService>(
  (ref) => PaymentsService(ref.watch(apiClientProvider)),
);
