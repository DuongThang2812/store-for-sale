import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBasket, PackagePlus, BookOpen, Package, Wallet, Users, ArrowUpRight, Sun, CalendarDays, CircleAlert, Lightbulb, ChevronRight } from 'lucide-react';
import { useActiveShopStore } from '../../stores/useActiveShopStore';
import { useAccountStore } from '../../stores/useAccountStore';
import { useOwnerDashboard } from '../../hooks/useOwnerDashboard.js';
import { OwnerDashboard } from './OwnerDashboard.jsx';
import { formatReportQuantity } from '../../utils/reportDisplay.js';
import { stockDescription } from '../../utils/productPricing.js';
import { ActivityList } from '../../components/ui';
import { summarizeRevenue } from '../../utils/revenue';
import { formatCurrency } from '../../utils/formatters';

const actions = [
    { to: '/sales', icon: ShoppingBasket, label: 'Bán hàng', text: 'Chọn hàng, tính tiền', color: 'green', number: '01' },
    { to: '/import', icon: PackagePlus, label: 'Nhập hàng', text: 'Thêm hàng vào tiệm', color: 'blue', number: '02' },
    { to: '/debt', icon: BookOpen, label: 'Sổ nợ', text: 'Ghi nợ, nhận tiền trả', color: 'orange', number: '03' },
    { to: '/inventory', icon: Package, label: 'Kho hàng', text: 'Xem hàng còn lại', color: 'purple', number: '04' },
];

