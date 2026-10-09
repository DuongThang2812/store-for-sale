# Tạp hóa BIN — Kết nối Supabase, giai đoạn 0 và 1

Cập nhật: 24/09/2026. Một Git repo tại `D:/little_store_fe`; backend nằm trong `backend/`.

## 1. Phạm vi và kết quả

Đã cài `@supabase/supabase-js` và tạo lớp Service → Repository → Mapper bằng JavaScript ESModules. Auth thật và nạp cửa hàng đã có ở lớp service. Repository đọc sản phẩm/khách và adapter gọi ba RPC bán hàng, nhập kho, trả nợ đã có mã nguồn và unit test.

**Các màn hình vẫn dùng demo/localStorage. Chưa chuyển `/login`, `/sales`, `/inventory` hoặc bootstrap của ứng dụng sang Supabase.** Đây là lớp nền chuẩn bị kết nối, không phải tuyên bố giao diện đã chạy DB thật. Không thay JSX/CSS, không thay cách lưu demo, không nhập dữ liệu demo vào DB.

Backend nằm tại `D:/little_store_fe/backend`: Supabase Auth + PostgreSQL/RPC, migration, seed, test SQL, cấu hình và Supabase CLI. Các file client/service/repository/mapper ở `src/` vì chạy trong trình duyệt. Xem [README backend](../backend/README.md). `project_id` được giữ nguyên để không đổi định danh container/volume local; không reset DB khi gộp thư mục.

## 2. File và trách nhiệm

| File trong `D:/little_store_fe` | Trách nhiệm |
| --- | --- |
| `src/lib/supabaseConfig.js` | Kiểm tra URL, publishable/anon key; từ chối secret/service-role key, không in key. |
| `src/lib/supabase.js` | Singleton khởi tạo khi được gọi; SDK lưu session, tự refresh; demo không cần `.env.local`. |
| `src/services/authService.js` | Đăng ký, đăng nhập, đọc session, xác minh user qua Auth server, refresh, logout, đăng ký/hủy listener. |
| `src/services/storeService.js` | Đọc `store_members` nối `stores`; tạo cửa hàng bằng RPC `create_store`; chọn cửa hàng theo membership. |
| `src/services/productService.js` | Đọc/phân trang `product_catalog`, luôn lọc `store_id`. |
| `src/services/customerService.js` | Đọc `customer_debt_summary`; gọi `record_debt_payment`. |
| `src/services/salesService.js` | Adapter `create_sale`, chỉ gửi mặt hàng/đơn vị/số lượng/hình thức thanh toán. |
| `src/services/inventoryService.js` | Adapter `receive_stock`, gửi số lượng và giá nhập đã khai báo. |
| `src/services/reportService.js` | Khung báo cáo; trả lỗi `NOT_IMPLEMENTED` cho tới khi có truy vấn/RPC báo cáo server. |
| `src/services/serviceUtils.js` | Kiểm tra ID/phân trang và chuyển tiếp lỗi SDK. |
| `src/repositories/shopRepository.js` | Hợp đồng đọc dùng chung và factory chọn rõ `demo`/`supabase`. |
| `src/repositories/demoShopRepository.js` | Đọc trạng thái demo hiện tại, trả bản sao để không sửa nhầm Zustand. |
| `src/repositories/supabaseShopRepository.js` | Gắn cố định một `storeId`, gọi service rồi map sang mô hình UI. Có `commands` riêng cho RPC. |
| `src/mappers/storeMapper.js` | Cửa hàng/membership → camelCase. |
| `src/mappers/productMapper.js` | Catalog/đơn vị → product UI; đơn vị camelCase → payload DB. |
| `src/mappers/customerMapper.js` | `current_debt` → `totalDebt`, giữ cờ sổ nợ. |
| `src/mappers/transactionMapper.js` | Payload ghi theo danh sách field cho phép và kết quả RPC → camelCase. |
| `src/mappers/numberMapper.js` | Chuyển bigint sang Number an toàn cho UI; từ chối số quá lớn thay vì làm tròn. |
| `scripts/check-supabase.mjs` | Kiểm tra cấu hình và endpoint sức khỏe Auth; không in thông tin xác thực. |
| `tests/supabase-foundation.test.js` | 16 test cấu hình, Auth, Store, mapping, phân trang, RPC và demo. |
| `.env.example`, `package.json`, `package-lock.json` | Mẫu biến môi trường, SDK và lệnh kiểm tra. |

