# Tạp hóa Nhà Mình

Giao diện React + JavaScript dành cho chủ tiệm nhỏ, dùng tiếng Việt và bố cục thích ứng với điện thoại, máy tính bảng và máy tính.

## Chạy dự án

```sh
npm install
npm run dev
```

Vite sẽ in địa chỉ mở ứng dụng trong terminal. Trang chủ ở `/`, giao diện đăng nhập ở `/login`.

```sh
npm run build
npm run lint
npm test
npm run preview
```

## Database Supabase/PostgreSQL

Thiết kế DB đã nằm trong `supabase/migrations`, kèm dữ liệu mẫu và kiểm tra transaction. Xem `docs/DATABASE_DESIGN.md` để biết quan hệ bảng, RPC, bảo mật và payload frontend. Máy cần Docker Desktop đang chạy trước khi dùng:

```sh
npm run db:start
npm run db:reset
npm run db:test
```

Frontend hiện vẫn dùng Zustand/localStorage; migration DB đã sẵn sàng nhưng chưa nối vào các màn hình.

## Các màn hình

- Trang chủ: tổng tiền đã thu, số nợ, bốn thao tác chính, hoạt động gần đây và hàng cần nhập thêm.
- Máy tính (`/calculator`), ngay trên Bán hàng: cộng, trừ, nhân, chia, số thập phân, bàn phím và lịch sử 100 phép tính gần nhất. Nhân/chia được tính trước cộng/trừ. Bấm kết quả trong lịch sử để tính tiếp. Lịch sử máy tính lưu riêng theo hồ sơ mẫu trong trình duyệt, không thuộc bản JSON sao lưu cửa hàng; phép tính không tác động doanh thu hoặc nợ.
- Bán hàng: tìm tên không cần dấu, lọc loại hàng, chọn số lượng và giỏ hàng.
- Thanh toán: nhận tiền hoặc ghi nợ cho khách, xác nhận trước khi lưu.
- Nhập hàng: chia 6 nhóm, nhập theo thùng/bịch/kg/cây hoặc đơn vị riêng, lưu giá nhập từng lần, hiển thị tồn trước/sau và hoàn tác trong 12 giây.
- Thêm và sửa hàng: tên, nhóm, quy cách đóng hàng, các mức giá nhập/bán, số lượng ban đầu và ngừng bán.
- Kho hàng: tìm kiếm, lọc sắp hết/đã hết/ngừng bán, xuất CSV.
- Sổ nợ: thêm khách và nhấn Enter để chọn hàng ngay; mặc định mua chịu, mỗi khách có giỏ hàng riêng. Trả một phần giữ lại khách, trả hết xóa khách khỏi sổ nhưng giữ lịch sử giao dịch.
- Nhập hàng từ CSV (`/import/csv`): tải file mẫu, kiểm tra dữ liệu, xem trước và xác nhận nhập nhiều mặt hàng.
- Biểu đồ & doanh thu (`/revenue`): xem 7/30/90 ngày, doanh thu, tiền thực thu, số đơn, nợ hiện tại; xuất báo cáo CSV.
- Lịch sử (`/history`): bán hàng, nhập kho, ghi nợ, trả nợ, chỉnh sửa mặt hàng, khôi phục dữ liệu và hủy đơn.
- Đăng nhập/đăng ký mẫu (`/login`): hiện/ẩn mật khẩu, chuyển không gian dữ liệu theo email mẫu; không xác thực và không lưu mật khẩu.
- Tài khoản & sao lưu (`/account`): tải JSON đầy đủ, xem trước khi khôi phục, tự giữ bản dữ liệu trước lần khôi phục gần nhất.

## Trạng thái hiện tại

File CSV dùng UTF-8, tối đa 2 MB / 2.000 mặt hàng, có các cột `Tên hàng`, `Giá bán`, `Số lượng`, `Đơn vị`; `Loại hàng` là tùy chọn. Chấp nhận cột `Số lượng nhập` hoặc `Còn lại` thay cho `Số lượng`. Giá và số đơn vị dùng số nguyên; hạt cho phép nhập theo bội số 0,1 kg. Giá bán có thể ghi `4500` hoặc `4.500`. Số lượng nhập phải lớn hơn 0. Mặt hàng trùng tên sẽ cộng tồn theo quy cách đã khai báo, giữ các giá hiện tại. File khai báo quy cách khác trong kho sẽ bị từ chối. Tên mới sẽ tạo hàng mới cùng thông tin giá và quy cách. File xuất kho khi nạp lại sẽ cộng thêm tồn, không thay thế số tồn.

