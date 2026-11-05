import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/app_button.dart';
import 'package:mobile/features/debt/presentation/debt_controller.dart';
import 'package:mobile/features/debt/presentation/debt_screen.dart';
import 'package:mobile/features/history/presentation/history_controller.dart';
import 'package:mobile/features/history/presentation/history_screen.dart';
import 'package:mobile/features/inventory/data/mock_inventory_repository.dart';
import 'package:mobile/features/inventory/domain/inventory_models.dart';
import 'package:mobile/features/inventory/presentation/inventory_controller.dart';
import 'package:mobile/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile/features/inventory/presentation/restock_controller.dart';
import 'package:mobile/features/inventory/presentation/restock_screen.dart';
import 'package:mobile/features/reports/data/mock_report_repository.dart';
import 'package:mobile/features/reports/domain/report_models.dart';
import 'package:mobile/features/reports/presentation/report_controller.dart';
import 'package:mobile/features/reports/presentation/report_screen.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';
import 'package:mobile/features/sales/domain/sales_models.dart';
import 'package:mobile/features/sales/presentation/pos_controller.dart';
import 'package:mobile/features/sales/presentation/pos_screen.dart';

class RecordingSalesRepository extends MockSalesRepository {
  int debtorLoads = 0;
  SaleIntent? lastSale;
  DebtPaymentIntent? lastPayment;

  @override
  Future<List<CustomerDebtItem>> getDebtors(String storeId) async {
    debtorLoads++;
    return super.getDebtors(storeId);
  }

  @override
  Future<SaleResult> createSale(SaleIntent intent) async {
    lastSale = intent;
    return super.createSale(intent);
  }

  @override
  Future<DebtPaymentResult> recordDebtPayment(DebtPaymentIntent intent) async {
    lastPayment = intent;
    return super.recordDebtPayment(intent);
  }
}

class RecordingInventoryRepository extends MockInventoryRepository {
  InventoryCountIntent? lastCount;
  AdjustStockIntent? lastAdjustment;
  ReceiveStockIntent? lastReceipt;

  @override
  Future<InventoryCountResult> countStock(InventoryCountIntent intent) async {
    lastCount = intent;
    return super.countStock(intent);
  }

  @override
  Future<AdjustStockResult> adjustStock(AdjustStockIntent intent) async {
    lastAdjustment = intent;
    return super.adjustStock(intent);
  }

  @override
  Future<ReceiveStockResult> receiveStock(ReceiveStockIntent intent) async {
    lastReceipt = intent;
    return super.receiveStock(intent);
  }
}

class RecordingReportRepository extends MockReportRepository {
  final requestedDays = <int>[];

  @override
  Future<ManagementReport> getManagementReport(
    String storeId, {
    int days = 7,
  }) async {
    requestedDays.add(days);
    return super.getManagementReport(storeId, days: days);
  }
}

void main() {
  testWidgets('POS credit checkout loads debt book customers', (tester) async {
    final salesRepository = RecordingSalesRepository();
    final controller = PosController(
      salesRepository: salesRepository,
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: PosScreen(posController: controller)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add_shopping_cart_rounded).last);
    await tester.pumpAndSettle();
    expect(controller.cartCount, 1);
    await tester.tap(find.widgetWithText(AppButton, 'Xem giỏ & Thu tiền'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ghi nợ'));
    await tester.pumpAndSettle();

    expect(salesRepository.debtorLoads, 1);
    expect(
      find.byType(DropdownButtonFormField<CustomerDebtItem>),
      findsOneWidget,
    );
    await tester.tap(find.byType(DropdownButtonFormField<CustomerDebtItem>));
    await tester.pumpAndSettle();
    expect(find.textContaining('Cô Ba Hàng Xóm'), findsWidgets);
    await tester.tap(find.textContaining('Cô Ba Hàng Xóm').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, 'Thanh toán (Tạo đơn)'));
    await tester.pumpAndSettle();
    expect(salesRepository.lastSale?.paymentType, 'credit');
    expect(salesRepository.lastSale?.customerId, 'cust-1');
    expect(controller.cart, isEmpty);
  });

  testWidgets('periodic stock count sends actual quantity and version', (
    tester,
  ) async {
    final inventoryRepository = RecordingInventoryRepository();
    final controller = InventoryController(
      inventoryRepository: inventoryRepository,
      salesRepository: MockSalesRepository(),
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: InventoryScreen(inventoryController: controller)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Kiểm kê định kỳ'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kiểm đếm').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Kiểm kê:'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '118');
    await tester.tap(find.widgetWithText(AppButton, 'Ghi nhận kiểm kê'));
    await tester.pumpAndSettle();
    expect(inventoryRepository.lastAdjustment, isNull);
    expect(inventoryRepository.lastCount?.items.single.actualBase, 118);
    expect(inventoryRepository.lastCount?.items.single.expectedVersion, 1);
  });

  testWidgets('staff inventory view omits owner-only stock count', (
    tester,
  ) async {
    final controller = InventoryController(
      inventoryRepository: RecordingInventoryRepository(),
      salesRepository: MockSalesRepository(),
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: InventoryScreen(inventoryController: controller, canCount: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hao hụt & Điều chỉnh'), findsOneWidget);
    expect(find.text('Kiểm kê định kỳ'), findsNothing);
  });

  testWidgets('debt payment sends amount and payment method', (tester) async {
    final repository = RecordingSalesRepository();
    final controller = DebtController(
      salesRepository: repository,
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: DebtScreen(debtController: controller)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, 'Thu nợ').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '100000');
    await tester.tap(find.text('Chuyển khoản'));
    await tester.tap(find.widgetWithText(AppButton, 'Xác nhận thu nợ'));
    await tester.pumpAndSettle();
    expect(repository.lastPayment?.customerId, 'cust-1');
    expect(repository.lastPayment?.amount, 100000);
    expect(repository.lastPayment?.paymentMethod, 'bank');
  });

  testWidgets('restock submits selected product to repository', (tester) async {
    final inventoryRepository = RecordingInventoryRepository();
    final controller = RestockController(
      inventoryRepository: inventoryRepository,
      salesRepository: MockSalesRepository(),
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: RestockScreen(restockController: controller)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chọn hàng'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gạo ST25 Ông Cua (5kg)').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thêm vào phiếu'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, 'Lưu phiếu nhập kho'));
    await tester.pumpAndSettle();
    expect(inventoryRepository.lastReceipt?.items.single.productId, 'prod-3');
    expect(inventoryRepository.lastReceipt?.items.single.quantity, 10);
    expect(controller.items, isEmpty);
  });

  testWidgets('report period filter reloads server report', (tester) async {
    final repository = RecordingReportRepository();
    final controller = ReportController(
      reportRepository: repository,
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: ReportScreen(reportController: controller)),
    );
    await tester.pumpAndSettle();
    expect(repository.requestedDays, [7]);
    await tester.tap(find.text('30 ngày'));
    await tester.pumpAndSettle();
    expect(repository.requestedDays, [7, 30]);
    expect(find.text('Lợi nhuận gộp:'), findsOneWidget);
  });

  testWidgets('history shows activity from repository', (tester) async {
    final controller = HistoryController(
      salesRepository: MockSalesRepository(),
      storeId: 'test-store',
    );
    await tester.pumpWidget(
      MaterialApp(home: HistoryScreen(historyController: controller)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Bán hàng #DH-0042'), findsOneWidget);
    expect(find.text('Thu nợ Cô Ba'), findsOneWidget);
  });
}
