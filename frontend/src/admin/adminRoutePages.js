import { lazy } from 'react';

const loadPages = () => import('./pages/AdminPages.jsx');
const loadMfaPages = () => import('./pages/AdminMfaPages.jsx');
const page = name => lazy(() => loadPages().then(module => ({ default: module[name] })));
const mfaPage = name => lazy(() => loadMfaPages().then(module => ({ default: module[name] })));

export const AdminDashboardPage = page('AdminDashboardPage');
export const AdminShopsPage = page('AdminShopsPage');
export const AdminShopDetailPage = page('AdminShopDetailPage');
export const AdminUsersPage = page('AdminUsersPage');
export const AdminUserDetailPage = page('AdminUserDetailPage');
export const AdminAdminsPage = page('AdminAdminsPage');
export const AdminSecurityPage = page('AdminSecurityPage');
export const AdminAuditPage = page('AdminAuditPage');
export const AdminSystemPage = page('AdminSystemPage');
export const AdminSettingsPage = page('AdminSettingsPage');
export const AdminMfaSetupPage = mfaPage('AdminMfaSetupPage');
export const AdminMfaChallengePage = mfaPage('AdminMfaChallengePage');