`src/services/accountService.js`, `src/stores/useAccountStore.js`, `src/stores/useShopStore.js` và `src/auth/AccountBootstrap.jsx` giữ nguyên cho demo. Không dùng account ID/email của demo làm `auth.uid()` hoặc ID cửa hàng thật.

## 3. Cài đặt trên Windows

Mở Docker Desktop, đợi Docker Engine chạy. Mở PowerShell:

```powershell
Set-Location D:/little_store_fe
npm ci
npm --prefix backend ci
npm run db:start
```

SDK đã được thêm vào dependencies và lockfile. Nếu cần cài riêng ở một bản checkout cũ:

```powershell
npm install @supabase/supabase-js
```

Tạo `.env.local` nếu chưa có (không ghi đè file hiện tại):

```powershell
if (-not (Test-Path -LiteralPath .env.local)) {
    Copy-Item -LiteralPath .env.example -Destination .env.local
}
notepad .env.local
```

Nội dung cần điền bằng cấu hình Supabase local của máy:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_DIEN_KEY_CONG_KHAI_THAT
```

Nếu local cung cấp legacy anon JWT, **bỏ dòng publishable** và dùng:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=DIEN_ANON_JWT_THAT
```

Lấy URL/public key từ thông tin local sau `npm run db:start` hoặc phần API của Supabase Studio. Không copy secret/service-role key. Không commit `.env.local` (`*.local` đã được bỏ qua). Vite đưa `VITE_*` vào mã trình duyệt: bộ kiểm tra chỉ giúp phát hiện cấu hình sai, không thể giữ bí mật một key đã đưa vào build.

Khởi động lại Vite sau khi đổi `.env.local`:

```powershell
npm run backend:check
npm run test:backend
npm test
npm run lint
npm run build
npm run dev
```

DB test chạy từ thư mục gốc và được chuyển tới backend:

```powershell
Set-Location D:/little_store_fe
npm run db:test
```

`backend:check` dùng tính năng đọc env của Node hiện đại (máy hiện tại Node 24). Nó chỉ kiểm tra Auth có truy cập được, chưa xác nhận schema, đăng nhập hay RLS. `db:test` cần DB local đang chạy và đã áp dụng migration; không cần reset dữ liệu chỉ để chạy test. Không chạy `db:reset` trên dữ liệu cần giữ.

## 4. Auth và cửa hàng — API đã có

Ví dụ dưới đây dành cho module JavaScript trong ứng dụng Vite; không phải thay thế màn hình login hiện tại:

```js
import { authService } from '../services/authService.js';
import { storeService } from '../services/storeService.js';
import { createShopRepository } from '../repositories/shopRepository.js';

export async function register({ email, password, name }) {
    const result = await authService.signUp({ email, password, name });
    // Nếu bật email confirmation, session có thể null: chờ xác nhận email.
    // Chưa tạo store hoặc gọi dữ liệu bảo vệ khi chưa có phiên hợp lệ.
    return result;
}

export async function login({ email, password }, preferredStoreId = null) {
    await authService.signIn({ email, password });
    const context = await storeService.loadContext(preferredStoreId);
    const repository = context.store
        ? await createShopRepository({ mode: 'supabase', storeId: context.store.id })
        : null;
    return { ...context, repository };
}

export async function createFirstStore(name) {
    const storeId = await storeService.createStore(name);
    return storeService.getStore(storeId);
}

export async function logout() {
    await authService.signOut();
    // Lớp UI tích hợp ở bước sau phải bỏ repository, dữ liệu cloud và giỏ cloud.
    // Không xóa toàn bộ localStorage vì còn dữ liệu demo.
}
```

- `getSession()` dùng cho vòng đời/hiển thị, không chứng minh quyền truy cập. `getUser()` gọi Auth server; RLS và RPC kiểm tra quyền thực sự.
- SDK tự lưu/refresh session với key riêng theo host Supabase. Không tự lưu mật khẩu hoặc sao chép access token vào Zustand persist.
- `getUser()` trả `null` khi chưa có session; lỗi mạng/xác thực khác được chuyển cho caller, không giả thành đăng xuất thành công.
- Đăng ký dùng metadata `name`, khớp trigger tạo profile hiện có.
- Với email confirmation, cấu hình Site URL/redirect allowlist trỏ đúng origin Vite. Tham số `emailRedirectTo` là tùy chọn của `signUp`; không lấy URL redirect tùy ý từ người dùng. PKCE được cấu hình ở client.
- Không tự tạo store ngay sau signup. `loadContext()` trả `needsStoreCreation` khi chưa có; một cửa hàng thì chọn tự động; nhiều cửa hàng thì yêu cầu chọn. Store đã lưu nhưng mất quyền không bị đổi ngầm sang cửa hàng khác.
- `create_store` hiện chưa có idempotency key. Nếu kết quả mạng không rõ, đọc lại danh sách cửa hàng trước khi tạo lại.

