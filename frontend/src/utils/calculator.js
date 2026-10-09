// Only the four basic operators; never evaluate user input as JavaScript.
export function calculate(expression) {
    if (typeof expression !== 'string' || expression.length > 100 || !/^-?\d+(?:\.\d*)?(?:[+*/-]\d+(?:\.\d*)?)*$/.test(expression)) {
        throw new Error('Nhập đủ số và phép tính rồi bấm dấu bằng nhé.');
    }
    const tokens = expression.match(/\d+(?:\.\d*)?|[+*/-]/g);
    let index = 0;
    let term = tokens[0] === '-' ? (index = 2, -Number(tokens[1])) : (index = 1, Number(tokens[0]));
    let sum = 0;
    while (index < tokens.length) {
        const operator = tokens[index++];
        const next = Number(tokens[index++]);
        if (operator === '*') term *= next;
        else if (operator === '/') {
            if (next === 0) throw new Error('Không thể chia cho 0. Hãy đổi số chia nhé.');
            term /= next;
        } else { sum += term; term = operator === '-' ? -next : next; }
    }
    const result = sum + term;
    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) throw new Error('Số quá lớn. Hãy chia thành phép tính nhỏ hơn.');
    return Number(result.toPrecision(15)).toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 15 });
}

export function enterCalculatorKey(expression, key, finished = false) {
    if (key === 'clear') return '';
    if (key === 'backspace') return expression.slice(0, -1);
    if (/^[+*/-]$/.test(key)) {
        if (!expression || expression === '-') return key === '-' ? '-' : '';
        return /[+*/-]$/.test(expression) ? expression.slice(0, -1) + key : expression + key;
    }
    let next = finished ? '' : expression;
    if (next.length >= 100) return next;
    const last = next.split(/[+*/-]/).at(-1);
    if (key === '.') return last.includes('.') ? next : next + (last ? '.' : '0.');
    if (/^\d$/.test(key)) return last === '0' ? next.slice(0, -1) + key : next + key;
    return next;
}

export function displayCalculation(value) {
    return value.replace(/\d+(?:\.\d*)?/g, number => {
        const [whole, fraction] = number.split('.');
        return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction === undefined ? '' : ',' + fraction);
    }).replaceAll('*', ' × ').replaceAll('/', ' ÷ ').replaceAll('+', ' + ').replaceAll('-', ' − ');
}
