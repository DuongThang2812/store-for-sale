import React from 'react';
import { formatCurrency } from '../../utils/formatters';
export const ProductCard = ({ product, onAdd }) => {
    return (<div className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between border border-gray-100">
      <div className="flex-1">
        <h3 className="text-lg font-medium text-gray-900">{product.name}</h3>
        <p className="text-gray-500 mt-1">
          {formatCurrency(product.price)} <span className="text-sm mx-2">•</span> 
          <span className={product.stock <= 0 ? "text-danger font-medium" : product.stock < 10 ? "text-warning font-medium" : ""}>
            {product.stock > 0 ? `Còn ${product.stock} ${product.unit}` : 'Hết hàng'}
          </span>
        </p>
      </div>
      <button onClick={() => onAdd(product)} disabled={product.stock <= 0} className="ml-4 px-4 py-2 bg-primary/10 text-primary font-medium rounded-lg active:bg-primary/20 disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400">
        THÊM
      </button>
    </div>);
};