Doanh thu gồm bán trả ngay và bán chịu trong kỳ, trừ đơn hủy vào ngày hủy. Tiền thực thu gồm bán trả ngay và thu nợ, trừ tiền hoàn vào ngày hủy. Thu nợ không được cộng lại vào doanh thu. Các số nợ ban đầu không được tính là doanh thu mới. Số đơn không tính đơn đã hủy. Báo cáo có thể âm khi hoàn đơn của kỳ trước; chưa tính lợi nhuận / giá vốn.

Đây là frontend dùng thử. Dữ liệu mẫu và thay đổi lưu bằng Zustand trong localStorage, khóa `nha-minh-demo-v1` cho cửa hàng dùng thử, `little-store-profile:<email đã mã hóa>` cho từng email mẫu. Email chỉ dùng để chọn dữ liệu tại máy, không phải cơ chế bảo mật. Mật khẩu trên giao diện không được lưu hoặc gửi đi. Chưa có xác thực tài khoản thật, backend, đồng bộ nhiều thiết bị hoặc chế độ offline/PWA hoàn chỉnh. Các số dư ban đầu được ghi rõ trong lịch sử; chúng không có chi tiết từng món hàng.

## Sao lưu và hủy đơn

Trong **Tài khoản & sao lưu**, tải bản JSON chứa hàng hóa, quy cách, giá, khách, lịch sử và giỏ hàng. Khôi phục có bước xem trước, kiểm tra định dạng và checksum, xác nhận thay dữ liệu và lưu bản dự phòng trước khi ghi đè. File tối đa 8 MB; CSV hàng hóa không thay thế bản sao lưu đầy đủ.

Trong **Lịch sử**, bấm **Hủy đơn**, nhập lý do, xem số hàng hoàn kho, số nợ giảm và tiền cần hoàn. Xác nhận đã nhận lại hàng và hoàn tiền trước khi hoàn tất. Đây là ghi nhận trên dữ liệu cục bộ, không thực hiện chuyển tiền. Chỉ hỗ trợ hủy toàn bộ đơn và không cho hủy hai lần. Giữ nguyên đơn gốc cùng trạng thái đã hủy và thêm lịch sử hủy riêng.

Đơn mua chịu giảm phần còn nợ, hoàn phần đã trả. Tiền trả nợ được phân bổ vào đơn cũ trước; khi hủy một đơn, phân bổ đã lưu của các đơn khác được giữ nguyên. Khách hết nợ được xóa khỏi sổ nợ, lịch sử vẫn còn. Đơn mẫu/cũ thiếu chi tiết mặt hàng hoặc không xác định được đơn vị hoàn kho sẽ không tự động hủy; tạo đơn mới để thử luồng này.

Các thành phần chính:

| Phần | File | Nhiệm vụ |
| --- | --- | --- |
| `LoginPage` | `src/pages/LoginPage.jsx` | Giao diện đăng nhập/đăng ký mẫu |
| `AccountPage` | `src/pages/AccountPage.jsx` | Hồ sơ, xuất JSON, xem trước và xác nhận khôi phục |
| `AccountBootstrap`, `DemoAccountGate` | `src/auth/AccountBootstrap.jsx` | Mở dữ liệu cục bộ, điều hướng theo hồ sơ mẫu |
| `useAccountStore` | `src/stores/useAccountStore.js` | Trạng thái hồ sơ mẫu trong phiên |
| Các hàm tài khoản | `src/services/accountService.js` | Chọn dữ liệu theo email mẫu, khôi phục, giữ bản dự phòng |
| Các hàm sao lưu | `src/utils/backup.js` | Kiểm tra dữ liệu, tạo/đọc/tải JSON |
| `HistoryPage` | `src/pages/DebtPages.jsx` | Danh sách lịch sử và mở hộp hủy |
| `SaleCancellationDialog` | `src/components/SaleCancellationDialog.jsx` | Xem trước và xác nhận hủy đơn |
| `cancellationPlan`, `applySaleCancellation`, `allocatePayment` | `src/utils/saleCancellation.js` | Tính hoàn kho, hoàn tiền, giảm nợ và phân bổ trả nợ |
| `useShopStore` | `src/stores/useShopStore.js` | Áp dụng thay đổi và lưu dữ liệu |
| `summarizeRevenue` | `src/utils/revenue.js` | Cập nhật báo cáo sau khi hủy |

