# Tạp hóa BIN

Giao diện React + JavaScript dành cho chủ tiệm nhỏ, dùng tiếng Việt và bố cục thích ứng với điện thoại, máy tính bảng và máy tính.

## Cấu trúc FE / BE (09/10/2026)

- `frontend/`: React, `src/`, `public/`, Vite, `.env.local`, package riêng và test frontend.
- `backend/`: Gateway, microservices, shared server code, Supabase functions, migration/seed/test SQL và package riêng.
- `package.json` ở gốc chỉ điều phối lệnh cho hai phần; `docs/` và Docker Compose là tài liệu/cấu hình chung.

Lệnh `npm run dev`, `npm run build`, `npm test` và `npm run db:start` vẫn chạy từ thư mục gốc. Cài dependencies cho cả hai phần bằng `npm run install:all`. Có thể chạy riêng bằng `npm --prefix frontend run dev` và các script trong `backend/package.json`. Build frontend nằm tại `frontend/dist/`; biến `VITE_*` nằm tại `frontend/.env.local`, cấu hình bí mật server nằm trong backend.

Đây là thay đổi cấu trúc thư mục. Frontend vẫn giữ các adapter Supabase/demo hiện tại; việc chuyển hết nghiệp vụ sang microservices chưa hoàn tất. Hai bên hiện dùng chung contract lỗi công khai ở `backend/supabase/functions/_shared/applicationErrors.js`; frontend không import mã server hay thông tin kết nối PostgreSQL. Các tài liệu cũ ghi `src/`, `tests/` hoặc Vite tại gốc cần được hiểu là `frontend/src/`, `frontend/tests/` và `frontend/vite.config.js`.

## Chạy dự án

