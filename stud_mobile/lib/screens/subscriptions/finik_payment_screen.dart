import 'package:finik_sdk/finik_sdk.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/auth_provider.dart';
import '../../services/payments_service.dart';

/// Экран оплаты через нативный Finik SDK (не браузер).
class FinikPaymentScreen extends ConsumerStatefulWidget {
  const FinikPaymentScreen({super.key, required this.prepare});

  final MobilePaymentPrepare prepare;

  @override
  ConsumerState<FinikPaymentScreen> createState() => _FinikPaymentScreenState();
}

class _FinikPaymentScreenState extends ConsumerState<FinikPaymentScreen> {
  bool _finished = false;

  List<RequiredField> get _requiredFields {
    return widget.prepare.requiredFields.entries
        .map(
          (e) => RequiredField(
            fieldId: e.key,
            label: e.key,
            value: e.value,
            isHidden: true,
          ),
        )
        .toList();
  }

  Future<void> _bindCreated(Map<String, dynamic>? data) async {
    if (data == null) return;
    try {
      final itemId = data['id']?.toString();
      final paymentId = data['transactionId']?.toString() ??
          data['paymentId']?.toString() ??
          itemId;
      await ref.read(paymentsServiceProvider).bindMobilePayment(
            transactionId: widget.prepare.transactionId,
            finikTransactionId: paymentId,
            itemId: itemId,
            createdPayload: data,
          );
    } catch (_) {
      // Webhook всё равно сможет найти транзакцию по mobileRequestId
    }
  }

  void _onPayment(Map<String, dynamic>? data) {
    if (_finished || data == null) return;
    final status = (data['status'] ?? '').toString().toUpperCase();
    if (status == 'SUCCEEDED' || status == 'SUCCESS') {
      _finished = true;
      ref.read(authProvider.notifier).refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Оплата прошла успешно. Подписка обновится в течение минуты.')),
      );
      Navigator.of(context).pop(true);
    } else if (status == 'FAILED' || status == 'FAILURE') {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Оплата не удалась')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final prepare = widget.prepare;

    return Scaffold(
      body: FinikProvider(
        apiKey: prepare.apiKey,
        isBeta: prepare.isBeta,
        locale: FinikSdkLocale.RU,
        textScenario: TextScenario.PAYMENT,
        paymentMethods: const [PaymentMethod.APP, PaymentMethod.QR, PaymentMethod.VISA],
        enableShimmer: true,
        enableShare: true,
        enableSupportButtons: true,
        tapableSupportButtons: true,
        onBackPressed: () {
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(false);
          }
        },
        onPayment: _onPayment,
        widget: CreateItemHandlerWidget(
          accountId: AccountId(prepare.accountId),
          nameEn: prepare.nameEn,
          requestId: prepare.requestId,
          amount: FixedAmount(prepare.amount),
          description: prepare.description,
          callbackUrl: prepare.callbackUrl,
          visibilityType: VisibilityType.PRIVATE,
          actionLabelType: ActionLabelType.BUY,
          requiredFields: _requiredFields,
          onCreated: _bindCreated,
        ),
      ),
    );
  }
}
