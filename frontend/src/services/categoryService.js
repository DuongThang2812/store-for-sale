import { getSupabaseClient } from '../lib/supabase.js';
import { requiredText, requireUuid, unwrap } from './serviceUtils.js';

export function createCategoryService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        async list(storeId) {
            requireUuid(storeId, 'Cửa hàng');
            return unwrap(clientProvider().from('categories')
                .select('id,store_id,name,is_active,created_at')
                .eq('store_id', storeId).order('name'));
        },
        async save(storeId, name, categoryId = null) {
            requireUuid(storeId, 'Cửa hàng');
            if (categoryId) requireUuid(categoryId, 'Danh mục');
            const normalized = requiredText(name, 'Tên danh mục');
            if (normalized.length > 80) throw new Error('Tên danh mục tối đa 80 ký tự.');
            return unwrap(clientProvider().rpc('save_category', {
                p_store_id: storeId, p_name: normalized, p_category_id: categoryId,
            }));
        },
    });
}

export const categoryService = createCategoryService();
