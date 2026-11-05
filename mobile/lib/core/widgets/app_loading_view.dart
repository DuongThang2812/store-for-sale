import 'package:flutter/material.dart';

/// Màn hình/Widget trạng thái đang tải dùng chung.
class AppLoadingView extends StatelessWidget {
  final String message;

  const AppLoadingView({super.key, this.message = 'Đang tải dữ liệu...'});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(strokeWidth: 3),
            const SizedBox(height: 16),
            Text(
              message,
              style: TextStyle(
                fontSize: 15,
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
