import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calculator, Delete, History, RotateCcw, Trash2 } from 'lucide-react';
import { Confirm, PageHeading } from '../components/ui';
import { useAccountStore } from '../stores/useAccountStore';
import { calculate, displayCalculation, enterCalculatorKey } from '../utils/calculator';
import './calculator.css';

function CalculatorLine({ as: Tag = 'div', children, className, ...props }) {
    const containerRef = useRef(null);
    const textRef = useRef(null);

    const fitText = useCallback(() => {
        const container = containerRef.current;
        const text = textRef.current;
        const available = container.clientWidth - 1;
        if (available <= 0) return;
        const base = parseFloat(getComputedStyle(container).fontSize);
        text.style.fontSize = `${base}px`;
        const width = text.getBoundingClientRect().width;
        if (width <= available) return;
        // Proportional sizing needs at most one correction for font rounding.
        const size = base * available / width;
        text.style.fontSize = `${size}px`;
        const fitted = text.getBoundingClientRect().width;
        if (fitted > available) text.style.fontSize = `${size * available / fitted}px`;
    }, []);

    useLayoutEffect(() => { fitText(); }, [children, fitText]);
    useLayoutEffect(() => {
        let frame;
        let width = containerRef.current.clientWidth;
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitText); };
        const observer = new ResizeObserver(() => {
            const nextWidth = containerRef.current.clientWidth;
            if (nextWidth !== width) { width = nextWidth; schedule(); }
        });
        observer.observe(containerRef.current);
        document.fonts.addEventListener('loadingdone', schedule);
        return () => { observer.disconnect(); cancelAnimationFrame(frame); document.fonts.removeEventListener('loadingdone', schedule); };
    }, [fitText]);

    return <Tag {...props} ref={containerRef} className={`calculator-fit-line ${className}`}><span ref={textRef}>{children}</span></Tag>;
}

const keys = [
    ['clear', 'C', 'Xóa phép tính', 'clear'], ['backspace', '⌫', 'Xóa một số', 'utility'], ['/', '÷', 'Chia', 'operator'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['*', '×', 'Nhân', 'operator'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['-', '−', 'Trừ', 'operator'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'Cộng', 'operator'],
    ['0', '0', 'Số không', 'zero'], ['.', ',', 'Dấu thập phân'], ['=', '=', 'Tính kết quả', 'equals'],
];

function readHistory(key) {
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(saved)) return [];
        return saved.filter(row => row && typeof row.id === 'string' && typeof row.expression === 'string' && row.expression.length <= 100 && typeof row.result === 'string' && row.result.length <= 100 && Number.isFinite(Number(row.result)) && Number.isFinite(Date.parse(row.date))).slice(0, 100);
    } catch { return []; }
}

export function CalculatorPage() {
    const profileId = useAccountStore(s => s.profile?.id || 'demo');
    return <CalculatorWorkspace key={profileId} storageKey={`little-store-calculator:${profileId}`}/>;
}

const historyDateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const CalculatorHistory = memo(function CalculatorHistory({ history, onRecall }) {
    return <ol className="calculator-history-list">{history.map(row => <li key={row.id}><button type="button" onClick={() => onRecall(row)} aria-label={`Dùng lại kết quả ${displayCalculation(row.result)}`}><span className="calculator-history-meta"><time dateTime={row.date}>{historyDateFormatter.format(new Date(row.date))}</time><span><RotateCcw size={13}/> Dùng lại</span></span><span className="calculator-history-expression">{displayCalculation(row.expression)} =</span><strong>{displayCalculation(row.result)}</strong></button></li>)}</ol>;
});

