import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/store_models.dart';
import 'store_controller.dart';
import 'store_setup_screen.dart';

/// Màn hình Chọn/Thiết lập cửa hàng.
///
/// Kết nối với StoreController để nạp danh sách cửa hàng thật từ Backend / Edge Function
/// (endpoint GET /api/v1/stores đã tạo ở Phần 1).
class StoreSelectScreen extends StatefulWidget {
  final AuthController authController;
  final StoreController storeController;

  const StoreSelectScreen({
    super.key,
    required this.authController,
    required this.storeController,
  });

  @override
  State<StoreSelectScreen> createState() => _StoreSelectScreenState();
}

class _StoreSelectScreenState extends State<StoreSelectScreen> {
  @override
  void initState() {
    super.initState();
    // Tự động tải danh sách cửa hàng khi mở màn hình
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.storeController.stores.isEmpty &&
          !widget.storeController.isLoading) {
        widget.storeController.loadStores();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authController.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chọn cửa hàng làm việc'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_business_rounded),
            tooltip: 'Tạo cửa hàng mới',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => StoreSetupScreen(
                    authController: widget.authController,
                    storeController: widget.storeController,
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Đăng xuất',
            onPressed: () => widget.authController.signOut(),
          ),
        ],
      ),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.storeController,
          builder: (context, _) {
            final ctrl = widget.storeController;

            if (ctrl.isLoading) {
              return const AppLoadingView(
                message: 'Đang tải danh sách cửa hàng từ máy chủ...',
              );
            }

            if (ctrl.error != null) {
              return AppErrorView(
                title: 'Không thể tải danh sách cửa hàng',
                message: ctrl.error!.message,
                onRetry: () => ctrl.loadStores(),
              );
            }

            if (!ctrl.hasStores) {
              return AppEmptyView(
                title: 'Chưa có cửa hàng nào',
                message:
                    'Tài khoản (${user?.email ?? "chưa xác định"}) chưa thuộc cửa hàng nào.\n'
                    'Bạn có thể tạo cửa hàng mới ngay bây giờ để bắt đầu bán hàng.',
                icon: Icons.store_outlined,
                actionLabel: 'Tạo cửa hàng mới',
                onAction: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => StoreSetupScreen(
                        authController: widget.authController,
                        storeController: widget.storeController,
                      ),
                    ),
                  );
                },
              );
            }

            return RefreshIndicator(
              onRefresh: () => ctrl.loadStores(),
              color: const Color(0xFF059669),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: ctrl.stores.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8.0, top: 4.0),
                      child: Text(
                        'Bạn đang đăng nhập với ${user?.email ?? ""}.\n'
                        'Chọn cửa hàng bên dưới để bắt đầu làm việc:',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF64748B),
                          height: 1.4,
                        ),
                      ),
                    );
                  }

                  final store = ctrl.stores[index - 1];
                  return _buildStoreCard(context, store);
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildStoreCard(BuildContext context, StoreDto store) {
    final roleText = store.isOwner ? 'Chủ cửa hàng' : 'Nhân viên';
    final roleColor = store.isOwner
        ? const Color(0xFF059669)
        : const Color(0xFF0284C7);
    final roleBg = store.isOwner
        ? const Color(0xFFECFDF5)
        : const Color(0xFFF0F9FF);

    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.storefront_rounded,
                    color: Color(0xFF059669),
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        store.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Mã định danh: ${store.slug}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _buildBadge(roleText, roleColor, roleBg),
                _buildBadge(
                  store.storeType == 'groceries'
                      ? 'Tạp hóa tổng hợp'
                      : store.storeType == 'fruits'
                      ? 'Trái cây theo kg'
                      : store.storeType,
                  const Color(0xFF475569),
                  const Color(0xFFF8FAFC),
                ),
                _buildBadge(
                  store.currency,
                  const Color(0xFF475569),
                  const Color(0xFFF8FAFC),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: AppButton(
                label: 'Vào cửa hàng',
                icon: Icons.login_rounded,
                onPressed: () {
                  widget.authController.onStoreSelected(store);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBadge(String text, Color textColor, Color bgColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: textColor.withValues(alpha: 0.2)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }
}
