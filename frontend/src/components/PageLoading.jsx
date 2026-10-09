import { Component } from 'react';

export function PageLoading() {
    return (
        <div className="page-loading" role="status" aria-label="Đang mở trang">
            <div className="skeleton loading-title" aria-hidden="true"/>
            <div className="skeleton loading-description" aria-hidden="true"/>
            <div className="loading-panels" aria-hidden="true">
                <div className="loading-grid">{[0, 1, 2, 3].map(key => <div className="skeleton loading-card" key={key}/>)}</div>
                <div className="skeleton loading-aside"/>
            </div>
            <span>Đang mở trang…</span>
        </div>
    );
}

export class PageErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) return <div className="panel page-load-error" role="alert"><h2>Chưa mở được trang</h2><p>Thử tải lại khi kết nối đã ổn định.</p><button type="button" className="button primary" onClick={() => window.location.reload()}>Tải lại trang</button></div>;
        return this.props.children;
    }
}
