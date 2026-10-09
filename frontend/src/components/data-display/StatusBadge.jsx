import { Check, AlertTriangle, XCircle, Archive, Shield, Store, Apple } from 'lucide-react';

const STATUS_CONFIG = {
    active: { label: 'Đang hoạt động', className: 'status-badge-active', icon: Check },
    suspended: { label: 'Tạm khóa', className: 'status-badge-warning', icon: AlertTriangle },
    disabled: { label: 'Vô hiệu hóa', className: 'status-badge-danger', icon: XCircle },
    archived: { label: 'Đã lưu trữ', className: 'status-badge-neutral', icon: Archive },
    low: { label: 'Sắp hết hàng', className: 'status-badge-warning', icon: AlertTriangle },
    out: { label: 'Hết hàng', className: 'status-badge-danger', icon: XCircle },
    inactive: { label: 'Ngừng bán', className: 'status-badge-neutral', icon: Archive },
    owner: { label: 'Chủ cửa hàng', className: 'status-badge-primary', icon: Store },
    staff: { label: 'Nhân viên', className: 'status-badge-info', icon: Store },
    platform_admin: { label: 'Quản trị hệ thống', className: 'status-badge-danger', icon: Shield },
    grocery: { label: 'Tạp hóa', className: 'status-badge-primary', icon: Store },
    fruit_shop: { label: 'Cửa hàng trái cây', className: 'status-badge-primary', icon: Apple }
};

export function StatusBadge({ status, label, showIcon = true, className = '' }) {
    const config = STATUS_CONFIG[status] || {
        label: label || status,
        className: 'status-badge-neutral',
        icon: null
    };

    const displayText = label || config.label;
    const Icon = config.icon;

    return (
        <span className={`status-badge ${config.className} ${className}`}>
            {showIcon && Icon && <Icon size={13} className="status-badge-icon" aria-hidden="true" />}
            <span className="status-badge-text">{displayText}</span>
        </span>
    );
}
