import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/home/HomePage';
import { SalesPage, CartPage } from './pages/SalesPages';
import { ImportPage, ImportExistingPage, ProductFormPage, InventoryPage } from './pages/StockPages';
import { DebtPage, CustomerPage, HistoryPage } from './pages/DebtPages';
import { CsvImportPage } from './pages/CsvImportPage';
import { RevenuePage } from './pages/RevenuePage';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';
import { CalculatorPage } from './pages/CalculatorPage';
import { AccountBootstrap, DemoAccountGate } from './auth/AccountBootstrap';
import { Empty } from './components/ui';
function App() {
    return <BrowserRouter><AccountBootstrap><Routes><Route path="login" element={<LoginPage />}/><Route element={<DemoAccountGate/>}><Route path="/" element={<MainLayout />}><Route index element={<HomePage />}/><Route path="calculator" element={<CalculatorPage />}/><Route path="sales" element={<SalesPage />}/><Route path="cart" element={<CartPage />}/><Route path="import" element={<ImportPage />}/><Route path="import/existing" element={<ImportExistingPage />}/><Route path="import/csv" element={<CsvImportPage />}/><Route path="account" element={<AccountPage/>}/><Route path="revenue" element={<RevenuePage />}/><Route path="import/new" element={<ProductFormPage />}/><Route path="inventory" element={<InventoryPage />}/><Route path="inventory/:id" element={<ProductFormPage />}/><Route path="debt" element={<DebtPage />}/><Route path="debt/:id" element={<CustomerPage />}/><Route path="history" element={<HistoryPage />}/><Route path="*" element={<Empty title="Trang này không còn ở đây" text="Về trang chủ để tiếp tục nhé."><Link className="button primary" to="/">Về trang chủ</Link></Empty>}/></Route></Route></Routes></AccountBootstrap></BrowserRouter>;
}
export default App;
