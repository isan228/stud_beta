import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';

class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.child});

  final Widget child;

  int _indexForLocation(String location) {
    if (location.startsWith('/tests')) return 1;
    if (location.startsWith('/usmle')) return 2;
    if (location.startsWith('/rating')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/');
      case 1:
        context.go('/tests');
      case 2:
        context.go('/usmle');
      case 3:
        context.go('/rating');
      case 4:
        context.go('/profile');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;
    final auth = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('stud.kg'),
        actions: [
          IconButton(
            icon: Icon(
              ref.watch(themeModeProvider) == ThemeMode.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
            ),
            onPressed: () => ref.read(themeModeProvider.notifier).toggle(),
          ),
          if (auth.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () => context.push('/chat'),
            ),
          PopupMenuButton<String>(
            onSelected: (value) {
              switch (value) {
                case 'favorites':
                  context.push('/favorites');
                case 'subscriptions':
                  context.push('/subscriptions');
                case 'contact':
                  context.push('/contact');
                case 'about':
                  context.push('/about');
                case 'news':
                  context.push('/news');
                case 'login':
                  context.push('/login');
                case 'logout':
                  ref.read(authProvider.notifier).logout();
              }
            },
            itemBuilder: (context) => [
              if (auth.isAuthenticated) ...[
                const PopupMenuItem(value: 'favorites', child: Text('Избранное')),
                const PopupMenuItem(value: 'subscriptions', child: Text('Подписки')),
              ],
              const PopupMenuItem(value: 'contact', child: Text('Обратная связь')),
              const PopupMenuItem(value: 'about', child: Text('О нас')),
              const PopupMenuItem(value: 'news', child: Text('Новости')),
              if (!auth.isAuthenticated)
                const PopupMenuItem(value: 'login', child: Text('Войти'))
              else
                const PopupMenuItem(value: 'logout', child: Text('Выход')),
            ],
          ),
        ],
      ),
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _indexForLocation(location),
        onDestinationSelected: (i) => _onTap(context, i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Главная'),
          NavigationDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: 'Тесты'),
          NavigationDestination(icon: Icon(Icons.medical_services_outlined), selectedIcon: Icon(Icons.medical_services), label: 'USMLE'),
          NavigationDestination(icon: Icon(Icons.emoji_events_outlined), selectedIcon: Icon(Icons.emoji_events), label: 'Рейтинг'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Профиль'),
        ],
      ),
    );
  }
}
