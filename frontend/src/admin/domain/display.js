export const adminDate = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có';
export const adminInteger = value => Number(value || 0).toLocaleString('vi-VN');
export const businessLabel = type => type === 'fruit_shop' ? 'Trái cây' : 'Tạp hóa';
export const statusLabel = status => ({ active: 'Đang hoạt động', suspended: 'Tạm khóa', archived: 'Đã lưu trữ', disabled: 'Vô hiệu' })[status] || status;
