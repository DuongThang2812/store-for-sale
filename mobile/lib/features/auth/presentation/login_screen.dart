import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../data/auth_repository_impl.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';
import 'auth_controller.dart';

/// Màn hình Đăng nhập & Đăng ký (Phần 3).
///
/// Hỗ trợ:
/// - Đăng nhập bằng Email & Mật khẩu
/// - Đăng ký tài khoản mới bằng Email & Mật khẩu
/// - Đăng nhập Google OAuth (với Deep Link callback trên Android)
/// - Cung cấp nút Dev Test Session cho kiểm thử cục bộ.
class LoginScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final AuthController? authController;

  const LoginScreen({
    super.key,
    required this.authRepository,
    this.authController,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();

  bool _isSignUp = false;
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    try {
      if (widget.authController != null) {
        if (_isSignUp) {
          await widget.authController!.signUpWithEmail(
            email,
            password,
            displayName: _nameController.text.trim(),
          );
        } else {
          await widget.authController!.signInWithEmail(email, password);
        }
        if (widget.authController!.error != null) {
          setState(() {
            _errorMessage = widget.authController!.error!.message;
          });
        }
      } else {
        if (_isSignUp) {
          await widget.authRepository.signUpWithEmail(
            email,
            password,
            displayName: _nameController.text.trim(),
          );
        } else {
          await widget.authRepository.signInWithEmail(email, password);
        }
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (widget.authController != null) {
        await widget.authController!.signInWithGoogle();
        if (widget.authController!.error != null) {
          setState(() {
            _errorMessage = widget.authController!.error!.message;
          });
        }
      } else {
        await widget.authRepository.signInWithGoogle();
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _onDevTestLogin() {
    if (widget.authRepository is AuthRepositoryImpl) {
      (widget.authRepository as AuthRepositoryImpl).setSession(
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
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          color: const Color(0xFF059669),
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x20059669),
                              blurRadius: 12,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.storefront_rounded,
                          size: 36,
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
                    const SizedBox(height: 4),
                    Text(
                      _isSignUp
                          ? 'Đăng ký tài khoản để bắt đầu quản lý cửa hàng'
                          : 'Đăng nhập vào hệ thống quản lý bán lẻ',
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF64748B),
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),

                    // Toggle Đăng nhập / Đăng ký
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: _buildToggleTab(
                              title: 'Đăng nhập',
                              isActive: !_isSignUp,
                              onTap: () {
                                if (_isSignUp) {
                                  setState(() {
                                    _isSignUp = false;
                                    _errorMessage = null;
                                  });
                                }
                              },
                            ),
                          ),
                          Expanded(
                            child: _buildToggleTab(
                              title: 'Đăng ký',
                              isActive: _isSignUp,
                              onTap: () {
                                if (!_isSignUp) {
                                  setState(() {
                                    _isSignUp = true;
                                    _errorMessage = null;
                                  });
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Hiển thị thông báo lỗi
                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFFCA5A5)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.error_outline_rounded,
                              color: Color(0xFFDC2626),
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  color: Color(0xFF991B1B),
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Trường Họ tên khi đăng ký
                    if (_isSignUp) ...[
                      const Text(
                        'Họ và tên *',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF334155),
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          hintText: 'Nguyễn Văn A',
                          prefixIcon: Icon(Icons.person_outline, size: 20),
                        ),
                        validator: (v) {
                          if (_isSignUp && (v == null || v.trim().isEmpty)) {
                            return 'Vui lòng nhập họ và tên.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Email
                    const Text(
                      'Email *',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        hintText: 'ten@example.com',
                        prefixIcon: Icon(Icons.email_outlined, size: 20),
                      ),
                      validator: (v) {
                        final val = v?.trim() ?? '';
                        if (val.isEmpty) return 'Vui lòng nhập địa chỉ email.';
                        if (!val.contains('@') || !val.contains('.')) {
                          return 'Địa chỉ email không hợp lệ.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Mật khẩu
                    const Text(
                      'Mật khẩu *',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        hintText: 'Tối thiểu 6 ký tự',
                        prefixIcon: const Icon(Icons.lock_outline, size: 20),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 20,
                          ),
                          onPressed: () {
                            setState(
                              () => _obscurePassword = !_obscurePassword,
                            );
                          },
                        ),
                      ),
                      validator: (v) {
                        final val = v ?? '';
                        if (val.isEmpty) return 'Vui lòng nhập mật khẩu.';
                        if (val.length < 6) {
                          return 'Mật khẩu phải có ít nhất 6 ký tự.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 24),

                    // Nút Đăng nhập / Đăng ký
                    AppButton(
                      label: _isSignUp ? 'Tạo tài khoản' : 'Đăng nhập',
                      icon: _isSignUp
                          ? Icons.person_add_outlined
                          : Icons.login_rounded,
                      isLoading: _isLoading,
                      onPressed: _submitForm,
                    ),
                    const SizedBox(height: 16),

                    // Phân cách Hoặc
                    const Row(
                      children: [
                        Expanded(child: Divider(color: Color(0xFFE2E8F0))),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12.0),
                          child: Text(
                            'HOẶC',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Color(0xFFE2E8F0))),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Đăng nhập bằng Google
                    AppButton(
                      label: 'Tiếp tục với Google',
                      icon: Icons.g_mobiledata_rounded,
                      isOutlined: true,
                      isLoading: _isLoading,
                      onPressed: _handleGoogleSignIn,
                    ),
                    const SizedBox(height: 24),

                    // Nút Phiên thử nghiệm offline
                    TextButton.icon(
                      icon: const Icon(Icons.science_outlined, size: 18),
                      label: const Text(
                        'Vào phiên kiểm thử (Demo Test Session)',
                      ),
                      style: TextButton.styleFrom(
                        foregroundColor: const Color(0xFF64748B),
                      ),
                      onPressed: _onDevTestLogin,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildToggleTab({
    required String title,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow: isActive
              ? const [
                  BoxShadow(
                    color: Color(0x10000000),
                    blurRadius: 4,
                    offset: Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: Text(
          title,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? const Color(0xFF0F172A) : const Color(0xFF64748B),
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