Listener sử dụng callback đồng bộ, dọn khi unmount. Không `await` lời gọi Supabase bên trong callback SDK; đưa việc tải dữ liệu ra effect/job riêng. Ví dụ:

```js
const unsubscribe = authService.onAuthStateChange((event, session) => {
    setAuthState({ event, session }); // Setter của lớp Auth UI sẽ thêm ở bước sau.
});
// Cleanup của effect: return unsubscribe;
```

Khi nối UI cần chống phản hồi cũ: logout/đổi cửa hàng phải vô hiệu hóa các request đang chờ bằng generation ID hoặc cơ chế hủy request trước khi ghi dữ liệu vào state.

## 5. Repository và Mapper

Hợp đồng chung giai đoạn này là **đọc**, tất cả trả Promise:

```js
repository.listProducts({ offset: 0, limit: 100, activeOnly: true });
repository.getProduct(productId);
repository.listCustomers({ offset: 0, limit: 100, debtOnly: true });
```

`activeOnly: true` phù hợp chọn hàng bán; bỏ cờ để đọc cả hàng ngưng bán ở Kho. `debtOnly: true` đọc sổ nợ; bỏ cờ để đọc cả khách mới chưa phát sinh nợ. Limit mặc định 100, tối đa 200; danh sách trả về chỉ là một trang. Khi nối màn hình cần tải thêm/phân trang, không coi 100 dòng là toàn bộ kho. Thứ tự theo tên rồi ID; thứ tự tiếng Việt có thể khác nhẹ giữa collation PostgreSQL và trình duyệt.

```js
const demo = await createShopRepository({ mode: 'demo' });
const cloud = await createShopRepository({ mode: 'supabase', storeId });
```

Không tự fallback sang demo khi cloud lỗi. Không ghi kết quả DB vào store demo; bước nối UI cần state/cache riêng cho mode cloud. Các action demo hiện tại vẫn ở `useShopStore`; chưa trộn chúng với `commands` của cloud.

Mapper giữ `pricing` của sáu nhóm hàng và thêm `units` có `canSell`/`canPurchase`, giá nhập/bán và hệ số. Đây là thông tin cần dùng khi nối UI; không được suy diễn giá null thành 0 hoặc cho bán đơn vị có `canSell: false`. DB cho phép một số cấu hình linh hoạt hơn form hiện tại: nhóm dùng kiện cần `pack`, bánh kẹo cần `bag` với quy đổi khớp để tạo được `pricing`. Thiếu quy cách thì mapper báo lỗi, không tự bịa hệ số. Chưa migrate catalog demo sang DB.

Tiền DB vẫn là `bigint`, tồn kho DB vẫn là số nguyên base unit. UI đang dùng Number nên mapper chặn giá trị ngoài `Number.MAX_SAFE_INTEGER`; không tuyên bố hỗ trợ toàn bộ miền bigint ở UI. Nếu cần miền lớn hơn sau này phải dùng chuỗi/BigInt xuyên suốt hiển thị. Server vẫn là nguồn quyết định số tiền, tồn và nợ.

## 6. Khung ghi giao dịch cho bước tiếp theo

Các adapter có thể gọi từ mã tích hợp, chưa gắn vào nút giao diện:

```js
const command = {
    requestId: crypto.randomUUID(), // Tạo một lần cho một ý định giao dịch.
    paymentType: 'credit',
    customerId,
    items: [{ productId, unitKey: 'base', quantity: 2 }],
};
const result = await cloud.commands.createSale(command);
// Khi lỗi mạng không rõ kết quả: thử lại CHÍNH command này, không đổi requestId.
```

| Method trên `cloud.commands` | Input ngoài storeId đã gắn | RPC |
| --- | --- | --- |
| `createSale` | `{ requestId, items: [{ productId, unitKey, quantity }], paymentType, customerId }` | `create_sale` |
| `receiveStock` | `{ requestId, items: [{ productId, unitKey, quantity, unitCost }], note? }` | `receive_stock` |
| `recordDebtPayment` | `{ requestId, customerId, amount, paymentMethod?, note? }` | `record_debt_payment` |

