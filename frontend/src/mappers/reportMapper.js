import { toSafeInteger } from './numberMapper.js';
import { requireUuid } from '../services/serviceUtils.js';

const signedAmount = (value, label) => toSafeInteger(value, label, { min: Number.MIN_SAFE_INTEGER });
const amount = (value, label) => value === null ? null : signedAmount(value, label);

function percentage(value) {
    if (value === null) return null;
    if ((typeof value !== 'number' && typeof value !== 'string')
        || !/^-?\d+(\.\d+)?$/.test(String(value))
        || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER) {
        throw new Error('Tỷ suất lợi nhuận từ hệ thống chưa hợp lệ.');
    }
    return Number(value);
}

function dateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
        throw new Error('Ngày báo cáo chưa hợp lệ.');
    }
    return value;
}

function list(value, max) {
    if (!Array.isArray(value) || value.length > max) throw new Error('Danh sách báo cáo chưa hợp lệ.');
    return value;
}

function text(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} từ hệ thống chưa hợp lệ.`);
    return value;
}

export function mapReport(raw) {
    if (!raw || !Array.isArray(raw.rows) || !raw.totals || !Array.isArray(raw.top_products_by_revenue)) {
        throw new Error('Dữ liệu báo cáo từ hệ thống chưa hợp lệ.');
    }
    if (!raw.rows.length) throw new Error('Dữ liệu báo cáo từ hệ thống chưa hợp lệ.');
    const rows = list(raw.rows, 90).map(row => {
        dateKey(row.date);
        return {
            key: row.date, date: new Date(`${row.date}T12:00:00`),
            revenue: signedAmount(row.revenue, 'Doanh thu'),
            received: signedAmount(row.cash_collected, 'Tiền thực thu'),
            debt: signedAmount(row.new_credit, 'Bán chịu'),
            repayments: toSafeInteger(row.repayments, 'Thu nợ'),
            count: toSafeInteger(row.sales_count, 'Số đơn'),
            cogs: amount(row.cogs, 'Giá vốn'),
            grossProfit: amount(row.gross_profit, 'Lợi nhuận gộp'),
            costDataComplete: row.cost_data_complete === true,
        };
    });
    const totals = raw.totals;
    return {
        timezone: text(raw.timezone, 'Múi giờ'), startDate: dateKey(raw.start_date), endDate: dateKey(raw.end_date),
        rows,
        totals: {
            revenue: signedAmount(totals.revenue, 'Doanh thu'),
            received: signedAmount(totals.cash_collected, 'Tiền thực thu'),
            debt: signedAmount(totals.new_credit, 'Bán chịu'),
            repayments: toSafeInteger(totals.repayments, 'Thu nợ'),
            count: toSafeInteger(totals.sales_count, 'Số đơn'),
            currentDebt: toSafeInteger(totals.outstanding_debt, 'Công nợ'),
            cogs: amount(totals.cogs, 'Giá vốn'),
            grossProfit: amount(totals.gross_profit, 'Lợi nhuận gộp'),
            grossMarginPercent: percentage(totals.gross_margin_percent),
            costDataComplete: totals.cost_data_complete === true,
            unvaluedSaleEvents: toSafeInteger(totals.unvalued_sale_events, 'Đơn thiếu giá vốn'),
            lowStockCount: toSafeInteger(totals.low_stock_count, 'Hàng sắp hết'),
            outOfStockCount: toSafeInteger(totals.out_of_stock_count, 'Hàng hết'),
            lossValue: amount(totals.loss_value, 'Giá trị hao hụt'),
            lossDataComplete: totals.loss_data_complete === true,
            unvaluedLossMovements: toSafeInteger(totals.unvalued_loss_movements, 'Hao hụt thiếu giá vốn'),
        },
        topProducts: list(raw.top_products_by_revenue, 10).map(product => ({
            id: requireUuid(product.product_id, 'Mặt hàng'), name: text(product.name, 'Tên hàng'),
            revenue: toSafeInteger(product.revenue, 'Doanh thu mặt hàng'),
            quantityBase: toSafeInteger(product.quantity_base, 'Số lượng bán'),
            baseUnit: text(product.base_unit, 'Đơn vị gốc'),
        })),
    };
}

const mapStock = product => ({
    id: requireUuid(product.product_id, 'Mặt hàng'), name: text(product.name, 'Tên hàng'),
    stock: toSafeInteger(product.stock_base, 'Tồn kho'), baseUnit: text(product.base_unit, 'Đơn vị gốc'),
});

export function mapDashboard(raw) {
    if (!raw?.spoilage) throw new Error('Dữ liệu dashboard từ hệ thống chưa hợp lệ.');
    return {
        report: mapReport(raw.report),
        debtCustomerCount: toSafeInteger(raw.debt_customer_count, 'Khách đang nợ'),
        highStockProducts: list(raw.high_stock_products, 10).map(mapStock),
        lowStockProducts: list(raw.low_stock_products, 5).map(mapStock),
        recentStockReceipts: list(raw.recent_stock_receipts, 10).map(receipt => {
            if (typeof receipt.created_at !== 'string' || !Number.isFinite(Date.parse(receipt.created_at))) {
                throw new Error('Ngày nhập hàng chưa hợp lệ.');
            }
            return {
                id: requireUuid(receipt.receipt_id, 'Phiếu nhập'), createdAt: receipt.created_at,
                totalCost: toSafeInteger(receipt.total_cost, 'Tổng tiền nhập'),
                itemCount: toSafeInteger(receipt.item_count, 'Số dòng nhập'),
                supplierName: receipt.supplier_name === null ? null : text(receipt.supplier_name, 'Nhà cung cấp'),
            };
        }),
        spoilage: {
            quantityByUnit: list(raw.spoilage.quantity_by_unit, 16).map(row => ({
                baseUnit: text(row.base_unit, 'Đơn vị gốc'),
                quantityBase: toSafeInteger(row.quantity_base, 'Số lượng hư/thối'),
            })),
            value: amount(raw.spoilage.value, 'Giá trị hư/thối'),
            movementCount: toSafeInteger(raw.spoilage.movement_count, 'Lần ghi nhận hư/thối'),
            unvaluedMovements: toSafeInteger(raw.spoilage.unvalued_movements, 'Hư/thối thiếu giá vốn'),
            costDataComplete: raw.spoilage.cost_data_complete === true,
        },
    };
}
