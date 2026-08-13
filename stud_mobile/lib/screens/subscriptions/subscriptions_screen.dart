import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/utils/helpers.dart';
import '../../core/widgets/state_views.dart';
import '../../models/subscription.dart';
import '../../providers/auth_provider.dart';
import '../../services/payments_service.dart';
import 'finik_payment_screen.dart';

class SubscriptionsScreen extends ConsumerStatefulWidget {
  const SubscriptionsScreen({super.key, this.program = 'university'});

  final String program;

  @override
  ConsumerState<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends ConsumerState<SubscriptionsScreen> {
  PlansResponse? _plans;
  bool _loading = true;
  String? _error;
  final _promoController = TextEditingController();
  String? _validatedPromo;
  int _discountPercent = 0;
  int _coinsToUse = 0;
  bool _paying = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _promoController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final plans = await ref.read(paymentsServiceProvider).getPlans(program: widget.program);
      if (!mounted) return;
      setState(() {
        _plans = plans;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _validatePromo() async {
    final code = _promoController.text.trim();
    if (code.isEmpty) return;
    try {
      final result = await ref.read(paymentsServiceProvider).validatePromo(code);
      setState(() {
        _validatedPromo = result.promoCode;
        _discountPercent = result.discountPercent;
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Промокод: -${result.discountPercent}%')));
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : 'Промокод недействителен';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> _buy(SubscriptionPlan plan) async {
    setState(() => _paying = true);
    try {
      final user = ref.read(authProvider).user;
      final prepare = await ref.read(paymentsServiceProvider).prepareMobilePayment(
            months: plan.months,
            programType: widget.program,
            coinsToUse: _coinsToUse.clamp(0, user?.coins ?? 0).toInt(),
            promoCode: _validatedPromo,
          );

      if (!mounted) return;
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => FinikPaymentScreen(prepare: prepare),
          fullscreenDialog: true,
        ),
      );

      if (ok == true) {
        await ref.read(authProvider.notifier).refreshUser();
        await _load();
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : e.toString();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.program == 'usmle' ? 'Подписка USMLE' : 'Подписки'),
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final plans = _plans!;
    final user = ref.watch(authProvider).user;
    final activeDate = widget.program == 'usmle'
        ? plans.usmleSubscriptionEndDate
        : plans.subscriptionEndDate;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (plans.universityName != null)
          Text('Университет: ${plans.universityName}', style: Theme.of(context).textTheme.titleMedium),
        if (isSubscriptionActive(activeDate))
          Card(
            child: ListTile(
              leading: const Icon(Icons.verified, color: Colors.green),
              title: const Text('Активная подписка'),
              subtitle: Text('До ${formatDate(DateTime.tryParse(activeDate!))}'),
            ),
          ),
        if (user != null) ...[
          const SizedBox(height: 12),
          Text('Монеты: ${user.coins}'),
          Slider(
            value: _coinsToUse.toDouble(),
            max: user.coins.toDouble(),
            divisions: user.coins > 0 ? user.coins : 1,
            label: '$_coinsToUse',
            onChanged: user.coins > 0 ? (v) => setState(() => _coinsToUse = v.round()) : null,
          ),
        ],
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _promoController,
                decoration: const InputDecoration(labelText: 'Промокод'),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(onPressed: _validatePromo, child: const Text('OK')),
          ],
        ),
        const SizedBox(height: 16),
        if (plans.plans.isEmpty)
          const EmptyView(message: 'Тарифы не найдены')
        else
          ...plans.plans.map(
            (plan) => Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                title: Text(plan.title),
                subtitle: Text('${plan.months} мес.'),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('${plan.price.toStringAsFixed(0)} сом'),
                    if (_discountPercent > 0)
                      Text('-$_discountPercent%', style: const TextStyle(color: Colors.green, fontSize: 12)),
                  ],
                ),
                onTap: _paying ? null : () => _buy(plan),
              ),
            ),
          ),
        const SizedBox(height: 8),
        const Text(
          'Оплата через Finik SDK: приложение, QR или карта. После успешной оплаты подписка активируется автоматически.',
          style: TextStyle(fontSize: 13),
        ),
      ],
    );
  }
}
