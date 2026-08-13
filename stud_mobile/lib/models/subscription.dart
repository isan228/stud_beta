class SubscriptionPlan {
  SubscriptionPlan({
    required this.months,
    required this.title,
    required this.price,
    this.oldPrice,
    this.id,
    this.programType,
  });

  final int months;
  final String title;
  final double price;
  final double? oldPrice;
  final int? id;
  final String? programType;

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) => SubscriptionPlan(
        months: json['months'] as int? ?? int.tryParse('${json['id']}') ?? 1,
        title: json['title'] as String? ?? json['name'] as String? ?? '',
        price: (json['price'] as num?)?.toDouble() ?? 0,
        oldPrice: (json['oldPrice'] as num?)?.toDouble(),
        id: json['id'] as int?,
        programType: json['programType'] as String?,
      );
}

class PlansResponse {
  PlansResponse({
    required this.programType,
    required this.plans,
    this.subscriptionEndDate,
    this.usmleSubscriptionEndDate,
    this.usmleSubscriptionActive = false,
    this.universityName,
  });

  final String programType;
  final List<SubscriptionPlan> plans;
  final String? subscriptionEndDate;
  final String? usmleSubscriptionEndDate;
  final bool usmleSubscriptionActive;
  final String? universityName;

  factory PlansResponse.fromJson(Map<String, dynamic> json) {
    final uni = json['university'] as Map<String, dynamic>?;
    return PlansResponse(
      programType: json['programType'] as String? ?? 'university',
      plans: (json['plans'] as List? ?? [])
          .map((e) => SubscriptionPlan.fromJson(e as Map<String, dynamic>))
          .toList(),
      subscriptionEndDate: json['subscriptionEndDate'] as String?,
      usmleSubscriptionEndDate: json['usmleSubscriptionEndDate'] as String?,
      usmleSubscriptionActive: json['usmleSubscriptionActive'] == true,
      universityName: uni?['name'] as String?,
    );
  }
}

class PaymentCreateResponse {
  PaymentCreateResponse({
    required this.paymentUrl,
    this.transactionId,
  });

  final String paymentUrl;
  final String? transactionId;

  factory PaymentCreateResponse.fromJson(Map<String, dynamic> json) =>
      PaymentCreateResponse(
        paymentUrl: json['paymentUrl'] as String? ??
            json['url'] as String? ??
            json['redirectUrl'] as String? ??
            '',
        transactionId: json['transactionId'] as String?,
      );
}
