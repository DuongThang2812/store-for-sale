export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
    }).format(amount).replace('₫', 'đ');
};
export const formatDate = (dateString) => {
    if (!dateString)
        return '';
    const date = new Date(dateString);
    const now = new Date();
    if (date.toDateString() === now.toDateString())
        return 'Hôm nay';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString())
        return 'Hôm qua';
    return new Intl.DateTimeFormat('vi-VN').format(date);
};
