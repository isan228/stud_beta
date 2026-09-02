import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/misc.dart';
import '../../services/auth_service.dart';

final accountAlertsProvider = FutureProvider.autoDispose<List<AccountAlert>>((ref) async {
  final auth = ref.watch(authServiceProvider);
  final results = await Future.wait([
    auth.fetchBroadcastAlerts(),
    auth.fetchDeviceAlerts(),
  ]);
  return [...results[0], ...results[1]];
});

Future<void> showAccountAlertsSheet(BuildContext context, WidgetRef ref) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _AccountAlertsSheet(),
  );
  ref.invalidate(accountAlertsProvider);
}

class _AccountAlertsSheet extends ConsumerWidget {
  const _AccountAlertsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(accountAlertsProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Уведомления', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Flexible(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.55,
                ),
                child: alertsAsync.when(
                  loading: () => const Center(child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  )),
                  error: (e, _) => Center(child: Text(e.toString())),
                  data: (alerts) {
                    if (alerts.isEmpty) {
                      return const Center(child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('Нет новых уведомлений'),
                      ));
                    }
                    return ListView.builder(
                      shrinkWrap: true,
                      itemCount: alerts.length,
                      itemBuilder: (context, index) {
                        final alert = alerts[index];
                        return Card(
                          child: ListTile(
                            title: Text(alert.title),
                            subtitle: Text(alert.message),
                            isThreeLine: alert.message.length > 60,
                            trailing: IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () async {
                                final auth = ref.read(authServiceProvider);
                                if (alert.isDevice) {
                                  await auth.dismissDeviceAlert(alert.id);
                                } else {
                                  await auth.dismissBroadcastAlert(alert.id);
                                }
                                ref.invalidate(accountAlertsProvider);
                              },
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AccountAlertsIconButton extends ConsumerWidget {
  const AccountAlertsIconButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(accountAlertsProvider);

    final count = alertsAsync.maybeWhen(
      data: (alerts) => alerts.length,
      orElse: () => 0,
    );

    return IconButton(
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: const Icon(Icons.notifications_outlined),
      ),
      tooltip: 'Уведомления',
      onPressed: () => showAccountAlertsSheet(context, ref),
    );
  }
}
