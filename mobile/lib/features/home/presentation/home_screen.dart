import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../stores/presentation/store_controller.dart';

/// Màn hình Trang chủ (Khung nền tảng Phần 2).
///
/// Hiển thị tên cửa hàng thật đã được chọn và thông tin phiên làm việc.
/// TUYỆT ĐỐI KHÔNG hiển thị số liệu doanh thu/tồn kho/công nợ giả để tránh sai lệch dữ liệu.
class HomeScreen extends StatelessWidget {
  final AuthController authController;
  final StoreController storeController;

  const HomeScreen({
    super.key,
    required this.authController,
    required this.storeController,
  });

  @override
  Widget build(BuildContext context) {
    final store = storeController.selectedStore;
    final user = authController.user;

    return Scaffold(
      appBar: AppBar(
        title: Text(store?.name ?? 'Tạp hóa BIN'),
        actions: [
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

              // Thông báo trạng thái phát triển
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.developer_board_rounded,
                      color: Color(0xFF2563EB),
                      size: 20,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Phần 2: Khung nền tảng đã sẵn sàng kết nối API chung.\n'
                        'Nghiệp vụ Bán hàng, Trừ kho và Quản lý nợ sẽ được nối Backend ở các phần sau.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF1E40AF),
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              const Text(
                'Chức năng nghiệp vụ',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 12),

              // Các khối chức năng chuẩn bị kết nối ở Phần 3 & 4
              _buildFeatureTile(
                context,
                title: 'Bán hàng (POS)',
                subtitle: 'Tạo đơn, tính tiền, in hóa đơn (Phần 4)',
                icon: Icons.point_of_sale_rounded,
                iconColor: const Color(0xFF059669),
              ),
              const SizedBox(height: 10),
              _buildFeatureTile(
                context,
                title: 'Kiểm kho & Nhập hàng',
                subtitle: 'Quản lý số lượng và đơn vị quy đổi (Phần 4)',
                icon: Icons.inventory_2_outlined,
                iconColor: const Color(0xFFD97706),
              ),
              const SizedBox(height: 10),
              _buildFeatureTile(
                context,
                title: 'Sổ nợ khách hàng',
                subtitle: 'Ghi nợ và thu nợ từng phần (Phần 4)',
                icon: Icons.book_outlined,
                iconColor: const Color(0xFFDC2626),
              ),
              const SizedBox(height: 10),
              _buildFeatureTile(
                context,
                title: 'Báo cáo doanh thu',
                subtitle: 'Xem doanh số theo ngày/tháng (Phần 5)',
                icon: Icons.bar_chart_rounded,
                iconColor: const Color(0xFF2563EB),
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

  Widget _buildFeatureTile(
    BuildContext context, {
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
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
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Text(
            'Phần sau',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Color(0xFF64748B),
            ),
          ),
        ),
        onTap: () {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '$title sẽ được kết nối Backend API ở Phần 3 và 4.',
              ),
              duration: const Duration(seconds: 2),
            ),
          );
        },
      ),
    );
  }
}
