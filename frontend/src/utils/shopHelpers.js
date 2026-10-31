export function csvCell(value) {
    const raw = String(value);
    // Keep imported names intact except when a spreadsheet may interpret the
    // cell as a formula. Quoting alone does not disable spreadsheet formulas.
    const dangerous = /^[\t\r\n]/u.test(raw)
        || /^[\s\uFEFF\u200B]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u.test(raw);
    return `"${(dangerous ? `'${raw}` : raw).replaceAll('"', '""')}"`;
}

export function exportCsv(filename, rows) {
    const text = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const normalizeSearch = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('đ', 'd');
export const matches = (text, query) => normalizeSearch(text).includes(normalizeSearch(query));
