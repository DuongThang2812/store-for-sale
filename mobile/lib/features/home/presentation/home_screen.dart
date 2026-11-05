import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../debt/presentation/debt_controller.dart';
import '../../debt/presentation/debt_screen.dart';
import '../../history/presentation/history_controller.dart';
import '../../history/presentation/history_screen.dart';
import '../../inventory/data/mock_inventory_repository.dart';
import '../../inventory/domain/inventory_repository.dart';
import '../../inventory/presentation/inventory_controller.dart';
import '../../inventory/presentation/inventory_screen.dart';
import '../../inventory/presentation/restock_controller.dart';
import '../../inventory/presentation/restock_screen.dart';
import '../../reports/data/mock_report_repository.dart';
import '../../reports/domain/report_repository.dart';
import '../../reports/presentation/report_controller.dart';
import '../../reports/presentation/report_screen.dart';
import '../../sales/data/mock_sales_repository.dart';
import '../../sales/domain/sales_repository.dart';
import '../../sales/presentation/pos_controller.dart';
import '../../sales/presentation/pos_screen.dart';
import '../../stores/presentation/store_controller.dart';

/// Màn hình Trang chủ Tạp hóa BIN.
///
/// Quản lý trung tâm điều hướng các phân hệ nghiệp vụ và kiểm tra phân quyền người dùng:
/// - POS Bán hàng (Phần 4)
/// - Sổ nợ & Thu nợ khách hàng (Phần 4)
/// - Nhật ký giao dịch (Phần 4)
/// - Nhập hàng từ nhà cung cấp (Phần 5)
/// - Kiểm kho & Hao hụt (Phần 5)
/// - Báo cáo doanh thu & Lợi nhuận gộp (Phần 5)
class HomeScreen extends StatelessWidget {
  final AuthController authController;
  final StoreController storeController;
  final SalesRepository salesRepository;
  final InventoryRepository inventoryRepository;
  final ReportRepository reportRepository;

  HomeScreen({
    super.key,
    required this.authController,
    required this.storeController,
    SalesRepository? salesRepository,
    InventoryRepository? inventoryRepository,
    ReportRepository? reportRepository,
  }) : salesRepository = salesRepository ?? MockSalesRepository(),
       inventoryRepository = inventoryRepository ?? MockInventoryRepository(),
       reportRepository = reportRepository ?? MockReportRepository();

