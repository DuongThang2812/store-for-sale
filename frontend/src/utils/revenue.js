export function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// Opening balances are existing debt, not sales made on the date they were entered.
export function isOpeningDebt(entry) {
    return entry.kind === 'debt' && (entry.openingBalance || entry.detail === 'Số nợ ban đầu');
}
export function summarizeRevenue(entries, days, now = new Date()) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const rows = Array.from({ length: days }, (_, index) => {
        const date = new Date(end); date.setDate(date.getDate() - days + 1 + index);
        return { key: localDayKey(date), date, revenue: 0, received: 0, debt: 0, repayments: 0, count: 0 };
    });
    const lookup = new Map(rows.map(row => [row.key, row]));
    for (const entry of entries) {
        const row = lookup.get(localDayKey(new Date(entry.date)));
        if (!row || entry.undone || !Number.isFinite(entry.amount) || entry.amount < 0) continue;
        if (entry.kind === 'sale') {
            row.revenue += entry.amount; row.received += entry.amount; if (!entry.cancelledAt) row.count++;
        } else if (entry.kind === 'debt' && !isOpeningDebt(entry)) {
            row.revenue += entry.amount; row.debt += entry.amount; if (!entry.cancelledAt) row.count++;
        } else if (entry.kind === 'cancel') {
            row.revenue -= entry.amount; row.received -= entry.refundAmount || 0;
            if (entry.originalKind === 'debt') row.debt -= entry.amount;
        } else if (entry.kind === 'payment') {
            row.received += entry.amount; row.repayments += entry.amount;
        }
    }
    const totals = rows.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, received: sum.received + row.received, debt: sum.debt + row.debt, repayments: sum.repayments + row.repayments, count: sum.count + row.count }), { revenue: 0, received: 0, debt: 0, repayments: 0, count: 0 });
    return { rows, totals };
}
