# BIN Frontend

React + Vite, JavaScript/JSX. Source nằm trong `src/`, tài nguyên tĩnh trong `public/`, test trong `tests/`.

```powershell
npm ci
npm run dev
npm run build
npm test
```

Cấu hình Vite: `.env.local` tại thư mục này. Chỉ dùng `VITE_*` public key/URL; không đưa secret hoặc service-role key vào frontend. Backend nằm ở `../backend/`. Chạy các lệnh database từ thư mục gốc hoặc backend. Build được xuất ra `dist/`.

Frontend hiện giữ adapter Supabase/demo cũ trong lúc chuyển dần sang microservices. Contract lỗi công khai được import từ backend; hãy giữ hai thư mục cùng repo.
