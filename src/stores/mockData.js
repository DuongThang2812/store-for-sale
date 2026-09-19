export const mockProducts = [
    { id: '1', name: 'Mì Hảo Hảo', price: 4500, stock: 45, unit: 'gói', isActive: true },
    { id: '2', name: 'Coca-Cola', price: 10000, stock: 20, unit: 'lon', isActive: true },
    { id: '3', name: 'Nước suối Aquafina', price: 5000, stock: 0, unit: 'chai', isActive: true },
];
export const mockCustomers = [
    { id: 'c1', name: 'Anh Nam', phone: '0901234567', totalDebt: 120000, lastTransactionAt: new Date().toISOString() },
    { id: 'c2', name: 'Cô Lan', note: 'Cô Lan đầu hẻm', totalDebt: 75000, lastTransactionAt: new Date(Date.now() - 86400000).toISOString() },
];