```sh
npm run install:all
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

Đăng nhập/đăng ký dùng Supabase Auth. Chế độ cloud đã nối hàng hóa, bán/nhập kho, công nợ, lịch sử, giá vốn và báo cáo vào PostgreSQL/RPC; database quyết định các biến động tiền/kho/nợ. Demo/legacy trên máy được giữ riêng. Xem [trạng thái triển khai hiện tại](docs/CLOUD_IMPLEMENTATION_STATUS.md) để phân biệt mã đã có với phần cần kiểm chứng trên Supabase thật.

Hỗ trợ lựa chọn **Tạp hóa** hoặc **Trái cây** khi tạo cửa hàng; [Trái cây](docs/FRUIT_UNIT_VARIANTS.md) cân theo kg/lạng/gram hoặc đếm theo quả, hộp và đơn vị đóng gói, có giá riêng từng đơn vị. [Hạt mới](docs/SEED_WEIGHT_UNITS.md) lưu gram, bán theo kg hoặc lạng với giá riêng; hàng cũ giữ đơn vị lạng. Ngày 05/10/2026, đã sao lưu/áp 33 migration vào Supabase local: 504 kiểm tra DB và integration Auth/PostgREST/Edge/MFA thật đạt. [Biên bản nghiệm thu local](docs/LOCAL_SUPABASE_ACCEPTANCE.md). Không cấu hình tự bật Docker.

Backend nằm trong cùng Git repo ở [`backend/`](backend/README.md): migration, cấu hình, seed, test SQL và Supabase CLI. Xem [thiết kế DB](backend/docs/DATABASE_DESIGN.md). Máy cần Docker Desktop đang chạy trước khi dùng:

```powershell
Set-Location D:/little_store_fe
npm ci
npm --prefix backend ci
npm run db:start
npm run db:migrate
npm run db:test
```

Các lệnh `db:*` ở thư mục gốc chuyển tới `backend/`. Frontend giữ SDK/service/repository/mapper để gọi API; cấu hình public URL/key nằm trong `.env.local` ở thư mục gốc. Việc gộp mã nguồn không thay đổi API URL và không reset dữ liệu.

Cloud dùng Zustand làm cache trong RAM, không persist số dư/kho/nợ vào localStorage. Nếu tài khoản/cửa hàng có dữ liệu legacy chưa chuyển, wizard sao lưu → kiểm tra → import atomic → đối chiếu giúp chuyển tồn và nợ mở đầu; giữ lịch sử cũ dạng archive và bản local. Không tự phát lại đơn cũ để tránh nhân đôi kho/doanh thu.

## Các màn hình

- Trang chủ: bốn thao tác chính, hoạt động gần đây và hàng cần nhập thêm. Chủ tiệm cloud có [dashboard từ DB](docs/OWNER_DASHBOARD.md): doanh thu, thực thu, giá vốn/lợi nhuận, đơn/nợ, tồn kho, nhập gần đây; trái cây có hư/thối theo từng đơn vị.
- Máy tính (`/calculator`), ngay trên Bán hàng: cộng, trừ, nhân, chia, số thập phân, bàn phím và lịch sử 100 phép tính gần nhất. Nhân/chia được tính trước cộng/trừ. Bấm kết quả trong lịch sử để tính tiếp. Phép tính không tác động doanh thu hoặc nợ.
- Bán hàng: tìm tên không cần dấu, lọc loại hàng, chọn số lượng và giỏ hàng.
- Thanh toán: nhận tiền hoặc ghi nợ cho khách, xác nhận trước khi lưu.
- Nhập hàng: chia nhóm, nhập theo thùng/bịch/kg/cây hoặc đơn vị riêng, lưu giá nhập từng lần và hiển thị tồn trước/sau. Hoàn tác 12 giây chỉ có trong demo.
- Thêm và sửa hàng: tên, nhóm, quy cách đóng hàng, các mức giá nhập/bán, số lượng ban đầu và ngừng bán.
- Kho hàng: tìm kiếm, lọc sắp hết/đã hết/ngừng bán, xuất CSV.
- Sổ nợ: thêm khách và nhấn Enter để chọn hàng ngay; mặc định mua chịu, mỗi khách có giỏ hàng riêng. Trả một phần giữ lại khách, trả hết xóa khách khỏi sổ nhưng giữ lịch sử giao dịch.
- Nhập hàng từ CSV (`/import/csv`): tải file mẫu, kiểm tra dữ liệu, xem trước và xác nhận nhập nhiều mặt hàng.
- Nhập danh mục giá từ Excel (`/import/catalog`): một file nhiều sheet theo nhóm hàng; xem trước, bỏ qua tên trùng và thêm hàng nháp ngừng bán với tồn kho 0. Giá nhập từ nguồn được lưu riêng để đối chiếu, không tự biến thành giá bán hay số lượng nhập kho.

### Lưu danh mục Excel vào Supabase DB

Trang `/import/catalog` có hai nơi lưu tách biệt: **Supabase DB** và **trên máy**. Sau khi đăng nhập và chọn cửa hàng, tải file Excel và xác nhận nhập. Một RPC ghi toàn bộ file trong một transaction: tạo mặt hàng mới ngừng bán với tồn 0, liên kết tên trùng với hàng đã có và lưu mọi dòng giá nguồn vào `product_source_quotes`. Gửi lại cùng mã lần nhập không tạo thêm hàng. Giá nhập tham khảo không trở thành giá bán; hàng nháp cần giá bán hợp lệ trước khi bật bán.

Để dùng Supabase local: mở Docker Desktop, chạy `npm run db:start` rồi `npm run db:migrate` tại thư mục frontend. Tạo `.env.local` từ `.env.example` với URL local và **publishable/anon key công khai** do `npm run db:status` cung cấp; không đặt service-role key vào `VITE_*`. Khởi động lại Vite bằng `npm run dev`. Nếu mới đăng ký mà chưa có cửa hàng, trang nhập cho phép tạo “Tạp hóa BIN” ngay trên DB. Không dùng `db:reset` khi muốn giữ dữ liệu đã có.

Trong chế độ cloud, danh mục DB cũng là danh mục của Bán hàng và Kho. Hàng nháp chưa đủ quy cách/giá bán không tự được bật bán. CSV nhập kho có giá vốn rõ ràng; Excel báo giá chỉ lưu nguồn tham khảo và không tự cộng tồn.
- Biểu đồ & doanh thu (`/revenue`): xem 7/30/90 ngày, doanh thu, tiền thực thu, số đơn, nợ hiện tại; xuất báo cáo CSV.
- Lịch sử (`/history`): bán hàng, nhập kho, ghi nợ, trả nợ, chỉnh sửa mặt hàng, khôi phục dữ liệu và hủy đơn.
- Đăng nhập/đăng ký (`/login`): Supabase Auth, xác thực phiên, quên và đặt lại mật khẩu.
- Tài khoản & sao lưu (`/account`): tải JSON đầy đủ, xem trước khi khôi phục, tự giữ bản dữ liệu trước lần khôi phục gần nhất.
- Kiểm kê (`/inventory/count`): nhiều mặt hàng, lý do chênh lệch, kiểm tra phiên bản; hao hụt và định giá tồn cũ trong chi tiết hàng, dành cho owner.
- Cài đặt (`/settings`): tên/điện thoại/địa chỉ và nhân viên với quyền bán, nhập, công nợ riêng. Xem [cách sử dụng và file đảm nhiệm](docs/SHOP_STAFF_SETTINGS.md).
- Quản trị (`/admin/*`): metadata nền tảng, trạng thái shop/user/Admin, audit, MFA; không đọc công nợ hoặc chi tiết bán hàng của shop mặc định.

## Trạng thái hiện tại

CSV dùng UTF-8 và mẫu theo nhóm tải trực tiếp từ trang nhập. Cloud yêu cầu giá nhập của đơn vị giao dịch để tính giá vốn. Đơn vị giao dịch và quy cách được kiểm tra; tên trùng nhập thêm vào hàng đã có, không tự đổi giá bán/quy cách. File xuất kho khi nạp lại sẽ cộng thêm tồn, không thay thế số tồn. Xem trước và xác nhận trước khi import; không tự đoán số lon/thùng hoặc giá bán từ báo giá.

Doanh thu gồm bán trả ngay và bán chịu trong kỳ, trừ đơn hủy vào ngày hủy. Tiền thực thu gồm bán trả ngay và thu nợ, trừ tiền hoàn vào ngày hủy. Thu nợ và nợ mở đầu không được cộng lại vào doanh thu. Cloud có bình quân gia quyền, snapshot COGS và lãi gộp, múi giờ Asia/Ho_Chi_Minh; dữ liệu vốn không biết giữ NULL, không tự giả định bằng 0. Báo cáo tài chính chỉ dành cho owner.

Demo còn dùng localStorage theo ID tài khoản/cửa hàng; dữ liệu mẫu cũ không tự chuyển sang tài khoản mới. Cloud không tự chuyển về demo khi mất mạng hoặc thiếu quyền. Mọi ghi cloud dùng RPC atomic/idempotent, chặn ghi trực tiếp bảng tiền/kho/nợ. Những số dư legacy thiếu chi tiết được giữ riêng và không tạo món hàng bán giả.

## Sao lưu và hủy đơn

Trong demo/legacy, **Tài khoản & sao lưu** tải JSON hàng hóa, quy cách, giá, khách, lịch sử và giỏ hàng. Khôi phục có xem trước/checksum và bản dự phòng trước khi ghi đè. JSON local không phải full DB backup và không được dùng để ghi đè cloud; production cần backup/restore PostgreSQL riêng.

Trong **Lịch sử**, owner bấm **Hủy đơn**, nhập lý do, xem hàng hoàn kho/nợ giảm/tiền cần hoàn. Cloud lấy preview từ server và xác nhận bằng token + request ID; nếu có trả nợ xen giữa, preview cũ bị chặn. Hoàn kho/nợ/vốn và audit cùng transaction; giữ đơn gốc, không hủy hai lần. Đây là ghi nhận tiền hoàn đã thực hiện, không tự chuyển tiền ngân hàng.

Đơn mua chịu giảm phần còn nợ, hoàn phần đã trả. Tiền trả nợ được phân bổ vào đơn cũ trước; khi hủy một đơn, phân bổ đã lưu của các đơn khác được giữ nguyên. Khách hết nợ được xóa khỏi sổ nợ, lịch sử vẫn còn. Đơn mẫu/cũ thiếu chi tiết mặt hàng hoặc không xác định được đơn vị hoàn kho sẽ không tự động hủy; tạo đơn mới để thử luồng này.

Các thành phần chính:

| Phần | File | Nhiệm vụ |
| --- | --- | --- |
| `LoginPage` | `src/pages/LoginPage.jsx` | Đăng nhập, đăng ký, quên mật khẩu qua Supabase Auth |
| `AccountPage` | `src/pages/AccountPage.jsx` | Hồ sơ, xuất JSON, xem trước và xác nhận khôi phục |
| `AccountBootstrap`, route guards | `src/auth/AccountBootstrap.jsx` | Kiểm tra phiên và chặn trang trước khi có tài khoản/cửa hàng |
| `useAccountStore` | `src/stores/useAccountStore.js` | Thông tin người dùng/cửa hàng đã xác minh trong bộ nhớ |
| Các hàm tài khoản | `src/services/accountService.js` | Tách dữ liệu trên máy theo tài khoản/cửa hàng, khôi phục, giữ bản dự phòng |
| Các hàm sao lưu | `src/utils/backup.js` | Kiểm tra dữ liệu, tạo/đọc/tải JSON |
| `HistoryPage` | `src/pages/DebtPages.jsx` | Danh sách lịch sử và mở hộp hủy |
| `CloudSaleCancellationDialog` | `src/components/CloudSaleCancellationDialog.jsx` | Preview/xác nhận cloud qua server; dialog cũ chỉ dùng demo |
| `cancellationPlan`, `applySaleCancellation`, `allocatePayment` | `src/utils/saleCancellation.js` | Logic demo; cloud do PostgreSQL xử lý |
| `useCloudShopStore`, `useActiveShopStore` | `src/stores/` | Cache cloud trong RAM và chọn đúng cloud/demo |
| `reportService` | `src/services/reportService.js` | Báo cáo cloud do server tính; `summarizeRevenue` dành cho demo |

Project dùng function component và Zustand; các phần trên không phải JavaScript `class`. Bộ kiểm tra `tests/account-and-cancellation.test.js` dùng dữ liệu trong bộ nhớ, không đụng dữ liệu trình duyệt của bạn.

Mã cloud đã nối backend; Supabase local đã áp migration và kiểm tra Auth/PostgREST/Edge bằng fixture riêng. Cần đối chiếu dữ liệu thực đã sao lưu và cấu hình production trước dùng cho cửa hàng thật.

## Tổ chức mã

- `src/layouts/MainLayout.jsx`: khung chung, điều hướng, hướng dẫn.
- `src/pages/`: các màn hình nghiệp vụ.
- `src/components/ui.jsx`: hộp xác nhận, hộp thoại, tìm kiếm, thông báo và bộ chọn số lượng.
- `src/stores/useShopStore.js`: dữ liệu mẫu, giỏ hàng, lịch sử và lưu cục bộ.
- `src/utils/shopHelpers.js`: tìm kiếm và xuất CSV.
- `src/index.css`: màu sắc, kích thước, bố cục responsive.

Đã chạy 141 kiểm tra JavaScript, 504 pgTAP assertions trên Supabase local và 43 kiểm tra Shop HTTP; Admin Edge/MFA/ban/unban/retry/429 đạt, build/lint đạt. Chạy `npm run test:integration` để kiểm tra API local đang mở. [Bánh kẹo nhiều cấp](docs/SNACK_MULTI_UNITS.md) có giá riêng thùng/bịch/gói/cái/viên và cùng dùng một số tồn. [Lớp lỗi ứng dụng](docs/APPLICATION_ERRORS.md) chuyển lỗi kỹ thuật thành thông báo tiếng Việt và giữ mã retry. Xem [cách chạy và giới hạn kiểm tra](docs/DATABASE_TESTING.md). Không tự bật Docker hoặc thực hiện thao tác trình duyệt.

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

Tồn kho lưu theo đơn vị nhỏ nhất; trái cây là gram. Có thể chọn nguyên thùng/cây và bán lẻ cùng giỏ; tổng quy đổi không vượt tồn. Lịch sử giữ snapshot tên/đơn vị/quy đổi/giá bán/COGS. Giá nhập từng lần được lưu riêng trong phiếu nhập; hoàn tác nhập tức thời chỉ có trong demo.

CSV có file mẫu riêng cho cả 6 nhóm, kèm cột quy cách và các mức giá. Các số trong file mẫu chỉ là ví dụ. Cột `Giá bán` là giá bán lẻ theo `Đơn vị bán lẻ`; cột `Đơn vị` là đơn vị của số lượng nhập trong file. File xuất kho có thêm các cột giá và quy cách; `Còn lại` được xuất theo đơn vị nhỏ nhất.

Đã kiểm tra phép quy đổi bằng dữ liệu thử trong bộ nhớ: 6 mẫu CSV và xuất/nhập lại, bán thùng cùng lon, chống bán vượt tồn, hoàn tác nhập, cộng/trả nợ và quy đổi kg/lạng, bịch/viên. Không thay đổi dữ liệu trình duyệt và chưa kiểm tra thao tác giao diện bằng trình duyệt.
