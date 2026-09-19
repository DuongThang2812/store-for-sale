import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../utils/cn';
export const SearchInput = ({ className, ...props }) => {
    return (<div className={cn("relative flex items-center w-full", className)}>
      <Search className="absolute left-3 text-gray-400 w-5 h-5"/>
      <input type="text" className="w-full h-12 pl-10 pr-4 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-[16px]" {...props}/>
    </div>);
};
