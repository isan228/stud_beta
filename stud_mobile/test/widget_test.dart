import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:stud_mobile/app.dart';

void main() {
  testWidgets('App boots', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: AppBootstrap()));
    await tester.pump();
    expect(find.textContaining('stud'), findsWidgets);
  });
}
