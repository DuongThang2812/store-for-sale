import React from 'react';
export const QuantityStepper = ({ value, onChange, min = 0, max }) => {
    const handleDecrease = () => {
        if (value > min)
            onChange(value - 1);
    };
    const handleIncrease = () => {
        if (max === undefined || value < max)
            onChange(value + 1);
    };
    return (<div className="flex items-center space-x-4">
      <button type="button" onClick={handleDecrease} disabled={value <= min} className="w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-lg active:bg-gray-300 disabled:opacity-50 text-xl font-medium">
        -
      </button>
      <span className="text-lg font-medium min-w-[30px] text-center">{value}</span>
      <button type="button" onClick={handleIncrease} disabled={max !== undefined && value >= max} className="w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-lg active:bg-gray-300 disabled:opacity-50 text-xl font-medium">
        +
      </button>
    </div>);
};
