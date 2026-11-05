import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../auth/presentation/auth_controller.dart';
import 'store_controller.dart';

/// Màn hình Tạo cửa hàng mới (Store Setup).
///
/// Hỗ trợ tài khoản mới đăng ký (qua Email hoặc Google OAuth) thiết lập cửa hàng
/// đầu tiên của họ. Gọi RPC `create_store` hoặc endpoint `POST /stores`.
class StoreSetupScreen extends StatefulWidget {
  final AuthController authController;
  final StoreController storeController;

  const StoreSetupScreen({
    super.key,
    required this.authController,
    required this.storeController,
  });

  @override
  State<StoreSetupScreen> createState() => _StoreSetupScreenState();
}

class _StoreSetupScreenState extends State<StoreSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  String _selectedBusinessType = 'grocery';
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _handleCreateStore() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final newStore = await widget.storeController.createStore(
      name: _nameController.text.trim(),
      businessType: _selectedBusinessType,
    );

    if (!mounted) return;

    setState(() {
      _isSubmitting = false;
    });

    if (newStore != null) {
      await widget.authController.onStoreSelected(newStore);
      if (mounted && Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
    } else {
      setState(() {
        _errorMessage =
            widget.storeController.error?.message ??
            'Không thể tạo cửa hàng mới. Vui lòng thử lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final canGoBack = Navigator.of(context).canPop();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tạo cửa hàng mới'),
        leading: canGoBack
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.add_business_rounded,
                      size: 40,
                      color: Color(0xFF059669),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Thiết lập cửa hàng của bạn',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Nhập tên tiệm và chọn mô hình kinh doanh để bắt đầu bán hàng.',
                  style: TextStyle(fontSize: 14, color: Color(0xFF64748B)),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),

                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFCA5A5)),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Color(0xFFDC2626),
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF991B1B),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Tên cửa hàng
                const Text(
                  'Tên cửa hàng *',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF334155),
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    hintText: 'Ví dụ: Tạp hóa Cô Ba, Siêu thị Mini BIN...',
                    prefixIcon: Icon(Icons.storefront_outlined),
                  ),
                  validator: (val) {
                    final text = val?.trim() ?? '';
                    if (text.isEmpty) return 'Vui lòng nhập tên cửa hàng.';
                    if (text.length > 120) {
                      return 'Tên cửa hàng tối đa 120 ký tự.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),

                // Ngành hàng kinh doanh
                const Text(
                  'Ngành hàng kinh doanh *',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF334155),
                  ),
                ),
                const SizedBox(height: 8),
                _buildBusinessTypeCard(
                  id: 'grocery',
                  title: 'Tạp hóa tổng hợp',
                  subtitle: 'Bán hàng đóng gói theo cái, gói, lon, chai, thùng, lốc...',
                  icon: Icons.local_grocery_store_outlined,
                ),
                const SizedBox(height: 10),
                _buildBusinessTypeCard(
                  id: 'fruit_shop',
                  title: 'Trái cây & Nông sản',
                  subtitle:
                      'Bán theo cân nặng (kg, lạng, gram), quả, khay, hộp...',
                  icon: Icons.apple_outlined,
                ),

                const SizedBox(height: 32),

                AppButton(
                  label: 'Tạo cửa hàng & Bắt đầu',
                  icon: Icons.check_circle_outline_rounded,
                  isLoading: _isSubmitting,
                  onPressed: _handleCreateStore,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBusinessTypeCard({
    required String id,
    required String title,
    required String subtitle,
    required IconData icon,
  }) {
    final isSelected = _selectedBusinessType == id;

    return InkWell(
      onTap: () => setState(() => _selectedBusinessType = id),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFECFDF5) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF059669)
                : const Color(0xFFE2E8F0),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isSelected
                    ? const Color(0xFF059669)
                    : const Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                color: isSelected ? Colors.white : const Color(0xFF64748B),
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: isSelected
                          ? const Color(0xFF065F46)
                          : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              isSelected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_unchecked_rounded,
              color: isSelected
                  ? const Color(0xFF059669)
                  : const Color(0xFFCBD5E1),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
