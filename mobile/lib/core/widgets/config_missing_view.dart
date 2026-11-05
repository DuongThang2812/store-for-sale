import 'package:flutter/material.dart';

/// Màn hình hiển thị hướng dẫn khi ứng dụng chưa có cấu hình biến môi trường.
/// Giúp người lập trình hoặc người kiểm thử biết chính xác cần truyền tham số nào.
class ConfigMissingView extends StatelessWidget {
  const ConfigMissingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cấu hình ứng dụng'), centerTitle: true),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.settings_suggest_rounded,
                    size: 54,
                    color: Color(0xFFD97706),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              const Center(
                child: Text(
                  'Chưa phát hiện cấu hình API',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E293B),
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Ứng dụng Tạp hóa BIN yêu cầu truyền các thông số kết nối API khi chạy. '
                'Để tránh làm hỏng dữ liệu hoặc crash ngoài ý muốn, vui lòng làm theo hướng dẫn sau:',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF475569),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 20),
              _buildStepCard(
                step: '1',
                title: 'Tạo file env.json',
                content:
                    'Sao chép file mobile/env.sample.json thành mobile/env.json '
                    'và điền các giá trị kết nối thực tế.',
              ),
              const SizedBox(height: 12),
              _buildStepCard(
                step: '2',
                title: 'Chạy ứng dụng kèm cấu hình',
                content:
                    'Chạy lệnh Flutter với cờ --dart-define-from-file:\n\n'
                    'flutter run --dart-define-from-file=env.json',
              ),
              const SizedBox(height: 12),
              _buildStepCard(
                step: '3',
                title: 'Chạy với Android Emulator',
                content:
                    'Khi máy chủ chạy tại localhost trên máy Windows, '
                    'hệ thống tự động chuyển đổi thành 10.0.2.2 để Emulator truy cập được.',
              ),
              const SizedBox(height: 28),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: Color(0xFF64748B),
                      size: 22,
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'File env.json đã được cấu hình trong .gitignore '
                        'để đảm bảo không bao giờ bị commit lên GitHub.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF475569),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStepCard({
    required String step,
    required String title,
    required String content,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 4,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: const Color(0xFF059669),
            child: Text(
              step,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  content,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF475569),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
