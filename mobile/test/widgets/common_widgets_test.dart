import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/app_button.dart';
import 'package:mobile/core/widgets/app_empty_view.dart';
import 'package:mobile/core/widgets/app_error_view.dart';
import 'package:mobile/core/widgets/app_loading_view.dart';

void main() {
  Widget wrapWithMaterial(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  group('Common Widgets Tests', () {
    testWidgets('AppButton responds to taps and shows loading spinner', (
      tester,
    ) async {
      var tapped = false;

      await tester.pumpWidget(
        wrapWithMaterial(
          AppButton(label: 'Xác nhận', onPressed: () => tapped = true),
        ),
      );

      expect(find.text('Xác nhận'), findsOneWidget);
      await tester.tap(find.text('Xác nhận'));
      expect(tapped, isTrue);

      // Now with loading = true
      await tester.pumpWidget(
        wrapWithMaterial(
          AppButton(
            label: 'Xác nhận',
            isLoading: true,
            onPressed: () => tapped = false,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('AppErrorView triggers onRetry callback', (tester) async {
      var retried = false;

      await tester.pumpWidget(
        wrapWithMaterial(
          AppErrorView(
            message: 'Không thể kết nối máy chủ',
            onRetry: () => retried = true,
          ),
        ),
      );

      expect(find.text('Không thể kết nối máy chủ'), findsOneWidget);
      expect(find.text('Thử lại'), findsOneWidget);

      await tester.tap(find.text('Thử lại'));
      expect(retried, isTrue);
    });

    testWidgets(
      'AppEmptyView displays title, description and triggers action',
      (tester) async {
        var actionTriggered = false;

        await tester.pumpWidget(
          wrapWithMaterial(
            AppEmptyView(
              title: 'Không có sản phẩm',
              message: 'Vui lòng thêm sản phẩm vào danh mục.',
              actionLabel: 'Thêm mới',
              onAction: () => actionTriggered = true,
            ),
          ),
        );

        expect(find.text('Không có sản phẩm'), findsOneWidget);
        expect(
          find.text('Vui lòng thêm sản phẩm vào danh mục.'),
          findsOneWidget,
        );
        expect(find.text('Thêm mới'), findsOneWidget);

        await tester.tap(find.text('Thêm mới'));
        expect(actionTriggered, isTrue);
      },
    );

    testWidgets('AppLoadingView displays custom message', (tester) async {
      await tester.pumpWidget(
        wrapWithMaterial(
          const AppLoadingView(message: 'Đang chuẩn bị dữ liệu...'),
        ),
      );

      expect(find.text('Đang chuẩn bị dữ liệu...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