export function HomePage() {
    const { products, customers, entries } = useActiveShopStore(useShallow(s => ({ products: s.products, customers: s.customers, entries: s.entries })));
    const store = useAccountStore(s => s.store);
    const dataMode = useAccountStore(s => s.dataMode);
    const dashboard = useOwnerDashboard(entries);
    const ownerCloud = dataMode === 'supabase' && store?.role === 'owner';
    const totals = dashboard.data?.report.totals;
    const today = new Date().toDateString();
    const localReceived = useMemo(() => summarizeRevenue(entries, 1, new Date(today)).totals.received, [entries, today]);
    const received = dataMode === 'supabase' ? totals?.received : localReceived;
    const localDebt = useMemo(() => customers.reduce((s, c) => s + c.totalDebt, 0), [customers]);
    const debt = ownerCloud ? totals?.currentDebt : localDebt;
    const lowStock = useMemo(() => products.filter(p => p.isActive && p.stock <= (p.lowStockThreshold ?? 5)), [products]);
    const lowStockItems = ownerCloud ? dashboard.data?.lowStockProducts ?? [] : lowStock;
    const lowStockCount = ownerCloud ? totals ? totals.lowStockCount + totals.outOfStockCount : '—' : lowStock.length;
    const debtCustomers = ownerCloud ? dashboard.data?.debtCustomerCount : customers.filter(c => c.totalDebt > 0).length;
    const activeCount = useMemo(() => products.filter(p => p.isActive).length, [products]);
    const isNewStore = products.length === 0 && entries.length === 0;
    const date = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    return (
        <div className="home-page">
            <div className="page-heading home-heading">
                <div>
                    <div className="eyebrow"><Sun size={18}/> MỘT NGÀY BUÔN BÁN THẬT VUI</div>
                    <h1>Chào bạn, hôm nay thế nào?</h1>
                    <p>Cùng chăm chút tiệm nhỏ của mình nhé.</p>
                </div>
                <div className="date-chip"><CalendarDays size={18}/>{date}</div>
            </div>

            <section className="stats-grid" aria-label="Tình hình cửa hàng">
                <div className="stat-card revenue">
                    <div className="stat-top">
                        <span className="stat-icon"><Wallet size={24}/></span>
                        <span>Hôm nay đã thu</span>
                        <span className="stat-badge">Hôm nay</span>
                    </div>
                    <div className="stat-value">{received === undefined || received === null ? '0 ₫' : formatCurrency(received)}</div>
                    <div className="stat-bottom">
                        <span>{dashboard.error || (dataMode === 'supabase' && store?.role !== 'owner' ? 'Chỉ chủ tiệm xem số tiền' : 'Bán hàng + trả nợ − hoàn tiền')}</span>
                        <Link to="/revenue" className="mini-circle" title="Xem báo cáo doanh thu"><ArrowUpRight size={19}/></Link>
                    </div>
                </div>

                <div className="stats-subgrid">
                    <Link to="/debt" className="stat-card debt-stat">
                        <div className="stat-top">
                            <span className="stat-icon"><Users size={22}/></span>
                            <span>Khách đang nợ</span>
                            <ArrowUpRight size={18}/>
                        </div>
                        <div className="stat-value">{debt === undefined ? '0 ₫' : formatCurrency(debt)}</div>
                        <div className="stat-bottom">
                            <span>{debtCustomers === undefined ? '0' : debtCustomers} khách còn tiền nợ</span>
                            <span className="text-link">Xem sổ nợ <ArrowRight size={15}/></span>
                        </div>
                    </Link>

                    <Link to="/inventory?filter=low" className="stat-card low-stock-stat">
                        <div className="stat-top">
                            <span className="stat-icon warning"><CircleAlert size={22}/></span>
                            <span>Cảnh báo tồn kho</span>
                            <ArrowUpRight size={18}/>
                        </div>
                        <div className="stat-value">{lowStockCount === undefined || lowStockCount === '—' ? 0 : lowStockCount}</div>
                        <div className="stat-bottom">
                            <span>Mặt hàng chạm ngưỡng tồn</span>
                            <span className="text-link">Kiểm tra kho <ArrowRight size={15}/></span>
                        </div>
                    </Link>

                    <Link to="/inventory" className="stat-card catalog-stat">
                        <div className="stat-top">
                            <span className="stat-icon info"><Package size={22}/></span>
                            <span>Mặt hàng kinh doanh</span>
                            <ArrowUpRight size={18}/>
                        </div>
                        <div className="stat-value">{activeCount}</div>
                        <div className="stat-bottom">
                            <span>Mặt hàng trong danh mục</span>
                            <span className="text-link">Xem danh sách <ArrowRight size={15}/></span>
                        </div>
                    </Link>
                </div>
            </section>

            {isNewStore && (
                <section className="onboarding-banner panel">
                    <div className="onboarding-header">
                        <span className="choice-icon green"><PackagePlus size={28}/></span>
                        <div>
                            <h2>Bắt đầu chăm chút tiệm của bạn</h2>
                            <p>Tiệm của bạn đã sẵn sàng. Hãy hoàn thành 3 bước dưới đây để đón lượt khách đầu tiên.</p>
                        </div>
                    </div>
                    <div className="onboarding-steps">
                        <Link to="/import" className="onboarding-step-card">
                            <span className="step-badge">1</span>
                            <div>
                                <strong>Nhập mặt hàng đầu tiên</strong>
                                <p>Khai báo giá bán, đơn vị và tồn kho ban đầu.</p>
                            </div>
                            <ArrowRight size={18}/>
                        </Link>
                        <Link to="/sales" className="onboarding-step-card">
                            <span className="step-badge">2</span>
                            <div>
                                <strong>Thử bán đơn hàng đầu tiên</strong>
                                <p>Chọn hàng, tính tiền và in/lưu hóa đơn tức thì.</p>
                            </div>
                            <ArrowRight size={18}/>
                        </Link>
                        <Link to="/debt" className="onboarding-step-card">
                            <span className="step-badge">3</span>
                            <div>
                                <strong>Quản lý sổ nợ khách quen</strong>
                                <p>Ghi nhớ chi tiết, minh bạch từng khoản nợ.</p>
                            </div>
                            <ArrowRight size={18}/>
                        </Link>
                    </div>
                </section>
            )}

            <section className="quick-section">
                <div className="section-heading">
                    <h2>Bạn muốn làm gì?</h2>
                    <span>Chạm một lần, bắt đầu ngay</span>
                </div>
                <div className="quick-grid">
                    {actions.map(a => (
                        <Link className={`quick-card ${a.color}`} to={a.to} key={a.to}>
                            <div className="quick-top">
                                <span className="quick-icon"><a.icon size={29} strokeWidth={1.7}/></span>
                                <ArrowUpRight className="quick-arrow" size={21}/>
                            </div>
                            <h3>{a.label}</h3>
                            <p>{a.text}</p>
                        </Link>
                    ))}
                </div>
            </section>

            {ownerCloud && <OwnerDashboard {...dashboard} businessType={store.businessType}/>}

            <div className="home-lower">
                <section className="panel recent-panel">
                    <div className="panel-heading">
                        <h2>Hoạt động gần đây</h2>
                        <Link className="text-link" to="/history">Xem tất cả <ArrowRight size={16}/></Link>
                    </div>
                    <ActivityList entries={entries.slice(0, 5)}/>
                </section>

                <div className="home-aside">
                    <section className="panel low-stock-panel">
                        <div className="panel-heading">
                            <h2><CircleAlert size={20}/> Hàng cần nhập thêm</h2>
                            <span className="count-badge">{lowStockCount}</span>
                        </div>
                        <p className="panel-description">Để khách ghé là luôn có hàng.</p>
                        <div className="low-stock-list">
                            {lowStockItems.length ? lowStockItems.slice(0, 3).map(p => (
                                <Link to={`/import/existing?product=${p.id}`} key={p.id}>
                                    <span className="small-product"><Package size={21}/></span>
                                    <span className="low-stock-name">
                                        <strong>{p.name}</strong>
                                        <span className={p.stock === 0 ? 'text-red' : 'text-amber'}>
                                            {p.stock === 0 ? 'Đã hết hàng' : `Chỉ còn ${ownerCloud ? formatReportQuantity(p.stock, p.baseUnit) : stockDescription(p)}`}
                                        </span>
                                    </span>
                                    <ChevronRight size={17}/>
                                </Link>
                            )) : (
                                <p className="panel-description">{ownerCloud && !dashboard.data ? 'Đang chờ số liệu kho.' : 'Hàng trong kho vẫn còn đủ.'}</p>
                            )}
                        </div>
                        <Link to="/inventory?filter=low" className="stock-link">Kiểm tra kho hàng <ArrowRight size={17}/></Link>
                    </section>

                    <div className="daily-tip">
                        <Lightbulb size={24}/>
                        <div>
                            <strong>Mách nhỏ cho bạn</strong>
                            <p>Nhập hàng ngay khi hàng về để số lượng trong kho luôn chính xác nhé.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="home-note">
                <span className="status-dot"/> {dataMode === 'supabase' ? 'Dữ liệu cửa hàng đang đọc từ Supabase DB.' : 'Bạn đang xem dữ liệu trên máy. Hãy sao lưu thường xuyên nhé!'}
            </div>
        </div>
    );
}
