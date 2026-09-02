import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../screens/about/about_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/contact/contact_screen.dart';
import '../screens/favorites/favorites_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/news/news_screen.dart';
import '../screens/profile/change_password_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../screens/rating/rating_screen.dart';
import '../screens/schedule/my_schedule_screen.dart';
import '../screens/shell/main_shell.dart';
import '../screens/subscriptions/subscriptions_screen.dart';
import '../screens/tests/subject_tests_screen.dart';
import '../screens/tests/test_result_screen.dart';
import '../screens/tests/test_review_screen.dart';
import '../screens/tests/test_session_screen.dart';
import '../screens/tests/test_settings_screen.dart';
import '../screens/tests/tests_screen.dart';
import '../screens/usmle/usmle_screen.dart';
import '../screens/usmle/usmle_test_builder_screen.dart';
import 'go_router_refresh.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = GoRouterRefresh(ref);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    refreshListenable: refresh,
    initialLocation: '/',
    routes: [
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (_, __) => const NoTransitionPage(child: HomeScreen()),
          ),
          GoRoute(
            path: '/tests',
            pageBuilder: (_, __) => const NoTransitionPage(child: TestsScreen()),
            routes: [
              GoRoute(
                path: 'subject/:subjectId',
                builder: (context, state) {
                  final id = int.parse(state.pathParameters['subjectId']!);
                  final name = state.uri.queryParameters['name'] ?? 'Предмет';
                  return SubjectTestsScreen(subjectId: id, subjectName: name);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/usmle',
            pageBuilder: (_, __) => const NoTransitionPage(child: UsmleScreen()),
          ),
          GoRoute(
            path: '/rating',
            pageBuilder: (_, __) => const NoTransitionPage(child: RatingScreen()),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (_, __) => const NoTransitionPage(child: ProfileScreen()),
          ),
        ],
      ),
      GoRoute(
        path: '/login',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/favorites',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const FavoritesScreen(),
      ),
      GoRoute(
        path: '/subscriptions',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) {
          final program = state.uri.queryParameters['program'] ?? 'university';
          return SubscriptionsScreen(program: program);
        },
      ),
      GoRoute(
        path: '/chat',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const ChatScreen(),
      ),
      GoRoute(
        path: '/contact',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const ContactScreen(),
      ),
      GoRoute(
        path: '/about',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const AboutScreen(),
      ),
      GoRoute(
        path: '/news',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const NewsScreen(),
      ),
      GoRoute(
        path: '/change-password',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/schedule',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const MyScheduleScreen(),
      ),
      GoRoute(
        path: '/test-settings/:testId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final testId = int.parse(state.pathParameters['testId']!);
          final name = state.uri.queryParameters['name'] ?? 'Тест';
          final program = state.uri.queryParameters['program'] ?? 'university';
          return TestSettingsScreen(testId: testId, testName: name, program: program);
        },
      ),
      GoRoute(
        path: '/usmle-builder/:testId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final testId = int.parse(state.pathParameters['testId']!);
          final name = state.uri.queryParameters['name'] ?? 'USMLE тест';
          return UsmleTestBuilderScreen(testId: testId, testName: name);
        },
      ),
      GoRoute(
        path: '/test-session',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const TestSessionScreen(),
      ),
      GoRoute(
        path: '/test-result',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const TestResultScreen(),
      ),
      GoRoute(
        path: '/test-review/:resultId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final resultId = int.parse(state.pathParameters['resultId']!);
          return TestReviewScreen(resultId: resultId);
        },
      ),
    ],
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      if (!auth.isInitialized) return null;

      final path = state.uri.path;
      final isAuthRoute = path == '/login' || path == '/register';

      if (!auth.isAuthenticated &&
          (path == '/favorites' ||
              path == '/subscriptions' ||
              path == '/chat' ||
              path == '/change-password' ||
              path == '/schedule' ||
              path == '/profile')) {
        return '/login?redirect=${Uri.encodeComponent(path)}';
      }

      if (auth.isAuthenticated && isAuthRoute) {
        return '/';
      }

      return null;
    },
  );
});
