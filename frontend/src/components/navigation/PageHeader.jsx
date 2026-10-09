import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeader({
    title,
    description,
    action,
    back,
    breadcrumbs,
    badge,
    className = ''
}) {
    return (
        <header className={`page-header ${className}`}>
            <div className="page-header-main">
                {breadcrumbs && (
                    <nav className="page-breadcrumbs" aria-label="Đường dẫn trang">
                        {breadcrumbs.map((crumb, idx) => (
                            <span key={idx} className="breadcrumb-crumb">
                                {crumb.to ? (
                                    <Link to={crumb.to}>{crumb.label}</Link>
                                ) : (
                                    <span>{crumb.label}</span>
                                )}
                                {idx < breadcrumbs.length - 1 && <span className="breadcrumb-separator">/</span>}
                            </span>
                        ))}
                    </nav>
                )}
                {back && (
                    <Link className="back-link" to={back}>
                        <ArrowLeft size={16} /> Quay lại
                    </Link>
                )}
                <div className="page-header-title-row">
                    <h1>{title}</h1>
                    {badge && <span className="page-header-badge">{badge}</span>}
                </div>
                {description && <p className="page-header-description">{description}</p>}
            </div>
            {action && <div className="page-header-actions">{action}</div>}
        </header>
    );
}
