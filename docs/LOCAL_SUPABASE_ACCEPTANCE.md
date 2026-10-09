# Nghiệm thu Supabase local — 05/10/2026

Đã kiểm tra trên Docker/Supabase local do người dùng chủ động mở, bằng Supabase Auth, PostgREST và Edge Function thật. Frontend giữ JavaScript/JSX, kiến trúc Page → Service → Repository → RPC/Query → PostgreSQL/RLS; demo vẫn tách riêng.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Migration trên Supabase local | 33 migration, đến `202610050028_catalog_purchase_privacy.sql` |
| `npm run db:test` | 20 file, 504/504 pgTAP assertions đạt |
| `npm test` | 144/144 JavaScript tests đạt sau sửa lỗi chọn/render cửa hàng |
| `npm run lint`, `npm run build` | Đạt |
| `scripts/smoke-shop-api.mjs` | 43 kiểm tra qua Auth/PostgREST và các service/repository của frontend đạt |
| `scripts/smoke-admin-edge.mjs` | Auth/MFA thật, 403/400/200/429, khóa/mở tài khoản và retry đạt |

Luồng cửa hàng đã chạy: đăng nhập/xác minh/refresh/logout; tạo tạp hóa và trái cây; lưu hàng; nhập nhiều thùng; bán chịu kết hợp thùng/chai; trả một phần; preview/hủy đơn; hoàn tồn/nợ/tiền/vốn; kiểm kê có phiên bản; nhân viên bán tiền mặt; tenant khác bị chặn. Retry giữ request ID không ghi hai lần. Bán 1,35 kg trái cây tính tiền/vốn/lãi từ PostgreSQL; hư 1.200 gram giữ snapshot giá vốn.

Admin: user thường bị 403; Admin AAL1 bị 403; enroll/challenge/verify TOTP thật lên AAL2 và đọc dashboard được 200. Phân trang sai bị 400. Khóa/mở tài khoản đồng bộ trạng thái DB và Supabase Auth. Intent mới thứ 11 trong cửa sổ bị 429 với `Retry-After`; request đã commit vẫn retry được, không khôi phục trạng thái cũ.

## Lỗi phát hiện và sửa

Nhân viên mặc định trước đó đọc được `product_units.purchase_price` qua JSON của `product_catalog` và qua Data API trực tiếp. Migration 028 chặn cột giá nhập thô, trả giá nhập `null` cho nhân viên bán hàng; owner hoặc nhân viên được cấp **quyền nhập hàng rõ ràng** đọc giá nhập hiện hành qua helper có kiểm tra tenant/membership. Báo giá nguồn cũng cần quyền nhập. Chi phí lịch sử phiếu nhập chỉ owner đọc; nhân viên xem lịch sử đã che giá qua `shop_activity`. Giá vốn lô bị chặn đọc thô, metadata lô vẫn đọc theo RLS. Không chỉ ẩn trường trên giao diện.

Các test bổ sung kiểm tra cả view, helper gọi trực tiếp và Data API; giữ nguyên giá bán/hệ số cho nhân viên. Test SQL rollback, không để lại dữ liệu.

## Dữ liệu và sao lưu

Trước khi áp 14 migration còn thiếu, đã tạo full PostgreSQL dump tại `backend/backups/before-migration-20261005-144711.dump`. Thư mục backup được Git ignore; dump chứa dữ liệu nhạy cảm, không đưa lên frontend/Git.

Giữ nguyên số lượng dữ liệu ban đầu: **1 cửa hàng, 6 mặt hàng, 0 đơn bán, 1 tài khoản Auth**. Không `db:reset`, không import lại dữ liệu nhà bán hoặc sửa số dư cũ. Fixture HTTP dùng UUID/email riêng của mỗi lần chạy và chỉ xóa fixture đó. Với audit Admin append-only của fixture, cleanup dùng kết nối PostgreSQL tin cậy và bypass trigger cục bộ trong transaction; không sửa trigger/constraint hoặc audit của người dùng thật.

## Chạy lại

Sau khi chủ động mở Docker và Supabase local:

```powershell
Set-Location D:\little_store_fe
npm run backend:check
npm run db:test
npm run test:integration
npm run dev
```

`test:integration` chỉ chấp nhận stack local `127.0.0.1:54321`, không tự khởi động Docker, không gửi email. Script đọc local service key trong bộ nhớ để tạo/xóa tài khoản fixture; không ghi key vào file hoặc biến `VITE_*`. Frontend dùng URL/public key trong `.env.local`.

## Phạm vi chưa nghiệm thu

Không chạy thao tác browser theo yêu cầu người dùng. Chưa deploy production, gửi/reset email thật, bootstrap Admin thật hoặc chuyển dữ liệu legacy thật. Mất mạng sau commit trên trình duyệt, thao tác nhiều thiết bị và đối chiếu dữ liệu kinh doanh thực cần nghiệm thu riêng. Đây không phải chứng nhận toàn bộ 165 yêu cầu đạt.

## Sửa lỗi frontend khi mở cửa hàng

- `StoreSetupPage.jsx`: điều hướng về trang chủ sau khi xác minh chọn/tạo cửa hàng thành công; trước đó chỉ cập nhật phiên, vẫn đứng ở `/setup`.
- `useActiveShopStore.js`: chỉ dùng một subscription Zustand vào nguồn dữ liệu đang chọn. Trước đó selector `useShallow` được dùng chung cho demo và cloud, hai snapshot thay nhau ghi đè cache khiến React cập nhật lặp. Sửa dùng `useStore` với store theo `dataMode`, giữ cả API không truyền selector. Ba regression test chạy hook React thật bằng server renderer kiểm tra nguồn active và API cũ; không thao tác trình duyệt người dùng. 144 JS tests và lint/build đạt. Chỉ cần tải lại frontend, không restart DB.
