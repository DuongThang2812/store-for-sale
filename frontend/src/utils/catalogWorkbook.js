import { BASIC_UNITS } from './productPricing.js';

export const CATALOG_SHEETS = Object.freeze({
    'Gia vị & thực phẩm': 'spices', 'Nước ngọt': 'drinks', Bia: 'beer',
    'Mì & bún': 'other', 'Sữa & dinh dưỡng': 'other', 'Cà phê & trà': 'other',
    'Bánh kẹo': 'snacks', Giấy: 'other', 'Tã & BVS': 'other',
    'Chăm sóc cá nhân': 'other', 'Hóa phẩm & gia dụng': 'other',
    'Khác cần rà soát': 'other',
});

const columns = ['Mã nguồn', 'Tên hàng', 'Giá nhập gốc', 'Giá nhập tham khảo (đ)', 'Đơn vị giá nhập', 'Giá bậc / khuyến mãi', 'Tình trạng nguồn', 'Giá bán lẻ (đ)', 'Đơn vị bán lẻ', 'Ghi chú rà soát', 'Dòng gốc'];
const str = value => String(value ?? '').trim();
const money = (value, label, line) => {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(str(value).replaceAll('.', '').replaceAll(',', ''));
    if (!Number.isSafeInteger(number) || number < 0 || number > 999999999) throw new Error(`${label} ở dòng ${line} phải là số nguyên từ 0 đến 999.999.999đ.`);
    return number;
};

export function parseCatalogWorkbook(sheets) {
    if (!Array.isArray(sheets)) throw new Error('Không đọc được các sheet trong file Excel.');
    const records = [];
    const seenSheets = new Set();
    const seenSources = new Set();
    for (const { sheet, data } of sheets) {
        if (sheet === 'Hướng dẫn') continue;
        if (!Object.hasOwn(CATALOG_SHEETS, sheet)) throw new Error(`Sheet “${sheet}” không thuộc mẫu danh mục hàng.`);
        if (seenSheets.has(sheet)) throw new Error(`Sheet “${sheet}” bị lặp.`);
        seenSheets.add(sheet);
        if (!Array.isArray(data)) throw new Error(`Sheet “${sheet}” không đọc được dữ liệu.`);
        const headerIndex = data.findIndex(row => Array.isArray(row) && row[0] === 'Mã nguồn' && row[1] === 'Tên hàng');
        if (headerIndex < 0 || columns.some((label, i) => data[headerIndex][i] !== label)) throw new Error(`Sheet “${sheet}” đã đổi tên hoặc thứ tự cột. Hãy dùng file mẫu.`);
        for (let i = headerIndex + 1; i < data.length; i++) {
            const row = data[i] || [];
            if (!row.some(cell => cell !== null && cell !== undefined && str(cell) !== '')) continue;
            const line = `${sheet}, dòng ${i + 1}`;
            const sourceId = str(row[0]);
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(sourceId) || seenSources.has(sourceId)) throw new Error(`Mã nguồn ở ${line} bị thiếu, sai hoặc trùng.`);
            seenSources.add(sourceId);
            const name = str(row[1]).normalize('NFC');
            if (!name || name.length > 120) throw new Error(`Tên hàng ở ${line} phải dài 1–120 ký tự.`);
            const unit = str(row[8]) || 'cái';
            if (!BASIC_UNITS.includes(unit)) throw new Error(`Đơn vị bán lẻ ở ${line} chưa được hỗ trợ.`);
            const purchasePrice = money(row[3], 'Giá nhập tham khảo', line);
            const salePrice = money(row[7], 'Giá bán lẻ', line);
            records.push({ sourceId, name, category: sheet, draftGroup: CATALOG_SHEETS[sheet], unit,
                salePrice, supplierQuote: { originalPrice: str(row[2]), purchasePrice, purchaseUnit: str(row[4]), tiers: str(row[5]), availability: str(row[6]), reviewNote: str(row[9]), originalLine: str(row[10]), sourceId } });
            if (records.length > 2000) throw new Error('File có hơn 2.000 mặt hàng. Hãy chia danh mục thành nhiều file.');
        }
    }
    if (!records.length) throw new Error('Không tìm thấy mặt hàng trong file Excel.');
    return records;
}

const key = name => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
export function planCatalogDraftImport(records, products) {
    if (!Array.isArray(records) || !Array.isArray(products)) throw new Error('Danh sách mặt hàng chưa hợp lệ.');
    const seen = new Set(products.map(item => key(item.name)));
    const create = [];
    let skipped = 0;
    for (const record of records) {
        const nameKey = key(record.name);
        if (seen.has(nameKey)) { skipped++; continue; }
        seen.add(nameKey);
        create.push({ name: record.name, category: record.category, unit: record.unit,
            price: record.salePrice ?? 0, stock: 0, isActive: false, draftGroup: record.draftGroup,
            supplierQuote: record.supplierQuote });
    }
    return { create, skipped };
}
