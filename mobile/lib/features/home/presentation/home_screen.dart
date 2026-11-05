import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../debt/presentation/debt_controller.dart';
import '../../debt/presentation/debt_screen.dart';
import '../../history/presentation/history_controller.dart';
import '../../history/presentation/history_screen.dart';
import '../../sales/data/mock_sales_repository.dart';
import '../../sales/domain/sales_repository.dart';
import '../../sales/presentation/pos_controller.dart';
import '../../sales/presentation/pos_screen.dart';
import '../../stores/presentation/store_controller.dart';

/// Màn hình Trang chủ Tạp hóa BIN.
///
/// Quản lý trung tâm điều hướng các phân hệ nghiệp vụ:
/// - POS Bán hàng (Phần 4)
/// - Sổ nợ & Thu nợ khách hàng (Phần 4)
/// - Nhật ký giao dịch (Phần 4)
/// - Nhập hàng, Kiểm kho & Báo cáo doanh thu (Phần 5)
class HomeScreen extends StatelessWidget {
  final AuthController authController;
  final StoreController storeController;
  final SalesRepository salesRepository;

  HomeScreen({
    super.key,
    required this.authController,
    required this.storeController,
    SalesRepository? salesRepository,
  }) : salesRepository = salesRepository ?? MockSalesRepository();

  @override
  Widget build(BuildContext context) {
    final store = storeController.selectedStore;
    final user = authController.user;
    final storeId = store?.id ?? 'default-store';

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
                                  'Vai trò: ${store?.isOwner == true ? "Chủ cửa hàng" : "Nhân viên"} • ${store?.storeType ?? ""}',
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
                statusBadge: 'Sẵn sàng',
                badgeColor: const Color(0xFF059669),
                onTap: () {
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
                statusBadge: 'Sẵn sàng',
                badgeColor: const Color(0xFFDC2626),
                onTap: () {
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

              // Nhật ký hoạt động
              _buildFeatureCard(
                title: 'Nhật ký giao dịch',
                subtitle: 'Dòng thời gian các đơn bán hàng và thu tiền nợ',
                icon: Icons.receipt_long_rounded,
                iconColor: const Color(0xFF2563EB),
                statusBadge: 'Sẵn sàng',
                badgeColor: const Color(0xFF2563EB),
                onTap: () {
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
              const SizedBox(height: 10),

              // Kiểm kho & Nhập hàng (Phần 5)
              _buildFeatureCard(
                title: 'Kiểm kho & Nhập hàng',
                subtitle: 'Hao hụt, kiểm kê, đơn vị quy đổi (Phần 5)',
                icon: Icons.inventory_2_outlined,
                iconColor: const Color(0xFFD97706),
                statusBadge: 'Phần 5',
                badgeColor: const Color(0xFF64748B),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Chức năng kiểm kho & nhập hàng nằm ở Phần 5.',
                      ),
                      duration: Duration(seconds: 1),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              // Báo cáo doanh thu (Phần 5)
              _buildFeatureCard(
                title: 'Báo cáo doanh thu & Lãi lỗ',
                subtitle:
                    'Doanh thu, giá vốn, lợi nhuận server-computed (Phần 5)',
                icon: Icons.bar_chart_rounded,
                iconColor: const Color(0xFF7C3AED),
                statusBadge: 'Phần 5',
                badgeColor: const Color(0xFF64748B),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Chức năng báo cáo quản trị nằm ở Phần 5.'),
                      duration: Duration(seconds: 1),
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