  @override
  Widget build(BuildContext context) {
    final store = storeController.selectedStore;
    final user = authController.user;
    final storeId = store?.id ?? 'default-store';
    final isOwner = store?.isOwner ?? false;
    final canSell = isOwner || (store?.permissions.canSell ?? false);
    final canReceiveStock = store?.canReceiveStock ?? false;
    final canManageDebt = store?.canManageDebt ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(store?.name ?? 'Tạp hóa BIN'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history_rounded),
            tooltip: 'Nhật ký giao dịch',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => HistoryScreen(
                    historyController: HistoryController(
                      salesRepository: salesRepository,
                      storeId: storeId,
                    ),
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.swap_horiz_rounded),
            tooltip: 'Đổi cửa hàng',
            onPressed: () {
              storeController.clearStore();
              authController.initialize();
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Đăng xuất',
            onPressed: () => authController.signOut(),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Thẻ thông tin cửa hàng đang hoạt động
              Card(
                elevation: 0,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFECFDF5),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.store_rounded,
                              color: Color(0xFF059669),
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  store?.name ?? 'Chưa xác định',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Vai trò: ${isOwner ? "Chủ cửa hàng" : "Nhân viên"} • ${store?.storeType ?? ""}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF64748B),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      const Divider(height: 1, color: Color(0xFFE2E8F0)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(
                            Icons.person_outline,
                            size: 16,
                            color: Color(0xFF64748B),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Tài khoản: ${user?.email ?? "chưa xác định"}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              const Text(
                'Chức năng nghiệp vụ',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 12),

              // Bán hàng (POS)
              _buildFeatureCard(
                title: 'Bán hàng (POS)',
                subtitle: 'Tìm hàng, quét mã, giỏ hàng, tiền mặt / ghi nợ',
                icon: Icons.point_of_sale_rounded,
                iconColor: const Color(0xFF059669),
                statusBadge: canSell ? 'Sẵn sàng' : 'Giới hạn',
                badgeColor: canSell
                    ? const Color(0xFF059669)
                    : const Color(0xFF94A3B8),
                onTap: () {
                  if (!canSell) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Bạn không có quyền bán hàng.'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PosScreen(
                        posController: PosController(
                          salesRepository: salesRepository,
                          storeId: storeId,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              // Sổ nợ khách hàng
              _buildFeatureCard(
                title: 'Sổ nợ khách hàng',
                subtitle: 'Theo dõi dư nợ và thu nợ từng phần atomic',
                icon: Icons.book_outlined,
                iconColor: const Color(0xFFDC2626),
                statusBadge: isOwner || canManageDebt ? 'Sẵn sàng' : 'Giới hạn',
                badgeColor: isOwner || canManageDebt
                    ? const Color(0xFFDC2626)
                    : const Color(0xFF94A3B8),
                onTap: () {
                  if (!isOwner && !canManageDebt) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Bạn không có quyền quản lý sổ nợ.'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => DebtScreen(
                        debtController: DebtController(
                          salesRepository: salesRepository,
                          storeId: storeId,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              // Nhập hàng (Nhà cung cấp)
              _buildFeatureCard(
                title: 'Nhập hàng từ nhà cung cấp',
                subtitle: 'Lập phiếu nhập kho, tính giá vốn và cộng tồn kho',
                icon: Icons.local_shipping_outlined,
                iconColor: const Color(0xFF0284C7),
                statusBadge: isOwner || canReceiveStock
                    ? 'Sẵn sàng'
                    : 'Giới hạn',
                badgeColor: isOwner || canReceiveStock
                    ? const Color(0xFF0284C7)
                    : const Color(0xFF94A3B8),
                onTap: () {
                  if (!isOwner && !canReceiveStock) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Bạn không có quyền nhập hàng.'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => RestockScreen(
                        restockController: RestockController(
                          inventoryRepository: inventoryRepository,
                          salesRepository: salesRepository,
                          storeId: storeId,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              // Kiểm kho & Hao hụt (Phần 5)
              _buildFeatureCard(
                title: 'Kiểm kho & Hao hụt',
                subtitle: 'Báo hỏng, hao hụt, mất mát và kiểm kê thực tế',
                icon: Icons.inventory_2_outlined,
                iconColor: const Color(0xFFD97706),
                statusBadge: isOwner || canReceiveStock
                    ? 'Sẵn sàng'
                    : 'Giới hạn',
                badgeColor: isOwner || canReceiveStock
                    ? const Color(0xFFD97706)
                    : const Color(0xFF94A3B8),
                onTap: () {
                  if (!isOwner && !canReceiveStock) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Bạn không có quyền kiểm kho & điều chỉnh hao hụt.',
                        ),
                        duration: Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => InventoryScreen(
                        canCount: isOwner,
                        inventoryController: InventoryController(
                          inventoryRepository: inventoryRepository,
                          salesRepository: salesRepository,
                          storeId: storeId,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              // Báo cáo doanh thu & Lợi nhuận (Phần 5)
              _buildFeatureCard(
                title: 'Báo cáo doanh thu & Lãi lỗ',
                subtitle: 'Doanh thu, giá vốn, lợi nhuận server-computed',
                icon: Icons.bar_chart_rounded,
                iconColor: const Color(0xFF7C3AED),
                statusBadge: isOwner ? 'Chủ tiệm' : 'Khóa',
                badgeColor: isOwner
                    ? const Color(0xFF7C3AED)
                    : const Color(0xFF94A3B8),
                onTap: () {
                  if (!isOwner) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Chỉ chủ cửa hàng mới có quyền xem báo cáo tài chính.',
                        ),
                        duration: Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ReportScreen(
                        reportController: ReportController(
                          reportRepository: reportRepository,
                          storeId: storeId,
                        ),
                      ),
                    ),
                  );
                },
              ),

              const SizedBox(height: 28),

              AppButton(
                label: 'Đổi cửa hàng khác',
                icon: Icons.swap_horiz_rounded,
                isOutlined: true,
                onPressed: () {
                  storeController.clearStore();
                  authController.initialize();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFeatureCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required String statusBadge,
    required Color badgeColor,
    required VoidCallback onTap,
  }) {
    return Card(
      elevation: 0,
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: iconColor, size: 24),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: Color(0xFF0F172A),
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: badgeColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            statusBadge,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: badgeColor,
            ),
          ),
        ),
        onTap: onTap,
      ),
    );
  }
}
