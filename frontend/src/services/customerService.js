import { getSupabaseClient } from '../lib/supabase.js';
import { mapPaymentCommand } from '../mappers/transactionMapper.js';
import { pageRange, requiredText, requireUuid, unwrap } from './serviceUtils.js';

const fields = 'id,store_id,name,phone,note,current_debt,is_in_debt_book,last_transaction_at,open_invoice_count';

export function createCustomerService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        async list(storeId, options = {}) {
            requireUuid(storeId, 'Cửa hàng');
            const { offset, end } = pageRange(options);
            let query = clientProvider().from('customer_debt_summary').select(fields).eq('store_id', storeId);
            if (options.debtOnly) query = query.eq('is_in_debt_book', true);
            return unwrap(query.order('name').order('id').range(offset, end));
        },
        async get(storeId, customerId) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(customerId, 'Khách hàng');
            return unwrap(clientProvider().from('customer_debt_summary').select(fields)
                .eq('store_id', storeId).eq('id', customerId).maybeSingle());
        },
        save(storeId, { name, phone = '', note = '', customerId = null }) {
            requireUuid(storeId, 'Cửa hàng');
            if (customerId !== null) requireUuid(customerId, 'Khách hàng');
            const normalized = requiredText(name, 'Tên khách');
            if (typeof phone !== 'string' || typeof note !== 'string'
                || normalized.length > 120 || phone.length > 30 || note.length > 500) {
                throw new Error('Tên, điện thoại hoặc ghi chú quá dài.');
            }
            return unwrap(clientProvider().rpc('save_customer', {
                p_store_id: storeId, p_name: normalized, p_phone: phone.trim() || null,
                p_note: note.trim() || null, p_customer_id: customerId,
            }));
        },
        create(storeId, { requestId, name, phone = '', note = '' }) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(requestId, 'Mã yêu cầu');
            const normalized = requiredText(name, 'Tên khách');
            if (normalized.length > 120 || typeof phone !== 'string' || phone.length > 30
                || typeof note !== 'string' || note.length > 500) {
                throw new Error('Thông tin khách chưa hợp lệ.');
            }
            return unwrap(clientProvider().rpc('create_customer', {
                p_store_id: storeId, p_request_id: requestId, p_name: normalized,
                p_phone: phone.trim() || null, p_note: note.trim() || null,
            }));
        },
        recordDebtPayment(storeId, command) {
            return unwrap(clientProvider().rpc('record_debt_payment', mapPaymentCommand(storeId, command)));
        },
    });
}

export const customerService = createCustomerService();
