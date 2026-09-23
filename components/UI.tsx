import React, { useState, useRef, useEffect } from 'react';
import { TaskPriority, TaskStatus, RecurringType } from '../types';

// --- Badges (Pill Shape, Warm Colors) ---
export const StatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const styles = {
    [TaskStatus.PENDING]: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    [TaskStatus.IN_PROGRESS]: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
    [TaskStatus.COMPLETED]: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    [TaskStatus.CANCELLED]: 'bg-gray-200 text-gray-600 ring-1 ring-gray-300',
    [TaskStatus.OVERDUE]: 'bg-red-600 text-white ring-1 ring-red-700 shadow-sm',
  };

  // Override for strictly Red/Yellow theme request
  const themeStyles = {
    [TaskStatus.PENDING]: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
    [TaskStatus.IN_PROGRESS]: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-400',
    [TaskStatus.COMPLETED]: 'bg-green-100 text-green-800 ring-1 ring-green-300',
    [TaskStatus.CANCELLED]: 'bg-stone-200 text-stone-500 ring-1 ring-stone-300',
    [TaskStatus.OVERDUE]: 'bg-red-700 text-white ring-1 ring-red-800 font-extrabold tracking-wider',
  };
  
  const labels = {
    [TaskStatus.PENDING]: 'Chờ xử lý',
    [TaskStatus.IN_PROGRESS]: 'Đang thực hiện',
    [TaskStatus.COMPLETED]: 'Hoàn thành',
    [TaskStatus.CANCELLED]: 'Đã hủy',
    [TaskStatus.OVERDUE]: 'ĐÃ QUÁ HẠN',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${themeStyles[status]}`}>
      {labels[status]}
    </span>
  );
};

export const RecurringBadge: React.FC<{ type?: RecurringType[] | RecurringType }> = ({ type }) => {
  // Normalize input to array to prevent crashes with legacy string data
  let types: RecurringType[] = [];
  if (Array.isArray(type)) {
    types = type;
  } else if (typeof type === 'string') {
    types = [type as RecurringType];
  }

  if (!types || types.length === 0 || (types.length === 1 && types[0] === RecurringType.NONE)) return null;
  
  const labels: Record<string, string> = {
    [RecurringType.WEEKLY]: 'Hàng tuần',
    [RecurringType.MONTHLY]: 'Hàng tháng',
    [RecurringType.QUARTERLY]: 'Hàng quý',
    [RecurringType.ANNUALLY]: 'Hàng năm',
    [RecurringType.NONE]: '',
  };

  const text = types
    .filter(t => t !== RecurringType.NONE && labels[t]) // Ensure label exists
    .map(t => labels[t])
    .join(', ');

  if (!text) return null;

  return (
    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 ring-1 ring-amber-200 max-w-[150px] truncate" title={`Lặp lại: ${text}`}>
      <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      {text}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const styles = {
    [TaskPriority.LOW]: 'text-stone-500 bg-stone-100',
    [TaskPriority.MEDIUM]: 'text-amber-700 bg-amber-50',
    [TaskPriority.HIGH]: 'text-orange-700 bg-orange-50 font-bold',
    [TaskPriority.URGENT]: 'text-red-700 bg-red-100 font-extrabold border border-red-200',
  };
  
  const labels = {
    [TaskPriority.LOW]: 'Thấp',
    [TaskPriority.MEDIUM]: 'Trung bình',
    [TaskPriority.HIGH]: 'Cao',
    [TaskPriority.URGENT]: 'Hỏa tốc',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${styles[priority]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70"></span>
      {labels[priority]}
    </span>
  );
};

// --- Buttons (Red/Gold Theme) ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', size = 'md', className = '', isLoading, icon, ...props 
}) => {
  const baseStyle = "inline-flex items-center justify-center rounded-xl font-bold uppercase tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variants = {
    // Primary: Strong Red (Police Theme)
    primary: "bg-red-800 text-white hover:bg-red-900 shadow-lg shadow-red-900/20 hover:shadow-xl hover:-translate-y-0.5 focus:ring-red-800 border-b-2 border-red-950",
    secondary: "bg-white text-red-900 border border-red-200 hover:bg-red-50 hover:border-red-300 shadow-sm focus:ring-red-200",
    outline: "border-2 border-red-800 text-red-800 hover:bg-red-50",
    danger: "bg-orange-600 text-white hover:bg-orange-700 shadow-lg shadow-orange-600/20 focus:ring-orange-500",
    ghost: "bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    success: "bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-600/20 focus:ring-green-500",
  };

  return (
    <button className={`${baseStyle} ${sizes[size as keyof typeof sizes] || sizes.md} ${variants[variant]} ${className}`} disabled={isLoading} {...props}>
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : icon ? (
        <span className="mr-2 -ml-1">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

// --- Input (Warm Focus Rings) ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-bold text-red-950 mb-1.5">{label}</label>}
      <div className="relative">
         {props.type === 'search' && (
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
           </div>
         )}
         <input
          className={`w-full px-4 py-2.5 border rounded-xl bg-white text-stone-800 placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-stone-200'} ${props.type === 'search' ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-bold text-red-950 mb-1.5">{label}</label>}
      <div className="relative">
        <select
          className={`w-full appearance-none px-4 py-2.5 border border-stone-200 rounded-xl bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all cursor-pointer ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-stone-500">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
    </div>
  );
};

// --- MultiSelect (Updated with Search) ---
interface MultiSelectProps {
  label?: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selectedValues, onChange, disabled, className = '', placeholder = "Chọn cán bộ..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (value: string) => {
    if (disabled) return;
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
    setSearchTerm(''); // Clear search after selection
    inputRef.current?.focus(); // Keep focus
  };

  const removeValue = (e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(selectedValues.filter(v => v !== value));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && searchTerm === '' && selectedValues.length > 0) {
      onChange(selectedValues.slice(0, -1));
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full" ref={containerRef}>
      {label && <label className="block text-sm font-bold text-red-950 mb-1.5">{label}</label>}
      <div 
        className={`relative min-h-[44px] w-full px-2 py-1.5 border rounded-xl bg-white text-stone-800 transition-all cursor-text ${disabled ? 'opacity-60 cursor-not-allowed bg-stone-50' : 'hover:border-amber-400'} ${isOpen ? 'ring-2 ring-amber-500/30 border-amber-500' : 'border-stone-200'} ${className}`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        <div className="flex flex-wrap gap-1.5 pr-6">
          {selectedValues.map(val => {
            const opt = options.find(o => o.value === val);
            return (
              <span key={val} className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-100 animate-fade-in">
                {opt?.label}
                <button 
                  onClick={(e) => removeValue(e, val)}
                  className="ml-1.5 text-amber-600 hover:text-red-600 rounded-full focus:outline-none"
                  type="button"
                >
                  ✕
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => !disabled && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedValues.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-1 placeholder-stone-400"
            disabled={disabled}
          />
        </div>
        
        <div className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 pointer-events-none">
           <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>

        {isOpen && !disabled && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-stone-100 z-[60] overflow-hidden animate-fade-in-up max-h-60 overflow-y-auto">
             {filteredOptions.length === 0 ? (
                 <div className="px-4 py-3 text-sm text-stone-500 text-center italic">
                     Không tìm thấy kết quả phù hợp.
                 </div>
             ) : (
                 filteredOptions.map(opt => {
                     const isSelected = selectedValues.includes(opt.value);
                     return (
                         <button 
                             type="button"
                             key={opt.value} 
                             onMouseDown={(e) => { 
                                 e.preventDefault(); // Prevent input blur
                                 e.stopPropagation(); 
                                 handleSelect(opt.value); 
                             }}
                             className={`w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:bg-amber-50 transition-colors flex items-center justify-between ${isSelected ? 'bg-amber-50/50 text-amber-900 font-bold' : 'text-stone-700'}`}
                         >
                             <span>{opt.label}</span>
                             {isSelected && <span className="text-amber-600 font-bold">✓</span>}
                         </button>
                     );
                 })
             )}
          </div>
        )}
      </div>
    </div>
  );
};
