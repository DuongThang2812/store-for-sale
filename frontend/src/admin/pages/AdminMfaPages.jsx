import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase.js';

function CodeForm({ title, description, onVerify, busy, error }) {
    const [code, setCode] = useState('');
    return <form className="admin-mfa-card panel" onSubmit={async event => {
        event.preventDefault();
        if (/^\d{6}$/.test(code)) await onVerify(code);
    }}><h1>{title}</h1><p>{description}</p><label className="field">Mã 6 số từ ứng dụng xác thực<input
        inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}"
        value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}/></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy || code.length !== 6}>
            {busy ? 'Đang kiểm tra…' : 'Xác thực và vào quản trị'}</button>
        <Link to="/" className="text-link">Về cửa hàng</Link>
    </form>;
}

export function AdminMfaSetupPage() {
    const navigate = useNavigate();
    const enrollment = useRef(null);
    const [factor, setFactor] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        if (!enrollment.current) {
            enrollment.current = getSupabaseClient().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BIN Admin' });
        }
        enrollment.current.then(({ data, error: failure }) => {
                if (!live) return;
                if (failure) setError('Chưa tạo được mã xác thực. Vui lòng tải lại trang.');
                else setFactor(data);
            });
        return () => { live = false; };
    }, []);
    async function verify(code) {
        setBusy(true); setError('');
        try {
            const { error: failure } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
            if (failure) throw failure;
            navigate('/admin', { replace: true });
        } catch { setError('Mã chưa đúng hoặc đã hết hạn. Hãy thử mã mới.'); }
        finally { setBusy(false); }
    }
    return <div className="admin-mfa-page"><div className="admin-mfa-card panel">
        <h1>Thiết lập xác thực hai bước</h1><p>Quét mã bằng ứng dụng xác thực trên điện thoại. Cổng quản trị chỉ mở sau khi bạn nhập đúng mã.</p>
        {factor?.totp?.qr_code && <img className="admin-mfa-qr" src={factor.totp.qr_code} alt="Mã QR thiết lập xác thực hai bước"/>}
        {factor?.totp?.secret && <p className="admin-mfa-secret">Không quét được? Nhập mã này trong ứng dụng: <code>{factor.totp.secret}</code></p>}
        {!factor && !error && <p role="status">Đang tạo mã QR…</p>}
        {factor && <CodeForm title="Xác nhận thiết lập" description="Nhập mã đang hiện trong ứng dụng xác thực." onVerify={verify} busy={busy} error={error}/>}
        {!factor && error && <p className="error" role="alert">{error}</p>}
    </div></div>;
}

export function AdminMfaChallengePage() {
    const navigate = useNavigate();
    const [factorId, setFactorId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let live = true;
        getSupabaseClient().auth.mfa.listFactors().then(({ data, error: failure }) => {
            if (!live) return;
            if (failure || !data?.totp?.length) setError('Không tìm thấy thiết bị xác thực. Vui lòng đăng nhập lại.');
            else setFactorId(data.totp[0].id);
        });
        return () => { live = false; };
    }, []);
    async function verify(code) {
        if (!factorId) return;
        setBusy(true); setError('');
        try {
            const { error: failure } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code });
            if (failure) throw failure;
            navigate('/admin', { replace: true });
        } catch { setError('Mã chưa đúng hoặc đã hết hạn. Hãy thử mã mới.'); }
        finally { setBusy(false); }
    }
    return <div className="admin-mfa-page"><CodeForm title="Xác thực quản trị viên"
        description="Nhập mã 6 số từ ứng dụng xác thực để tiếp tục."
        onVerify={verify} busy={busy || !factorId} error={error}/></div>;
}
