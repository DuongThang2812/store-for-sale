import { formatKgFromGrams } from './productPricing.js';

const timestamp = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export const formatReportTimestamp = value => timestamp.format(new Date(value));
export const formatReportQuantity = (quantity, baseUnit) => baseUnit === 'gram'
    ? formatKgFromGrams(quantity) : `${quantity.toLocaleString('vi-VN')} ${baseUnit}`;
export const formatGrossMargin = value => value === null ? '—'
    : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
