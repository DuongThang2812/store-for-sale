/** Keep provider and database diagnostics out of account-facing UI. */
export function accountErrorMessage(error, action = 'login') {
    if (error?.message === 'Email không hợp lệ.' || error?.message === 'Vui lòng nhập mật khẩu.' || error?.message === 'Mật khẩu cần ít nhất 8 ký tự, có chữ và số.') return error.message;
    if (error?.message?.startsWith('Mã xác thực không hợp lệ') || error?.message?.startsWith('Không tìm thấy phiên') || error?.message?.startsWith('Bạn đã hủy') || error?.message?.startsWith('Không thể xác thực')) {
        return error.message;
    }
    if (action === 'oauth') {
        const msg = (error?.message || '').toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
            return 'Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra kết nối mạng và thử lại.';
        }
        if (msg.includes('already exists') || msg.includes('registered')) {
            return 'Email này đã được dùng cho tài khoản khác. Vui lòng đăng nhập bằng email và mật khẩu.';
        }
        return 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.';
    }
    if (action === 'login') return 'Email hoặc mật khẩu không đúng, hoặc chưa xác nhận email. Vui lòng thử lại.';
    if (action === 'signup') return 'Chưa tạo được tài khoản. Vui lòng kiểm tra thông tin và thử lại.';
    if (action === 'reset') {
        const msg = (error?.message || '').toLowerCase();
        if (msg.includes('mật khẩu') || msg.includes('password')) return error.message;
        if (msg.includes('session') || msg.includes('recovery') || msg.includes('phiên')) {
            return 'Phiên đặt lại mật khẩu đã hết hạn hoặc không tìm thấy. Vui lòng yêu cầu liên kết mới.';
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
            return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
        }
        return 'Chưa thực hiện được yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau.';
    }
    return 'Chưa kết nối được với cửa hàng. Vui lòng thử lại.';
}
