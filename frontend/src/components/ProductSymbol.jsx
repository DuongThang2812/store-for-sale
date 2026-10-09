import { Package, Milk, Coffee, Cookie, Droplets, Beer, Wheat, Boxes } from 'lucide-react';

const icons = { 'Đồ uống': Coffee, 'Nước': Coffee, 'Bia': Beer, 'Hạt': Wheat, 'Thuốc lá': Boxes, 'Sữa & bánh': Milk, 'Bánh kẹo': Cookie, 'Đồ ăn': Cookie, 'Gia vị': Droplets };
export function ProductSymbol({ category }) {
    const Icon = icons[category] || Package;
    return <span className={`product-symbol ${['Nước', 'Đồ uống'].includes(category) ? 'blue' : category === 'Sữa & bánh' ? 'purple' : ['Gia vị', 'Bia'].includes(category) ? 'orange' : 'green'}`}><Icon size={29} strokeWidth={1.6}/></span>;
}
