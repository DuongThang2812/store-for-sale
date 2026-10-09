/** Keep provider and database diagnostics out of account-facing UI. */
export function accountErrorMessage(error, action = 'login') {
    if (error?.message === 'Email không hợp lệ.' || error?.message === 'Vui lòng nhập mật khẩu.' || error?.message === 'Mật khẩu cần ít nhất 8 ký tự, có chữ và số.') return error.message;
    if (action === 'login') return 'Email hoặc mật khẩu không đúng, hoặc chưa xác nhận email. Vui lòng thử lại.';
    if (action === 'signup') return 'Chưa tạo được tài khoản. Vui lòng kiểm tra thông tin và thử lại.';
    if (action === 'reset') return 'Chưa thực hiện được yêu cầu. Vui lòng thử lại sau.';
    return 'Chưa kết nối được với cửa hàng. Vui lòng thử lại.';
}