function CalculatorWorkspace({ storageKey }) {
    const [expression, setExpression] = useState('');
    const [lastExpression, setLastExpression] = useState('');
    const [finished, setFinished] = useState(false);
    const [error, setError] = useState('');
    const [storageError, setStorageError] = useState('');
    const [history, setHistory] = useState(() => readHistory(storageKey));
    const [confirmClear, setConfirmClear] = useState(false);

    const recall = useCallback(row => { setExpression(row.result); setLastExpression(row.expression); setFinished(true); setError(''); }, []);

    function saveHistory(next) {
        setHistory(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError(''); }
        catch { setStorageError('Chưa lưu được lịch sử trên máy. Các phép tính mới chỉ giữ trong trang đang mở.'); }
    }

    function press(key) {
        setError('');
        if (key === '=') {
            if (!expression || finished) return;
            try {
                const result = calculate(expression);
                saveHistory([{ id: crypto.randomUUID(), expression, result, date: new Date().toISOString() }, ...history].slice(0, 100));
                setLastExpression(expression); setExpression(result); setFinished(true);
            } catch (e) { setError(e.message); }
            return;
        }
        setExpression(enterCalculatorKey(expression, key, finished));
        setFinished(false); setLastExpression('');
    }

    const keyboardHandler = useRef(null);
    useLayoutEffect(() => {
        keyboardHandler.current = event => {
            if (confirmClear || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
            const key = event.key === 'Enter' || event.key === '=' ? '=' : event.key === 'Backspace' ? 'backspace' : event.key === 'Escape' || event.key === 'Delete' ? 'clear' : event.key === ',' ? '.' : event.key;
            // Keep normal Enter activation on history and navigation buttons.
            if (event.key === 'Enter' && event.target.closest('button, a') && !event.target.closest('.calculator-keypad')) return;
            if (['=', 'backspace', 'clear', '.'].includes(key) || /^[0-9+*/-]$/.test(key)) { event.preventDefault(); press(key); }
        };
    });
    useEffect(() => {
        const onKeyDown = event => keyboardHandler.current(event);
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return <>
        <PageHeading title="Máy tính" description="Cộng, trừ, nhân, chia nhanh. Có lịch sử để xem lại khi cần."/>
        <div className="calculator-layout">
            <section className="panel calculator-machine" aria-label="Máy tính cơ bản">
                <div className="calculator-label"><Calculator size={20}/><span>TÍNH NHANH MỖI NGÀY</span><span className="calculator-ready"/></div>
                <div className="calculator-screen" aria-live="polite" aria-atomic="true">
                    <CalculatorLine className="calculator-previous">{finished ? `${displayCalculation(lastExpression)} =` : 'Nhập số và chọn phép tính'}</CalculatorLine>
                    <CalculatorLine as="output" className="calculator-value" aria-label={finished ? 'Kết quả' : 'Phép tính'}>{displayCalculation(expression || '0')}</CalculatorLine>
                    <span className="calculator-screen-note">{finished ? 'Kết quả' : 'Sẵn sàng tính'}</span>
                </div>
                {error && <p className="calculator-error" role="alert">{error}</p>}
                <div className="calculator-keypad">{keys.map(([key, label, ariaLabel, style]) => <button type="button" key={key} className={`calculator-key ${style || ''}`} aria-label={ariaLabel || label} onClick={() => press(key)}>{key === 'backspace' ? <Delete size={25}/> : label}</button>)}</div>
                <p className="calculator-keyboard-hint">Dùng bàn phím cũng được: <b>Enter</b> để tính, <b>Esc</b> để xóa.</p>
            </section>
            <section className="panel calculator-history" aria-labelledby="calculator-history-title">
                <div className="calculator-history-heading"><div><h2 id="calculator-history-title"><History size={22}/> Lịch sử tính</h2><p>{history.length ? `${history.length} phép tính gần nhất` : 'Các phép tính sẽ được lưu ở đây'}</p></div><button type="button" className="icon-button" title="Xóa lịch sử tính" aria-label="Xóa lịch sử tính" disabled={!history.length} onClick={() => setConfirmClear(true)}><Trash2 size={20}/></button></div>
                {storageError && <p className="calculator-error" role="alert">{storageError}</p>}
                {history.length ? <CalculatorHistory history={history} onRecall={recall}/> : <div className="calculator-history-empty"><History size={36}/><h3>Chưa có phép tính nào</h3><p>Thử nhập <b>25 + 15</b> rồi bấm <b>=</b>.<br/>Kết quả sẽ xuất hiện tại đây.</p></div>}
                <p className="calculator-history-footnote">Giữ 100 phép tính gần nhất trên trình duyệt này. Bấm một kết quả để tính tiếp.</p>
            </section>
        </div>
        <p className="calculator-tip">Nhân, chia được tính trước cộng, trừ. Máy tính dùng riêng, không thay đổi tiền bán hàng hay công nợ.</p>
        {confirmClear && <Confirm danger title="Xóa lịch sử tính?" label="Xóa lịch sử" onClose={() => setConfirmClear(false)} onConfirm={() => { saveHistory([]); setConfirmClear(false); }}><p>Xóa {history.length} phép tính đã lưu? Phép tính đang nhập vẫn được giữ.</p></Confirm>}
    </>;
}
