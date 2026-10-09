import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/home/HomePage';
import {
    SalesPage, CartPage, ImportPage, ImportExistingPage, ProductFormPage,
    InventoryPage, InventoryCountPage, DebtPage, CustomerPage, HistoryPage, CsvImportPage,
    CatalogImportPage, RevenuePage, LoginPage, AccountPage, CalculatorPage, ShopSettingsPage,
} from './routePages';
import { PageLoading, PageErrorBoundary } from './components/PageLoading';
import { AccountBootstrap, AuthenticatedGate, PublicOnlyGate, StoreGate } from './auth/AccountBootstrap';
import { ShopOperationGate } from './auth/ShopOperationGate';
import { StoreSetupPage } from './pages/StoreSetupPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LegacyMigrationPage } from './pages/LegacyMigrationPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { Empty } from './components/ui';
import { AdminAccessGate } from './admin/AdminAccessGate.jsx';
import { AdminLayout } from './admin/AdminLayout.jsx';
import { AdminMfaSetupPage, AdminMfaChallengePage } from './admin/pages/AdminMfaPages.jsx';
import {
    AdminDashboardPage, AdminShopsPage, AdminShopDetailPage,
    AdminUsersPage, AdminUserDetailPage, AdminAdminsPage,
    AdminSecurityPage, AdminAuditPage, AdminSystemPage, AdminSettingsPage,
} from './admin/adminRoutePages.js';
import { ToastProvider } from './components/feedback/Toast.jsx';

function App() {
    return <BrowserRouter><AccountBootstrap><PageErrorBoundary><Suspense fallback={<PageLoading/>}><ToastProvider><Routes>
        <Route path="login" element={<PublicOnlyGate><LoginPage/></PublicOnlyGate>}/>
        <Route path="reset-password" element={<ResetPasswordPage/>}/>
        <Route element={<AuthenticatedGate/>}>
            <Route path="admin" element={<AdminAccessGate/>}>
                <Route path="mfa/setup" element={<AdminMfaSetupPage/>}/>
                <Route path="mfa/challenge" element={<AdminMfaChallengePage/>}/>
                <Route element={<AdminLayout/>}>
                    <Route index element={<AdminDashboardPage/>}/>
                    <Route path="shops" element={<AdminShopsPage/>}/>
                    <Route path="shops/:id" element={<AdminShopDetailPage/>}/>
                    <Route path="users" element={<AdminUsersPage/>}/>
                    <Route path="users/:id" element={<AdminUserDetailPage/>}/>
                    <Route path="admins" element={<AdminAdminsPage/>}/>
                    <Route path="security" element={<AdminSecurityPage/>}/>
                    <Route path="audit-logs" element={<AdminAuditPage/>}/>
                    <Route path="system" element={<AdminSystemPage/>}/>
                    <Route path="settings" element={<AdminSettingsPage/>}/>
                </Route>
            </Route>
            <Route path="setup" element={<StoreSetupPage/>}/>
            <Route element={<StoreGate/>}>
              <Route path="/" element={<MainLayout/>}>
                <Route index element={<HomePage/>}/>
                <Route path="calculator" element={<CalculatorPage/>}/>
                <Route element={<ShopOperationGate operation="sell"/>}>
                    <Route path="sales" element={<SalesPage/>}/>
                    <Route path="cart" element={<CartPage/>}/>
                </Route>
                <Route element={<ShopOperationGate operation="receiveStock"/>}>
                    <Route path="import" element={<ImportPage/>}/>
                    <Route path="import/existing" element={<ImportExistingPage/>}/>
                </Route>
                <Route element={<ShopOperationGate operation="manageShop"/>}>
                    <Route path="import/catalog" element={<CatalogImportPage/>}/>
                    <Route path="import/csv" element={<CsvImportPage/>}/>
                    <Route path="import/new" element={<ProductFormPage/>}/>
                    <Route path="inventory/count" element={<InventoryCountPage/>}/>
                    <Route path="revenue" element={<RevenuePage/>}/>
                    <Route path="settings" element={<ShopSettingsPage/>}/>
                </Route>
                <Route path="inventory" element={<InventoryPage/>}/>
                <Route path="categories" element={<CategoriesPage/>}/>
                <Route path="suppliers" element={<SuppliersPage/>}/>
                <Route path="inventory/:id" element={<ProductFormPage/>}/>
                <Route element={<ShopOperationGate operation="manageDebt"/>}>
                    <Route path="debt" element={<DebtPage/>}/>
                    <Route path="debt/:id" element={<CustomerPage/>}/>
                </Route>
                <Route path="history" element={<HistoryPage/>}/>
                <Route path="account" element={<AccountPage/>}/>
                <Route path="account/migrate" element={<LegacyMigrationPage/>}/>
                <Route path="*" element={<Empty title="Trang này không còn ở đây" text="Về trang chủ để tiếp tục nhé."><Link className="button primary" to="/">Về trang chủ</Link></Empty>}/>
              </Route>
            </Route>
        </Route>
    </Routes></ToastProvider></Suspense></PageErrorBoundary></AccountBootstrap></BrowserRouter>;
}

export default App;
