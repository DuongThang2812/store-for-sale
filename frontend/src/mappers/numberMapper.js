/** Existing UI uses Number. Reject unsafe bigint values instead of rounding money. */
export function toSafeInteger(value, label = 'Giá trị', { min = 0 } = {}) {
    if (!['number', 'string', 'bigint'].includes(typeof value) || (typeof value === 'string' && !/^-?\d+$/.test(value))) {
        throw new Error(`${label} phải là số nguyên.`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min) throw new Error(`${label} vượt phạm vi số nguyên an toàn của giao diện.`);
    return number;
}

export const nullableMoney = (value, label) => value == null ? null : toSafeInteger(value, label);