Project dùng function component và Zustand; các phần trên không phải JavaScript `class`. Bộ kiểm tra `tests/account-and-cancellation.test.js` dùng dữ liệu trong bộ nhớ, không đụng dữ liệu trình duyệt của bạn.

Các thao tác chỉ mô phỏng trên trình duyệt hiện tại. Cần kết nối backend và kiểm tra nghiệp vụ trước khi dùng cho cửa hàng thật.

## Tổ chức mã

- `src/layouts/MainLayout.jsx`: khung chung, điều hướng, hướng dẫn.
- `src/pages/`: các màn hình nghiệp vụ.
- `src/components/ui.jsx`: hộp xác nhận, hộp thoại, tìm kiếm, thông báo và bộ chọn số lượng.
- `src/stores/useShopStore.js`: dữ liệu mẫu, giỏ hàng, lịch sử và lưu cục bộ.
- `src/utils/shopHelpers.js`: tìm kiếm và xuất CSV.
- `src/index.css`: màu sắc, kích thước, bố cục responsive.

Đã kiểm tra biên dịch và lint. Chưa kiểm tra thao tác bằng trình duyệt theo yêu cầu của người dùng.

## Nhóm hàng và quy đổi

| Nhóm | Giá nhập | Giá bán | Quy đổi |
| --- | --- | --- | --- |
| Bánh kẹo | 1 thùng, 1 bịch | 1 bịch/gói/cái/viên tùy chọn | Nhập số bịch/thùng; nếu bán nhỏ hơn bịch, nhập thêm số đơn vị/bịch |
| Nước | 1 thùng | 1 thùng, 1 lon hoặc chai | Chọn lon/chai và số đơn vị/thùng |
| Bia | 1 thùng | 1 thùng, 1 lon | Nhập số lon/thùng |
| Gia vị | Theo đơn vị được chọn | Theo cùng đơn vị | Không quy đổi |
| Hạt | 1 kg | 1 lạng | Cố định 1 kg = 10 lạng, 1 lạng = 100 g |
| Thuốc lá | 1 cây | 1 cây, 1 gói | Nhập số gói/cây |

Quy cách đóng gói không được tự đoán cho hàng cũ. Hàng cũ tiếp tục giữ đơn vị và số tồn; chọn nhóm trong phần sửa mặt hàng để khai báo. Khi đổi từ thùng/cây/kg/bịch cũ sang đơn vị nhỏ hơn, ứng dụng chỉ quy đổi nếu có quy cách xác định được và không có giỏ hàng đang chọn sản phẩm đó. Mặt hàng đã khai báo quy cách và còn tồn không cho đổi quy cách; lô đóng gói khác nên tạo mặt hàng riêng.

Tồn kho lưu theo đơn vị bán lẻ nhỏ nhất. Có thể chọn đồng thời nguyên thùng/cây và bán lẻ trong cùng giỏ; tổng hàng quy đổi không được vượt tồn kho. Lịch sử lưu số lượng, đơn vị bán, giá tại thời điểm bán. Giá nhập từng lần được lưu riêng khi nhập thêm hàng; hoàn tác khôi phục tồn và giá nhập trước đó.

CSV có file mẫu riêng cho cả 6 nhóm, kèm cột quy cách và các mức giá. Các số trong file mẫu chỉ là ví dụ. Cột `Giá bán` là giá bán lẻ theo `Đơn vị bán lẻ`; cột `Đơn vị` là đơn vị của số lượng nhập trong file. File xuất kho có thêm các cột giá và quy cách; `Còn lại` được xuất theo đơn vị nhỏ nhất.

Đã kiểm tra phép quy đổi bằng dữ liệu thử trong bộ nhớ: 6 mẫu CSV và xuất/nhập lại, bán thùng cùng lon, chống bán vượt tồn, hoàn tác nhập, cộng/trả nợ và quy đổi kg/lạng, bịch/viên. Không thay đổi dữ liệu trình duyệt và chưa kiểm tra thao tác giao diện bằng trình duyệt.
