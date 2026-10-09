import { pageRange } from '../services/serviceUtils.js';

/** Wrap current demo state without moving/changing persistence or checkout logic. */
export function createDemoShopRepository(getState) {
    if (typeof getState !== 'function') throw new Error('Demo repository cần getState.');
    const page = (rows, options) => {
        const { offset, limit } = pageRange(options);
        return structuredClone([...rows].sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id)).slice(offset, offset + limit));
    };
    return Object.freeze({
        mode: 'demo',
        async listProducts(options = {}) {
            return page(getState().products.filter(product => !options.activeOnly || product.isActive), options);
        },
        async getProduct(productId) {
            return structuredClone(getState().products.find(product => product.id === productId) ?? null);
        },
        async listCustomers(options = {}) {
            return page(getState().customers.filter(customer => !options.debtOnly || customer.totalDebt > 0), options);
        },
    });
}
