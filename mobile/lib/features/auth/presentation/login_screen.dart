import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../data/auth_repository_impl.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';

/// Màn hình Đăng nhập (Khung nền tảng Phần 2).
///
/// Ghi rõ luồng xác thực thật (Email/Mật khẩu và Google OAuth) thuộc Phần 3.
/// Cung cấp nút thử nghiệm phiên để kiểm thử luồng điều hướng sang Store Select & Home.
class LoginScreen extends StatelessWidget {
  final AuthRepository authRepository;

  const LoginScreen({super.key, required this.authRepository});

  void _onDevTestLogin(BuildContext context) {
    if (authRepository is AuthRepositoryImpl) {
      (authRepository as AuthRepositoryImpl).setSession(
        const AuthUser(
          id: 'test-user-0001',
          email: 'demo@tap-hoa-bin.vn',
          displayName: 'Nhân viên Thử nghiệm',
          accessToken: 'mock-jwt-token-for-dev-session',
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: 24.0,
              vertical: 32.0,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFF059669),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.storefront_rounded,
                        size: 38,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'TẠP HÓA BIN',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                      color: Color(0xFF0F172A),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Đăng nhập tài khoản để quản lý cửa hàng',
                    style: TextStyle(fontSize: 14, color: Color(0xFF64748B)),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: Color(0xFFD97706),
                          size: 20,
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Phần 2: Nền tảng ứng dụng Android.\n'
                            'Đăng nhập Email và Google OAuth sẽ được triển khai hoàn chỉnh ở Phần 3.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF92400E),
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  AppButton(
                    label: 'Đăng nhập bằng Email (Phần 3)',
                    icon: Icons.email_outlined,
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Tính năng đăng nhập email sẽ được kết nối ở Phần 3.',
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Đăng nhập bằng Google (Phần 3)',
                    icon: Icons.g_mobiledata_rounded,
                    isOutlined: true,
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Đăng nhập Google OAuth qua Supabase sẽ được kết nối ở Phần 3.',
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  const Divider(color: Color(0xFFE2E8F0)),
                  const SizedBox(height: 16),
                  AppButton(
                    label: 'Vào phiên thử nghiệm (Test Session)',
                    icon: Icons.play_arrow_rounded,
                    backgroundColor: const Color(0xFF334155),
                    onPressed: () => _onDevTestLogin(context),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
