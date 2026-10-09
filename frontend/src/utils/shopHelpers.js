export function exportCsv(filename, rows) {
    const text = '\uFEFF' + rows.map(row => row.map(v => `"${String(v).replace(/^[-=+@]/, "'$&").replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const normalizeSearch = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('đ', 'd');
export const matches = (text, query) => normalizeSearch(text).includes(normalizeSearch(query));
