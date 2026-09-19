import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, ShoppingCart, PackagePlus, BookOpen, Package } from 'lucide-react';
import { cn } from '../../utils/cn';
export const BottomNavigation = () => {
    const navItems = [
        { to: '/', icon: Home, label: 'Trang chủ' },
        { to: '/sales', icon: ShoppingCart, label: 'Bán hàng' },
        { to: '/import', icon: PackagePlus, label: 'Nhập hàng' },
        { to: '/debt', icon: BookOpen, label: 'Sổ nợ' },
        { to: '/inventory', icon: Package, label: 'Kho hàng' },
    ];
    return (<nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50">
      <div className="max-w-md mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => (<NavLink key={item.to} to={item.to} className={({ isActive }) => cn("flex flex-col items-center justify-center w-full h-full space-y-1 text-gray-500 active:bg-gray-50 transition-colors", isActive && "text-primary font-medium")}>
            <item.icon className="w-6 h-6"/>
            <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
          </NavLink>))}
      </div>
    </nav>);
};
