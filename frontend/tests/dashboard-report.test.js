import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportService } from '../src/services/reportService.js';
import { mapDashboard, mapReport } from '../src/mappers/reportMapper.js';
import { reportScopeMatches } from '../src/domain/reportScope.js';
import { formatReportQuantity, formatReportTimestamp, formatGrossMargin } from '../src/utils/reportDisplay.js';

const storeId = 'f9100000-0000-4000-8000-000000000001';
const productId = 'f9100000-0000-4000-8000-000000000002';
const receiptId = 'f9100000-0000-4000-8000-000000000003';
const report = () => ({
    timezone: 'Asia/Ho_Chi_Minh', start_date: '2026-10-05', end_date: '2026-10-05',
    rows: [{ date: '2026-10-05', revenue: '100000', cash_collected: '40000', new_credit: '60000', repayments: '0',
        sales_count: '2', cogs: '60000', gross_profit: '40000', cost_data_complete: true }],
    totals: { revenue: '100000', cash_collected: '40000', new_credit: '60000', repayments: '0', sales_count: '2',
        outstanding_debt: '60000', cogs: '60000', gross_profit: '40000', gross_margin_percent: '40.00',
        cost_data_complete: true, unvalued_sale_events: '0', low_stock_count: '1', out_of_stock_count: '3',
        loss_value: null, loss_data_complete: false, unvalued_loss_movements: '1' },
    top_products_by_revenue: [{ product_id: productId, name: 'Táo', revenue: '100000', quantity_base: '2000', base_unit: 'gram' }],
});
const dashboard = () => ({
    report: report(), debt_customer_count: '1',
    high_stock_products: [{ product_id: productId, name: 'Táo', stock_base: '5000', base_unit: 'gram' }],
    low_stock_products: [],
    recent_stock_receipts: [{ receipt_id: receiptId, created_at: '2026-10-04T17:00:00Z', total_cost: '300000', item_count: '2', supplier_name: null }],
    spoilage: { quantity_by_unit: [{ base_unit: 'gram', quantity_base: '1200' }, { base_unit: 'quả', quantity_base: '2' }],
        value: null, cost_data_complete: false, movement_count: '2', unvalued_movements: '1' },
});

test('dashboard reads a single server aggregate, without client stock/money input', async () => {
    const calls = [];
    const service = createReportService(() => ({ rpc: async (...args) => { calls.push(args); return { data: dashboard(), error: null }; } }));
    const result = await service.getDashboard(storeId);
    assert.deepEqual(calls, [['shop_dashboard', { p_store_id: storeId }]]);
    assert.equal(result.report.totals.grossMarginPercent, 40);
    assert.equal(result.report.totals.currentDebt, 60000);
    assert.equal(result.debtCustomerCount, 1);
    assert.equal(result.highStockProducts[0].stock, 5000);
    assert.equal(result.recentStockReceipts[0].totalCost, 300000);
    assert.equal(result.recentStockReceipts[0].supplierName, null);
    assert.deepEqual(result.spoilage.quantityByUnit, [{ baseUnit: 'gram', quantityBase: 1200 }, { baseUnit: 'quả', quantityBase: 2 }]);
    assert.equal(result.spoilage.value, null);
    assert.equal(result.spoilage.costDataComplete, false);
});

test('malformed margins never display NaN, zero from missing values, or Infinity', () => {
    for (const value of [undefined, '', ' ', false, {}, 'NaN', 'Infinity', Infinity, NaN, '1e500']) {
        const raw = report(); raw.totals.gross_margin_percent = value;
        assert.throws(() => mapReport(raw), /Tỷ suất/);
    }
    const raw = report(); raw.totals.gross_margin_percent = null;
    assert.equal(mapReport(raw).totals.grossMarginPercent, null);
    raw.totals.gross_margin_percent = '-25.50';
    assert.equal(mapReport(raw).totals.grossMarginPercent, -25.5);
});

test('dashboard refuses unsafe integers, broken timestamps and unbounded arrays', () => {
    for (const mutate of [
        raw => { raw.spoilage.value = '9007199254740993'; },
        raw => { raw.high_stock_products[0].stock_base = '1.5'; },
        raw => { raw.spoilage.quantity_by_unit[0].quantity_base = '-1'; },
        raw => { raw.recent_stock_receipts[0].created_at = 'yesterday'; },
        raw => { raw.high_stock_products = Array(11).fill(raw.high_stock_products[0]); },
        raw => { raw.low_stock_products = Array(6).fill(raw.high_stock_products[0]); },
        raw => { raw.recent_stock_receipts = Array(11).fill(raw.recent_stock_receipts[0]); },
        raw => { raw.report.rows = []; },
        raw => { raw.report.rows[0].date = '2026-02-31'; },
    ]) {
        const raw = dashboard(); mutate(raw); assert.throws(() => mapDashboard(raw));
    }
});

test('invalid shop IDs fail before client creation; RPC permission errors stay safe', async () => {
    let calls = 0;
    const service = createReportService(() => { calls++; throw new Error('should not connect'); });
    await assert.rejects(service.getDashboard('demo-shop'), /UUID/);
    await assert.rejects(service.getRevenue('demo-shop'), /UUID/);
    assert.equal(calls, 0);
    await assert.rejects(createReportService(() => ({ rpc: async () => ({ error: { code: '42501', message: 'private SQL' }, data: null }) })).getDashboard(storeId),
        error => error.applicationCode === 'FORBIDDEN' && !error.message.includes('private SQL'));
});

test('financial response belongs only to the exact session, shop, role and refresh scope', () => {
    const user = { id: 'u1' }; const revision = [];
    const scope = { user, storeId, revision, dataMode: 'supabase', role: 'owner' };
    const state = { user, storeId, revision, data: { revenue: 123 } };
    assert.equal(reportScopeMatches(state, scope), true);
    for (const changed of [
        { user: null }, { user: { id: 'u1' } }, { storeId: productId }, { role: 'staff' }, { dataMode: 'demo' }, { revision: [] },
    ]) assert.equal(reportScopeMatches(state, { ...scope, ...changed }), false);
    assert.equal(reportScopeMatches(null, scope), false);
});

test('report display keeps base units separate and uses the shop timezone', () => {
    assert.equal(formatReportQuantity(1200, 'gram'), '1,2 kg');
    assert.equal(formatReportQuantity(2, 'quả'), '2 quả');
    assert.equal(formatReportQuantity(5, 'lạng'), '5 lạng');
    assert.match(formatReportTimestamp('2026-10-04T17:00:00Z'), /05\/10\/2026/);
    assert.equal(formatGrossMargin(null), '—');
    assert.equal(formatGrossMargin(37.5), '37,5%');
});
