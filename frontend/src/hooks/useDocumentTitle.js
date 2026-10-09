import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_TITLES = {
    '/': 'Trang chủ · Tạp hóa BIN',
    '/sales': 'Bán hàng · BIN',
    '/cart': 'Giỏ hàng · BIN',
    '/calculator': 'Máy tính tiền · BIN',
    '/import': 'Nhập hàng · BIN',
    '/import/existing': 'Nhập thêm hàng · BIN',
    '/import/csv': 'Nhập hàng từ CSV · BIN',
    '/import/catalog': 'Nhập danh mục Excel · BIN',
    '/import/new': 'Thêm hàng mới · BIN',
    '/inventory': 'Kho hàng · BIN',
    '/inventory/count': 'Kiểm kê kho · BIN',
    '/categories': 'Danh mục hàng · BIN',
    '/suppliers': 'Nhà cung cấp · BIN',
    '/debt': 'Sổ nợ · BIN',
    '/history': 'Lịch sử giao dịch · BIN',
    '/revenue': 'Biểu đồ & Doanh thu · BIN',
    '/settings': 'Cài đặt cửa hàng · BIN',
    '/account': 'Tài khoản & Sao lưu · BIN',
    '/setup': 'Thiết lập cửa hàng · BIN',
    '/login': 'Đăng nhập · BIN',
    '/reset-password': 'Đặt lại mật khẩu · BIN',
    '/admin': 'Tổng quan · BIN Admin',
    '/admin/shops': 'Cửa hàng · BIN Admin',
    '/admin/users': 'Tài khoản · BIN Admin',
    '/admin/admins': 'Quản trị viên · BIN Admin',
    '/admin/security': 'Bảo mật nền tảng · BIN Admin',
    '/admin/audit-logs': 'Nhật ký Admin · BIN Admin',
    '/admin/system': 'Hệ thống · BIN Admin',
    '/admin/settings': 'Cài đặt · BIN Admin',
    '/admin/mfa/setup': 'Thiết lập MFA · BIN Admin',
    '/admin/mfa/challenge': 'Xác thực MFA · BIN Admin'
};

export function useDocumentTitle() {
    const location = useLocation();

    useEffect(() => {
        const path = location.pathname;
        let title = ROUTE_TITLES[path];

        if (!title) {
            if (path.startsWith('/admin/shops/')) title = 'Chi tiết cửa hàng · BIN Admin';
            else if (path.startsWith('/admin/users/')) title = 'Chi tiết tài khoản · BIN Admin';
            else if (path.startsWith('/inventory/')) title = 'Chi tiết mặt hàng · BIN';
            else if (path.startsWith('/debt/')) title = 'Chi tiết công nợ · BIN';
            else if (path.startsWith('/admin')) title = 'Quản trị nền tảng · BIN Admin';
            else title = 'Tạp hóa BIN · Nhẹ việc tiệm, vui mỗi ngày';
        }

        document.title = title;
    }, [location.pathname]);
}
