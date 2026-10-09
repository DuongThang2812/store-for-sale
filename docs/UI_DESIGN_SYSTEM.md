# Giao diện BIN — hệ thống thiết kế

Cập nhật 23/09/2026. React + JavaScript, Vite, CSS và Tailwind; giữ các tối ưu Zustand, tìm kiếm và lưu dữ liệu từ đợt trước.

## Hướng thiết kế

Dashboard tối giản, xanh rừng làm điểm nhấn, nền xám xanh rất nhạt, bề mặt trắng và màu hổ phách cho công nợ. Nội dung và số tiền được ưu tiên; nút bấm lớn và nhãn tiếng Việt rõ ràng cho người ít dùng công nghệ.

- Khoảng cách dùng thang 4, 8, 12, 16, 20, 24, 32, 40px cho các thành phần chung.
- Bo góc dùng 8, 12, 16, 24px. Viền 1px, bóng nhiều lớp nhẹ, giảm bóng trên màn hình cảm ứng.
- Plus Jakarta Sans; tiêu đề trang 26–32px, nội dung 14–16px, thông tin phụ 12–13px; số tiền dùng chữ số có độ rộng cố định.
- Nút chính và ô nhập cao 48px, nút biểu tượng 44px; trạng thái focus có viền rõ ràng.
- Thống nhất tên BIN ở sidebar, header, footer, màn hình đăng nhập và tiêu đề tab.

## Chuyển động

- Hover/tap: 180ms; biểu đồ: 240ms; mở hộp thoại: 340ms.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Chỉ animate `transform` và `opacity`. Màu, viền và bóng đổi trạng thái trực tiếp.
- Biểu đồ dùng `scaleY` quanh mốc 0 để hiển thị cả giá trị dương và âm; không animate chiều cao.
- Chuyển trang chỉ đổi opacity để thanh giỏ hàng cố định trên điện thoại không bị ảnh hưởng bởi transform của phần tử cha.
- Skeleton giữ trước diện tích thẻ và dùng opacity; tự tắt chuyển động nếu người dùng bật giảm chuyển động.
- Không gắn `will-change` hàng loạt; giữ cơ chế bỏ qua bố cục/vẽ các mục ngoài vùng nhìn và giới hạn danh sách ban đầu.

## Các file phụ trách

| File | Vai trò |
| --- | --- |
| `src/index.css` | Điểm nhập các module CSS theo thứ tự rõ ràng. |
| `src/styles/tokens.css` | Màu, khoảng cách, bo góc, bóng, thời gian và easing dùng chung. |
| `src/styles/polish.css` | Hệ thống bề mặt, chữ và control chung cho tất cả màn hình. |
| `src/styles/shell.css`, `dashboard.css`, `controls.css` | Khung điều hướng, trang chủ và các control. |
| `src/styles/sales.css`, `stock.css`, `debt.css`, `reports.css`, `pricing.css`, `account.css`, `login.css` | Bố cục và chi tiết theo nhóm tính năng. |
| `src/styles/responsive.css` | Bố cục theo kích thước màn hình. |
| `src/styles/feedback.css` | Skeleton, trạng thái tải/lỗi và nút xem thêm. |
| `src/motion.css` | Chính sách chuyển động, focus, bỏ qua hiển thị ngoài màn hình và giảm chuyển động. |
| `src/components/feedback/Dialog.jsx` | Hộp thoại native, quản lý focus/cuộn, xác nhận và chống bấm lặp khi đang lưu. |
| `src/components/PageLoading.jsx` | Skeleton trang và thông báo tải lỗi. |
| `src/components/reports/RevenueChart.jsx` | Biểu đồ bằng transform; bảng doanh thu được memo riêng. |
| `src/pages/calculator.css` | Hình thức máy tính, đồng bộ token và chính sách chuyển động. |
| `scripts/audit-ui.mjs` | Phát hiện transition/keyframe ngoài transform/opacity; kiểm tra tương phản màu chính. |

## Kiểm tra và giới hạn

Các lệnh: `npm run build`, `npm run lint`, `npm test`, `npm run audit:ui`.

Build, lint, 20 kiểm thử và audit giao diện đều đạt. Đã đối chiếu trực quan trang chủ trên desktop và điện thoại 390px, trang bán hàng 390px, trang doanh thu desktop, máy tính và hộp thoại hướng dẫn. Hộp thoại có tên truy cập được và focus vào nút Đóng; phím máy tính tạm ngừng khi hộp thoại mở. Việc xem trước dùng máy chủ riêng tại `127.0.0.1:5179`; không tạo giao dịch để kiểm tra giao diện.

10 cặp màu semantic đã đo đạt ít nhất 4,5:1; đây là kiểm tra bảng màu chính, không phải chứng nhận WCAG cho toàn bộ ứng dụng. Source audit kiểm tra transition CSS/Tailwind và thuộc tính keyframe.

Chưa đo FPS trên thiết bị mục tiêu. Chỉ animate transform/opacity giúp giảm công bố cục và vẽ lại, nhưng không đảm bảo 60 FPS trên mọi máy. Không thay đổi luồng tính tiền, công nợ hoặc cấu trúc dữ liệu trong lần nâng cấp này.
