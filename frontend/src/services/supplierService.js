import { getSupabaseClient } from '../lib/supabase.js';
import { pageRange, requiredText, requireUuid, unwrap } from './serviceUtils.js';

const optionalText = (value, label, maxLength) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maxLength) throw new Error(`${label} quá dài.`);
    return value.trim() || null;
};

export function createSupplierService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        list(storeId, options = {}) {
            requireUuid(storeId, 'Cửa hàng');
            const { offset, end } = pageRange(options);
            return unwrap(clientProvider().from('suppliers')
                .select('id,store_id,name,phone,address,note,is_active,created_at')
                .eq('store_id', storeId).order('name').range(offset, end));
        },
        save(storeId, { id = null, name, phone = null, address = null, note = null }) {
            requireUuid(storeId, 'Cửa hàng');
            if (id != null) requireUuid(id, 'Nhà cung cấp');
            const normalizedName = requiredText(name, 'Tên nhà cung cấp');
            if (normalizedName.length > 120) throw new Error('Tên nhà cung cấp tối đa 120 ký tự.');
            return unwrap(clientProvider().rpc('save_supplier', {
                p_store_id: storeId, p_name: normalizedName,
                p_phone: optionalText(phone, 'Số điện thoại', 30),
                p_address: optionalText(address, 'Địa chỉ', 300),
                p_note: optionalText(note, 'Ghi chú', 500),
                p_supplier_id: id,
            }));
        },
    });
}

export const supplierService = createSupplierService();
