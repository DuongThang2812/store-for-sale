import { BASIC_UNITS, PRODUCT_GROUPS, createPricingDraft, buildPricing, purchaseOptions, baseQuantity } from './productPricing.js';
const normalize = value => String(value).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const units = BASIC_UNITS;

function parseCells(text) {
    const firstLine = text.split(/\r?\n/)[0];
    const separator = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false;
    const pushCell = () => { row.push(cell.trim()); cell = ''; closed = false; };
    const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; }
                else { quoted = false; closed = true; }
            } else cell += char;
        } else if (char === separator) pushCell();
        else if (char === '\r' || char === '\n') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            pushRow();
        } else if (char === '"' && !cell.trim() && !closed) { quoted = true; cell = ''; }
        else {
            if (char === '"' || (closed && char.trim())) throw new Error('File có dấu ngoặc kép chưa đúng. Hãy lưu lại dưới dạng CSV UTF-8.');
            if (!closed) cell += char;
        }
    }
    if (quoted) throw new Error('File có ô chưa đóng dấu ngoặc kép.');
    pushRow();
    return rows;
}
function integer(value, label, line) {
    let text = String(value).trim().replace(/\s*(đ|₫|vnd)$/i, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replaceAll('.', '');
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error(`Dòng ${line}: ${label} phải là số nguyên không âm (ví dụ 4500).`);
    return Number(text);
}
export function parseStockCsv(text) {
    const cells = parseCells(text.replace(/^\uFEFF/, ''));
    if (cells.length < 2) throw new Error('File cần có hàng tiêu đề và ít nhất một mặt hàng.');
    if (cells.length > 2001) throw new Error('Mỗi lần nhập tối đa 2.000 mặt hàng.');
    const headers = cells[0].map(normalize);
    const columns = { name: headers.indexOf('tên hàng'), price: headers.indexOf('giá bán'), quantity: headers.findIndex(h => ['số lượng', 'số lượng nhập', 'còn lại'].includes(h)), unit: headers.indexOf('đơn vị'), category: headers.findIndex(h => ['loại hàng', 'danh mục'].includes(h)), status: headers.indexOf('trạng thái') };
    if (['name', 'price', 'quantity', 'unit'].some(key => columns[key] < 0)) throw new Error('Thiếu cột bắt buộc: Tên hàng, Giá bán, Số lượng, Đơn vị. Bạn có thể tải file mẫu bên dưới.');
    if (new Set(headers).size !== headers.length) throw new Error('Tên cột bị trùng. Mỗi cột chỉ xuất hiện một lần.');
    const seen = new Set();
    return cells.slice(1).map((cells, i) => {
        const line = i + 2;
        if (cells.length !== headers.length) throw new Error(`Dòng ${line}: số ô không khớp với tiêu đề. Tên chứa dấu phẩy cần nằm trong dấu ngoặc kép.`);
        const name = cells[columns.name];
        const unit = normalize(cells[columns.unit]);
        if (!name || name.length > 120) throw new Error(`Dòng ${line}: tên hàng phải có từ 1 đến 120 ký tự.`);
        if (!units.includes(unit)) throw new Error(`Dòng ${line}: đơn vị cần là ${units.join(', ')}.`);
        const key = normalize(name);
        if (seen.has(key)) throw new Error(`Dòng ${line}: “${name}” bị lặp trong file. Hãy gộp số lượng vào một dòng.`);
        seen.add(key);
        if (columns.status >= 0 && cells[columns.status] && normalize(cells[columns.status]) !== 'đang bán') throw new Error(`Dòng ${line}: bỏ mặt hàng ngừng bán khỏi danh sách nhập.`);
        const quantityText = cells[columns.quantity].trim().replace(',', '.');
        const quantity = unit === 'kg' && /^\d+(\.\d)?$/.test(quantityText) ? Number(quantityText) : integer(cells[columns.quantity], 'số lượng', line);
        const price = integer(cells[columns.price], 'giá bán', line);
        if (quantity <= 0 || quantity > 999999 || price > 999999999) throw new Error(`Dòng ${line}: số lượng từ 1 đến 999.999; giá bán tối đa 999.999.999đ.`);
        const get = header => { const index = headers.indexOf(normalize(header)); return index < 0 ? '' : cells[index]; };
        let productTemplate;
        const groupName = get('Nhóm hàng');
        if (groupName && normalize(groupName) !== 'hàng khác') {
            const group = PRODUCT_GROUPS.find(g => normalize(g.label) === normalize(groupName));
            if (!group) throw new Error('Dòng ' + line + ': nhóm hàng chưa hợp lệ.');
            const draft = createPricingDraft(null, group.id);
            draft.retailPrice = String(price);
            draft.retailUnit = get('Đơn vị bán lẻ') || draft.retailUnit;
            draft.packSize = group.id === 'tobacco' ? get('Số gói/cây') : get('Số đơn vị/thùng');
            draft.bagsPerPack = get('Số bịch/thùng');
            draft.unitsPerBag = get('Số đơn vị/bịch');
            const readMoney = header => get(header) === '' ? '' : String(integer(get(header), header, line));
            draft.purchasePackPrice = readMoney(group.id === 'seeds' ? 'Giá nhập 1 kg' : group.id === 'tobacco' ? 'Giá nhập 1 cây' : 'Giá nhập 1 thùng');
            draft.purchaseBagPrice = readMoney('Giá nhập 1 bịch');
            draft.purchasePrice = readMoney('Giá nhập');
            draft.retailPackPrice = readMoney(group.id === 'tobacco' ? 'Giá bán 1 cây' : 'Giá bán 1 thùng');
            try { productTemplate = buildPricing(draft); } catch (e) { throw new Error('Dòng ' + line + ': ' + e.message); }
        }
        return { name, unit, price, quantity, productTemplate, category: columns.category < 0 ? '' : cells[columns.category], line };
    });
}
export function planStockImport(rows, products) {
    if (!rows.length || rows.length > 2000) throw new Error('Chọn file có từ 1 đến 2.000 mặt hàng.');
    const seen = new Set();
    return rows.map(row => {
        if (!row.name?.trim() || !units.includes(row.unit) || !Number.isSafeInteger(row.price) || row.price < 0 || row.price > 999999999 || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 999999) throw new Error('Thông tin nhập hàng chưa hợp lệ. Vui lòng chọn lại file.');
        const key = normalize(row.name);
        if (seen.has(key)) throw new Error('Mặt hàng “' + row.name + '” bị lặp. Hãy gộp thành một dòng.');
        seen.add(key);
        const existing = products.filter(p => normalize(p.name) === key);
        if (existing.length > 1) throw new Error('Có nhiều mặt hàng tên “' + row.name + '”. Hãy sửa tên để phân biệt trước khi nhập.');
        const product = existing[0];
        if (product && !product.isActive) throw new Error('“' + row.name + '” đã ngừng bán. Hãy bật bán lại trước khi nhập.');
        const template = product || row.productTemplate || { unit: row.unit, price: row.price };
        if (product && row.productTemplate) {
            const supplied = row.productTemplate;
            if (product.unit !== supplied.unit || product.pricing?.group !== supplied.pricing?.group || product.pricing?.unitsPerPack !== supplied.pricing?.unitsPerPack || product.pricing?.unitsPerBag !== supplied.pricing?.unitsPerBag) throw new Error('Quy cách “' + row.name + '” trong file khác trong kho. Hãy sửa thông tin mặt hàng trước khi nhập.');
        }
        const option = row.unit === template.unit ? { factor: 1 } : purchaseOptions(template).find(o => normalize(o.unit) === row.unit);
        if (!option) throw new Error('“' + row.name + '” chưa khai báo quy đổi từ ' + row.unit + ' sang ' + template.unit + '. Hãy sửa mặt hàng hoặc dùng đúng file mẫu.');
        const added = baseQuantity(row.quantity, option.factor);
        if (added <= 0) throw new Error('Số lượng nhập phải lớn hơn 0.');
        const before = product?.stock || 0;
        const after = before + added;
        if (!Number.isSafeInteger(after)) throw new Error('Số lượng “' + row.name + '” quá lớn.');
        return { ...row, productId: product?.id, before, after, baseAdded: added, stockUnit: template.unit, productTemplate: row.productTemplate, price: template.price, priceDifferent: !!product && product.price !== row.price };
    });
}

export function productCsvRows(products) {
    return [['Tên hàng', 'Giá bán', 'Còn lại', 'Đơn vị', 'Trạng thái', 'Loại hàng', 'Nhóm hàng', 'Đơn vị bán lẻ', 'Số đơn vị/thùng', 'Số bịch/thùng', 'Số đơn vị/bịch', 'Số gói/cây', 'Giá nhập 1 thùng', 'Giá nhập 1 bịch', 'Giá bán 1 thùng', 'Giá nhập', 'Giá nhập 1 kg', 'Giá nhập 1 cây', 'Giá bán 1 cây'], ...products.map(p => {
        const r = p.pricing || {};
        return [p.name, p.price, p.stock, p.unit, p.isActive ? 'Đang bán' : 'Ngừng bán', p.category || '', PRODUCT_GROUPS.find(g => g.id === r.group)?.label || '', p.unit, ['drinks', 'beer'].includes(r.group) ? r.unitsPerPack : '', r.bagsPerPack || '', r.unitsPerBag || '', r.group === 'tobacco' ? r.unitsPerPack : '', r.packUnit === 'thùng' ? r.purchasePackPrice : '', r.purchaseBagPrice ?? '', r.packUnit === 'thùng' ? r.retailPackPrice ?? '' : '', r.purchasePrice ?? '', r.group === 'seeds' ? r.purchasePackPrice : '', r.group === 'tobacco' ? r.purchasePackPrice : '', r.group === 'tobacco' ? r.retailPackPrice : ''];
    })];
}
export function stockCsvTemplate(group) {
    const headers = ['Tên hàng', 'Giá bán', 'Số lượng', 'Đơn vị', 'Nhóm hàng', 'Đơn vị bán lẻ'];
    const examples = {
        snacks: { extra: ['Số bịch/thùng', 'Số đơn vị/bịch', 'Giá nhập 1 thùng', 'Giá nhập 1 bịch'], data: ['Bánh quy bơ', 25000, 1, 'thùng', 'Bánh kẹo', 'bịch', 20, 1, 400000, 20000] },
        drinks: { extra: ['Số đơn vị/thùng', 'Giá nhập 1 thùng', 'Giá bán 1 thùng'], data: ['Nước ngọt mẫu', 10000, 1, 'thùng', 'Nước', 'lon', 24, 180000, 220000] },
        beer: { extra: ['Số đơn vị/thùng', 'Giá nhập 1 thùng', 'Giá bán 1 thùng'], data: ['Bia mẫu', 15000, 1, 'thùng', 'Bia', 'lon', 24, 280000, 320000] },
        spices: { extra: ['Giá nhập'], data: ['Nước mắm mẫu', 35000, 10, 'chai', 'Gia vị', 'chai', 28000] },
        seeds: { extra: ['Giá nhập 1 kg'], data: ['Hạt hướng dương', 15000, 2, 'kg', 'Hạt', 'lạng', 100000] },
        tobacco: { extra: ['Số gói/cây', 'Giá nhập 1 cây', 'Giá bán 1 cây'], data: ['Thuốc lá mẫu', 25000, 1, 'cây', 'Thuốc lá', 'gói', 10, 200000, 230000] },
    };
    const example = examples[group] || examples.snacks;
    return [[...headers, ...example.extra], example.data];
}
