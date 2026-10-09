export function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    color = 'green',
    badge,
    action,
    className = '',
    onClick
}) {
    const Component = onClick ? 'button' : 'div';
    const isClickable = Boolean(onClick);

    return (
        <Component
            className={`panel metric-card metric-card-${color} ${isClickable ? 'is-clickable' : ''} ${className}`}
            onClick={onClick}
            type={onClick ? 'button' : undefined}
        >
            <div className="metric-card-top">
                {Icon && (
                    <span className={`metric-icon-wrap metric-icon-${color}`} aria-hidden="true">
                        <Icon size={22} strokeWidth={1.8} />
                    </span>
                )}
                <span className="metric-title">{title}</span>
                {badge && <span className="metric-badge">{badge}</span>}
            </div>
            <div className="metric-value-wrap">
                <span className="metric-value">{value ?? '—'}</span>
            </div>
            {(subtitle || action) && (
                <div className="metric-card-bottom">
                    {subtitle && <span className="metric-subtitle">{subtitle}</span>}
                    {action && <span className="metric-action">{action}</span>}
                </div>
            )}
        </Component>
    );
}
