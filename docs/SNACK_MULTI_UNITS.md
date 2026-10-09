# Bánh kẹo nhiều cấp đơn vị

Cập nhật 05/10/2026. Hoàn thiện phần UI/mapper/CSV cho các mục 11, 17, 19, 20 và 21 của yêu cầu nền tảng. Mã vẫn là JavaScript/JSX; DB tiếp tục dùng `products` và `product_units` hiện có.

## Cách khai báo trên giao diện

1. Trong **Nhập hàng → Thêm mặt hàng**, chọn **Bánh kẹo**.
2. Chọn đơn vị nhỏ nhất để theo dõi kho, ví dụ **viên**.
3. Nhập số viên trong một bịch và số bịch trong một thùng.
4. Nhập giá nhập thùng/bịch và giá bán lẻ viên như trước.
5. Điền giá bán thùng/bịch nếu có bán nguyên kiện; bỏ trống để chỉ bán lẻ.
6. Bấm **Thêm đơn vị đóng gói**, chọn **gói**, nhập số viên trong một gói và giá riêng. Có thể chỉ nhập, chỉ bán hoặc dùng cho cả hai.

Không bắt buộc có đủ mọi cấp. Ví dụ hàng chỉ bán theo bịch vẫn dùng form cũ; không cần thêm gói/viên. Mỗi đơn vị chọn trong trang Bán hàng cùng trừ một số tồn. Có thể thêm cấp **cái** nếu mặt hàng cần đủ năm cấp thùng/bịch/gói/cái/viên.

## Ví dụ đã kiểm tra

| Đơn vị | Quy đổi về viên | Giá nhập | Giá bán |
| --- | ---: | ---: | ---: |
| viên | 1 | 150đ nếu nhập lẻ | 1.000đ |
| gói | 20 | 3.000đ | 5.000đ |
| bịch | 200 | 30.000đ | 40.000đ |
| thùng | 4.000 | 600.000đ | 700.000đ |

Một bịch chứa 10 gói; một thùng chứa 20 bịch. Trong form, mọi quy đổi đều tính trực tiếp về đơn vị nhỏ nhất, không lưu nhiều số tồn song song.

Nhập 2 thùng tạo 8.000 viên, giá vốn 150đ/viên. Bán 1 thùng + 2 bịch + 3 gói + 5 viên:

- Số lượng xuất: 4.465 viên; còn 3.535 viên.
- Doanh thu: 800.000đ theo bốn giá riêng, không lấy 4.465 nhân giá viên.
- Giá vốn snapshot: 669.750đ; lợi nhuận gộp: 130.250đ.
- Nếu mua chịu rồi trả 50.000đ, còn nợ 750.000đ. Hủy toàn bộ đơn: hoàn 50.000đ đã thu, giảm 750.000đ nợ và nhận lại đúng 4.465 viên một lần.

Nếu sau đó nhập 5 gói giá 2.500đ/gói, phiếu nhập ghi 12.500đ và cộng 100 viên. Giá nhập gói được cập nhật riêng; giá thùng/bịch và giá vốn lịch sử không bị thay bằng giá gói.

## Dữ liệu và file đảm nhiệm

- `src/components/PricingFields.jsx`: giá bán kiện tùy chọn, thêm đơn vị và quyền nhập/bán.
- `src/utils/productPricing.js`: tạo/kiểm tra `pricing.additionalUnits`, giá riêng của bịch/thùng, lựa chọn bán/nhập, giỏ dùng chung tồn, cập nhật giá nhập đúng đơn vị.
- `src/mappers/productMapper.js`: đọc/ghi đầy đủ đơn vị, hệ số, giá và `can_purchase`/`can_sell`. Giữ khóa đơn vị đã lưu khi sửa hàng.
- `src/components/SaleProductCard.jsx`: dùng các lựa chọn đơn vị từ `saleOptions`; không cần viết lại trang bán.
- `src/pages/StockPages.jsx`: dùng `purchaseOptions` cho đơn vị nhập và bản xem trước giá.
- `src/utils/stockCsv.js`, `src/mappers/stockCsvMapper.js`: bảo toàn quy cách khi xuất/import, chỉ gửi intent nhập vào một RPC.
- `src/stores/useShopStore.js`: demo có cùng lựa chọn; snapshot giá phiếu nhập, chặn thay quy cách khi còn tồn/giỏ, giữ backup và hủy đơn.
- `src/stores/useCloudShopStore.js`, `src/services/inventoryService.js`, `salesService.js`: cloud gửi đơn vị/số lượng, giá nhập và request ID; số dư/tổng tiền do PostgreSQL tính.

`product_units` có tối đa 8 dòng. Bánh kẹo dùng các đơn vị thùng/bịch/gói/cái/viên; đơn vị thêm không trùng tên/khóa với đơn vị đang có. Hệ số là số nguyên dương; giá trong giới hạn hiện tại. Giá nhập lẻ chỉ bật khi được khai báo; không tự suy ra giá bán gói hoặc kiện từ giá viên.

## CSV và dữ liệu cũ

File mẫu bánh kẹo cũ vẫn đọc được. Giá bán thùng dùng cột hiện có `Giá bán 1 thùng`; file xuất thêm cột tùy chọn `Quy cách bánh kẹo` để giữ giá bịch, giá nhập lẻ và các đơn vị thêm. Cách dễ nhất là khai báo trên form rồi tải danh sách; khi lập phiếu nhập CSV chỉ sửa số lượng, đơn vị và giá nhập thực tế, giữ nguyên cột quy cách.

Khi file khai báo quy cách mới khác hàng đã có, preview chặn trước khi ghi DB. File cũ không có cột quy cách không xóa các đơn vị thêm của hàng hiện có. Bịch là đơn vị tồn của hàng cũ vẫn nhập qua khóa `bag`, không ép sang khóa `base` vốn chỉ bán lẻ.

Danh sách tồn kho xuất CSV không mặc nhiên là phiếu nhập: số lượng nhập và giá nhập của lần nhập phải đúng; đơn vị nhập phải được bật cho mặt hàng. Không phát lại snapshot tồn kho để cộng thêm hàng.

Không chuyển stock, đổi khóa, đổi giá hoặc quy cách hàng cũ bằng migration. Nếu hàng có tồn, đang trong giỏ hoặc DB còn tham chiếu lịch sử, giữ quy cách cũ và tạo mặt hàng mới khi cần.

## Kiểm tra và giới hạn

- `tests/snack-units.test.js`: 12 kiểm tra cho mapper, bốn/năm cấp, giá/roles, mixed cart, demo sale/cancel, backup, phiếu nhập, CSV cũ/mới, chặn đổi quy cách và payload không chứa số dư.
- `backend/supabase/tests/snack_units.test.sql`: 32 pgTAP assertions cho tồn, doanh thu, nợ, trả một phần, preview/hủy/retry, COGS snapshot, nhập gói, CSV atomic/idempotent và RLS khác tenant.
- Bộ tổng: **135 JavaScript tests và 421 pgTAP assertions đạt**, cùng kiểm tra concurrency, lint/build. PostgreSQL chạy trên cluster tạm riêng, đã dừng; không bật Docker hoặc áp migration vào DB cửa hàng.
- Chưa kiểm tra HTTP Auth/PostgREST/Edge trên Supabase đang dùng. Tồn đầu kỳ cloud thiếu giá vốn thực vẫn giữ cost không rõ; không lấy giá nhập tham khảo để bịa giá vốn lịch sử.

Không có migration mới trong phần này; vẫn 31 migration, mới nhất `202610050026_seed_weight_units.sql`.
