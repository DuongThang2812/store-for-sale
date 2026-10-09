import { getSupabaseClient } from '../lib/supabase.js';
import { createProductService } from '../services/productService.js';
import { createCustomerService } from '../services/customerService.js';
import { createSalesService } from '../services/salesService.js';
import { createInventoryService } from '../services/inventoryService.js';
import { createSupplierService } from '../services/supplierService.js';
import { requireUuid } from '../services/serviceUtils.js';
import { mapProduct } from '../mappers/productMapper.js';
import { mapCustomer } from '../mappers/customerMapper.js';
import { mapTransactionResult } from '../mappers/transactionMapper.js';

/** One immutable repository per selected store; discard it on logout/store change. */
export function createSupabaseShopRepository({ storeId, clientProvider = getSupabaseClient }) {
    requireUuid(storeId, 'Cửa hàng');
    const products = createProductService(clientProvider);
    const customers = createCustomerService(clientProvider);
    const sales = createSalesService(clientProvider);
    const inventory = createInventoryService(clientProvider);
    const suppliers = createSupplierService(clientProvider);
    return Object.freeze({
        mode: 'supabase', storeId,
        async listProducts(options) { return (await products.list(storeId, options)).map(mapProduct); },
        async getProduct(productId) {
            const row = await products.get(storeId, productId);
            return row ? mapProduct(row) : null;
        },
        async listCustomers(options) { return (await customers.list(storeId, options)).map(mapCustomer); },
        async getCustomer(customerId) {
            const row = await customers.get(storeId, customerId);
            return row ? mapCustomer(row) : null;
        },
        async listSourceQuotes(options) { return products.listSourceQuotes(storeId, options); },
        async previewCancellation(saleId) { return sales.previewCancellation(storeId, saleId); },
        async listSuppliers(options) { return suppliers.list(storeId, options); },
        commands: Object.freeze({
            async importCatalogDrafts(requestId, records) { return products.importCatalogDrafts(storeId, requestId, records); },
            async createSale(command) { return mapTransactionResult(await sales.createSale(storeId, command)); },
            async cancelSale(command) { return sales.cancelSale(storeId, command); },
            async receiveStock(command) { return mapTransactionResult(await inventory.receiveStock(storeId, command)); },
            async importStockCsv(command) { return inventory.importCsv(storeId, command); },
            async adjustStock(command) { return inventory.adjustStock(storeId, command); },
            async countStock(command) { return inventory.countStock(storeId, command); },
            async valueOpeningStock(command) { return inventory.valueOpeningStock(storeId, command); },
            async saveProduct(product, productId = null, requestId = null) { return products.save(storeId, product, productId, requestId); },
            async saveCustomer(command) { return customers.save(storeId, command); },
            async createCustomer(command) { return customers.create(storeId, command); },
            async saveSupplier(command) { return suppliers.save(storeId, command); },
            async recordDebtPayment(command) { return mapTransactionResult(await customers.recordDebtPayment(storeId, command)); },
        }),
    });
}
