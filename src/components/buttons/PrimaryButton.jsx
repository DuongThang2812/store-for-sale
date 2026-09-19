import React from 'react';
import { cn } from '../../utils/cn';
export const PrimaryButton = ({ className, fullWidth, children, ...props }) => {
    return (<button className={cn("bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl h-[52px] px-6 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm", fullWidth && "w-full", className)} {...props}>
      {children}
    </button>);
};