- Không có `stock`, `totalDebt`, tổng tiền bán hay giá bán do client tính trong payload bán hàng. Giá nhập ở phiếu nhập là giá người dùng khai báo; server xác nhận và tính tổng/biến động kho.
- Adapter không tạo request ID, không retry tự động. Caller phải giữ cùng ID **và cùng payload** khi thử lại một giao dịch, kể cả sau reload; hàng đợi giữ command đang chờ chưa thuộc bước này.
- DB hiện chống trùng request ID nhưng chưa kiểm tra fingerprint của payload. Không dùng cùng ID cho hai ý định khác nhau. Cần bổ sung kiểm tra payload ở migration tiếp theo trước luồng retry hoàn chỉnh.
- Kết quả duplicate của nhập kho có thể thiếu `total_cost`; mapper giữ trường đó vắng mặt, không giả thành 0. Sau thành công/duplicate phải tải lại dữ liệu server cho phần kho/nợ bị ảnh hưởng.
- Lỗi kết nối hoặc lỗi map kết quả có thể xảy ra **sau khi DB commit**. Không coi đó là giao dịch chưa tồn tại rồi gửi ID mới.
- Trả hết nợ: server ẩn khách khỏi sổ nợ, giữ bản ghi để bảo toàn lịch sử; không xóa vật lý khách.
- Chưa nối chỉnh sản phẩm, thêm khách, hủy đơn, hoàn tác nhập kho, CSV, realtime hoặc báo cáo. `save_product`, `save_customer`, `cancel_sale` có trong DB nhưng chưa có adapter giao diện ở bước này. Hoàn tác nhập kho/báo cáo cần thiết kế server bổ sung.

## 7. Bảo mật và kiểm chứng

Đã đọc ba migration: các bảng public đều bật RLS; các bảng giao dịch/kho/nợ chỉ grant SELECT cho authenticated, thay đổi qua RPC; view dùng `security_invoker`. RPC kiểm tra membership và thực hiện transaction trong PostgreSQL. Không thay migration hay cấp thêm quyền trong bước này. Phân quyền owner/staff chi tiết hơn vẫn là việc tiếp theo; membership không tương đương mọi yêu cầu quản trị đã hoàn thiện.

Kiểm tra đã chạy:

- `npm run test:backend`: **16/16 đạt**, dùng client giả để kiểm tra hợp đồng API/mapping; không chứng minh DB thật đã chạy.
- `npm test`: **36/36 đạt**, gồm 20 test hiện có cho demo/máy tính/lưu trữ.
- `npm run lint`: đạt.
- `npm run build`: đạt. Vì màn hình chưa import lớp cloud, build này vẫn là giao diện demo; module mới được kiểm tra qua unit test/lint.
- `npm run db:test` (lần kiểm tra 23/09): **chưa chạy được** — `ECONNREFUSED 127.0.0.1:54322`. Docker CLI cũng báo không có pipe `dockerDesktopLinuxEngine`. Sau khi gộp, chạy lệnh này từ `D:/little_store_fe`; cần mở Docker Desktop rồi `npm run db:start` và chạy lại.
- Chưa có `.env.local` khi kiểm tra. Chưa thực hiện đăng ký/đăng nhập hoặc giao dịch trên Supabase thật; không tự tạo tài khoản/người dùng mẫu trong DB.

Sau khi Docker chạy, kiểm tra thêm bằng tài khoản thử: signup (có/không yêu cầu xác nhận), login, tạo store, load lại membership, reload/refresh/logout. Với DB test, xác nhận người ngoài không đọc/ghi được cửa hàng và gọi lặp một request ID chỉ phát sinh một giao dịch. Các bài unit test không thay thế kiểm tra RLS thực tế.

## 8. Bước nối UI tiếp theo

1. Thêm auth state cloud và lựa chọn mode rõ ràng, giữ lối vào demo; xử lý xác nhận email/chọn cửa hàng.
2. Nối đọc Kho/Bán hàng qua repository, phân trang và kiểm tra quy cách; cache cloud tách khỏi persisted demo.
3. Nối giao dịch bằng command có ID bền vững, chặn nhấn lặp, xử lý lỗi mạng/đơn chưa rõ kết quả rồi refetch dữ liệu.
4. Kiểm thử tích hợp Auth, RLS, RPC, số lượng cạnh tranh và nhiều phiên trước khi chuyển luồng thực tế.

Tài liệu tham khảo chính thức: [Supabase Auth JavaScript](https://supabase.com/docs/reference/javascript/auth), [Auth state listener](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [React và Supabase Auth](https://supabase.com/docs/guides/getting-started/tutorials/with-react).
