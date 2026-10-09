export const BUSINESS_TYPES = Object.freeze([
    { id: 'grocery', label: 'Tạp hóa', description: 'Bán hàng theo cái, gói, chai, thùng…' },
    { id: 'fruit_shop', label: 'Trái cây', description: 'Bán theo kg, gram, quả, hộp hoặc khay.' },
]);

export function businessTypeLabel(value) {
    return BUSINESS_TYPES.find(type => type.id === value)?.label || 'Cửa hàng';
}

export function requireBusinessType(value) {
    if (!BUSINESS_TYPES.some(type => type.id === value)) throw new Error('Vui lòng chọn loại cửa hàng hợp lệ.');
    return value;
}
