# Tối ưu độ mượt giao diện

Cập nhật: 21/09/2026. Dự án vẫn lưu dữ liệu trên trình duyệt.

## Những phần đã tối ưu

| File | Nhiệm vụ |
| --- | --- |
| `src/motion.css` | Hiệu ứng ngắn, giảm đổ bóng trên màn hình cảm ứng; dùng `content-visibility` để trình duyệt bỏ qua xử lý bố cục và vẽ nội dung nằm xa vùng nhìn. Trình duyệt chưa hỗ trợ vẫn hiển thị bình thường. |
| `src/routePages.js` | Tách mã theo trang, tải trước trang khi trỏ chuột hoặc đưa bàn phím đến liên kết. |
| `src/components/SaleProductCard.jsx` | Mỗi thẻ hàng chỉ theo dõi số lượng của chính mặt hàng đó. |
| `src/hooks/useProductSearch.js` | Lưu chỉ mục tên hàng không dấu, ưu tiên phản hồi nhập chữ trước khi cập nhật kết quả. |
| `src/hooks/useListWindow.js` | Giới hạn số mục hiển thị ban đầu; các mục còn lại truy cập bằng nút Xem thêm. |
| `src/components/ui.jsx` | Lịch sử chỉ dựng chi tiết món hàng khi mở; ghi nhớ các dòng chưa đổi. |
| `src/utils/cachedStorage.js` | Tái sử dụng JSON của các phần dữ liệu chưa đổi. Vẫn ghi đồng bộ một bản đầy đủ vào đúng khóa tài khoản, giữ định dạng tương thích với dữ liệu cũ. |
| `src/utils/productLookup.js` | Tra mặt hàng theo ID bằng chỉ mục dùng lại theo danh sách sản phẩm. |
| `src/stores/useShopStore.js` | Không cập nhật/lưu lại số lượng không đổi; giữ tham chiếu mặt hàng không bị ảnh hưởng khi thanh toán. |
| `src/pages/CalculatorPage.jsx` | Giảm số lần đo chữ, giữ một dòng; không đăng ký lại sự kiện bàn phím sau mỗi lần gõ. |

`content-visibility` là tối ưu hiển thị của trình duyệt, không phải xóa các dòng ngoài màn hình khỏi React. Kết hợp với giới hạn danh sách ban đầu để giảm cả lượng DOM ban đầu lẫn công vẽ khi cuộn. Chiều cao đã đo được ghi nhớ; có kích thước ước lượng cho mục chưa đo.

## Kết quả kiểm tra

- `npm run lint`: đạt.
- `npm test`: 20 bài đạt, gồm tính tiền, hoàn hàng, công nợ, sao lưu, cách ly tài khoản, lưu ngay và trường hợp lưu lỗi.
- Đo bằng `npm run bench:ui`: 2.000 mặt hàng, 10.000 giao dịch, 100 lần đổi giỏ hàng.

| Tạo JSON mỗi lần đổi giỏ | Trung vị | P95 |
| --- | ---: | ---: |
| Chuyển toàn bộ dữ liệu như trước | 8,548 ms | 11,254 ms |
| Dùng lại phần chưa đổi | 0,741 ms | 0,942 ms |

Số liệu là lần chạy Node trên máy phát triển, có làm nóng bộ nhớ đệm. Chỉ đo tạo JSON, không đo ghi localStorage, bố cục trình duyệt, FPS hay tốc độ trên điện thoại. Lần tải đầu hoặc giao dịch làm thay đổi kho/lịch sử vẫn phải chuyển các phần đã đổi sang JSON. Không trì hoãn ghi dữ liệu bằng debounce.

## Lưu ý khi phát triển tiếp

- Cập nhật bất biến: khi đổi một sản phẩm, tạo đối tượng và mảng sản phẩm mới; tương tự với lịch sử, khách và giỏ hàng. Không sửa trực tiếp đối tượng hoặc mảng cũ vì bộ nhớ đệm dùng tham chiếu để phát hiện thay đổi.
- Bộ nhớ đệm dùng WeakMap, không giữ cứng các phiên bản dữ liệu cũ.
- Lỗi localStorage vẫn được đẩy lên phía gọi. Tối ưu này không bổ sung cơ chế rollback bộ nhớ khi ghi lỗi.
- Dữ liệu lớn vẫn cần ghi toàn bộ snapshot vào localStorage. Để đánh giá giới hạn thực tế, cần đo thao tác trên trình duyệt và thiết bị mục tiêu; kết quả trên không phải cam kết FPS.
- Chưa kiểm tra thao tác trực tiếp trên trình duyệt trong đợt này.
