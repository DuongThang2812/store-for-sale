# UI Access Requirements

## Platform Admin Routes Access Requirement

- **User**: `duongnguyendinhthang@gmail.com`
- **Role**: Store Owner (`owner` / "Chủ tiệm")
- **Assigned Store**: `Tạp hóa BIN`

### Inaccessible Routes with Current Credentials:
- `/admin`
- `/admin/shops`
- `/admin/shops/:id`
- `/admin/users`
- `/admin/users/:id`
- `/admin/admins`
- `/admin/security`
- `/admin/audit-logs`
- `/admin/system`
- `/admin/settings`
- `/admin/mfa/setup`
- `/admin/mfa/challenge`

### Observation:
When accessing `/admin`, the application correctly enforces security via `AdminAccessGate` and renders the unauthorized access screen (`Chưa vào được cổng quản trị`).
As per security guidelines, authorization is not bypassed, mocked, or tampered with.

### Needed for Admin Visual QA:
- A valid Platform Admin (`platform_admin` / `super_admin`) test credential if authenticated live data QA is required for the admin section.
- Admin UI styles and components are refined based on static code audit, styling system tokens, and simulated component testing without modifying security gates or database roles.
