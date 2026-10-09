const currencyFormatter = new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('vi-VN');
const activityDateFormatter = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
const activityTimeFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const formatCurrency = amount => currencyFormatter.format(amount).replace('₫', 'đ');
export const formatActivityTime = value => {
    const date = new Date(value);
    return `${activityDateFormatter.format(date)} · ${activityTimeFormatter.format(date)}`;
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
    return dateFormatter.format(date);
};
