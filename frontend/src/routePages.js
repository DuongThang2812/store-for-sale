import { lazy } from 'react';

const loaders = {
    sales: () => import('./pages/SalesPages'),
    stock: () => import('./pages/StockPages'),
    count: () => import('./pages/InventoryCountPage'),
    debt: () => import('./pages/DebtPages'),
    csv: () => import('./pages/CsvImportPage'),
    catalog: () => import('./pages/CatalogImportPage'),
    revenue: () => import('./pages/RevenuePage'),
    account: () => import('./pages/AccountPage'),
    calculator: () => import('./pages/CalculatorPage'),
    login: () => import('./pages/LoginPage'),
    settings: () => import('./pages/ShopSettingsPage'),
};
const pending = new Map();
function load(group) {
    if (!pending.has(group)) {
        pending.set(group, loaders[group]().catch(error => { pending.delete(group); throw error; }));
    }
    return pending.get(group);
}
const page = (group, name) => lazy(() => load(group).then(module => ({ default: module[name] })));
export const SalesPage = page('sales', 'SalesPage');
export const CartPage = page('sales', 'CartPage');
export const ImportPage = page('stock', 'ImportPage');
export const ImportExistingPage = page('stock', 'ImportExistingPage');
export const ProductFormPage = page('stock', 'ProductFormPage');
export const InventoryPage = page('stock', 'InventoryPage');
export const InventoryCountPage = page('count', 'InventoryCountPage');
export const DebtPage = page('debt', 'DebtPage');
export const CustomerPage = page('debt', 'CustomerPage');
export const HistoryPage = page('debt', 'HistoryPage');
export const CsvImportPage = page('csv', 'CsvImportPage');
export const CatalogImportPage = page('catalog', 'CatalogImportPage');
export const RevenuePage = page('revenue', 'RevenuePage');
export const AccountPage = page('account', 'AccountPage');
export const CalculatorPage = page('calculator', 'CalculatorPage');
export const LoginPage = page('login', 'LoginPage');
export const ShopSettingsPage = page('settings', 'ShopSettingsPage');

// Fetch only the page the user is pointing at or focusing with the keyboard.
export function preloadRoute(event) {
    const href = event.target.closest('a')?.getAttribute('href');
    if (!href?.startsWith('/') || href.startsWith('//')) return;
    const path = href.split('?')[0];
    const group = path.startsWith('/import/csv') ? 'csv'
        : path.startsWith('/import/catalog') ? 'catalog'
        : /^\/(sales|cart)(\/|$)/.test(path) ? 'sales'
        : /^\/(import|inventory)(\/|$)/.test(path) ? 'stock'
        : /^\/(debt|history)(\/|$)/.test(path) ? 'debt'
        : path.slice(1);
    if (loaders[group]) load(group).catch(() => {});
}
