import React, { useState, useRef, useEffect } from 'react';
import { TaskPriority, TaskStatus, RecurringType } from '../types';
import { Check, X } from 'lucide-react';

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
    [TaskStatus.PENDING]: 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200',
    [TaskStatus.IN_PROGRESS]: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    [TaskStatus.COMPLETED]: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
    [TaskStatus.CANCELLED]: 'bg-stone-100 text-stone-500 ring-1 ring-inset ring-stone-200',
    [TaskStatus.OVERDUE]: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  };
  
  const labels = {
    [TaskStatus.PENDING]: 'Chờ xử lý',
    [TaskStatus.IN_PROGRESS]: 'Đang thực hiện',
    [TaskStatus.COMPLETED]: 'Hoàn thành',
    [TaskStatus.CANCELLED]: 'Đã hủy',
    [TaskStatus.OVERDUE]: 'Quá hạn',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${themeStyles[status]}`}>
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
    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 text-stone-600 ring-1 ring-stone-200 max-w-[150px] truncate" title={`Lặp lại: ${text}`}>
      <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      {text}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const styles = {
    [TaskPriority.LOW]: 'text-stone-500 bg-stone-100',
    [TaskPriority.MEDIUM]: 'text-amber-700 bg-amber-50',
    [TaskPriority.HIGH]: 'text-orange-700 bg-orange-100/60 font-medium',
    [TaskPriority.URGENT]: 'text-red-700 bg-red-50 font-semibold ring-1 ring-inset ring-red-200',
  };
  
  const labels = {
    [TaskPriority.LOW]: 'Thấp',
    [TaskPriority.MEDIUM]: 'Trung bình',
    [TaskPriority.HIGH]: 'Cao',
    [TaskPriority.URGENT]: 'Hỏa tốc',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs ${styles[priority]}`}>
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
  const baseStyle = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizes = {
    sm: "px-3 h-8 text-xs",
    md: "px-4 h-10 text-sm",
    lg: "px-5 h-11 text-[15px]",
  };

  const variants = {
    // Primary: Strong Red (Police Theme)
    primary: "bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-600",
    secondary: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 focus-visible:ring-stone-300",
    outline: "border border-brand-700 text-brand-700 hover:bg-brand-50",
    danger: "bg-white text-brand-700 border border-stone-300 hover:bg-brand-50 hover:border-brand-600 focus-visible:ring-brand-600",
    ghost: "bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    success: "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600",
  };

  return (
    <button className={`${baseStyle} ${sizes[size as keyof typeof sizes] || sizes.md} ${variants[variant]} ${className}`} disabled={isLoading} {...props}>
      {isLoading ? (
        <svg className="animate-spin -ml-0.5 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : icon ? (
        <span className="-ml-0.5 inline-flex">{icon}</span>
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
      {label && <label className="block text-[13px] font-medium text-stone-700 mb-1.5">{label}</label>}
      <div className="relative">
         {props.type === 'search' && (
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
           </div>
         )}
         <input
          className={`w-full h-10 px-3 border rounded-lg bg-white text-stone-900 text-[15px] md:text-sm placeholder-stone-400 focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600 transition-colors ${error ? 'border-red-400' : 'border-stone-300'} ${props.type === 'search' ? 'pl-10' : ''} ${className}`}
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
      {label && <label className="block text-[13px] font-medium text-stone-700 mb-1.5">{label}</label>}
      <div className="relative">
        <select
          className={`w-full h-10 appearance-none pl-3 pr-9 border border-stone-300 rounded-lg bg-white text-stone-900 text-[15px] md:text-sm focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600 transition-colors cursor-pointer ${className}`}
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
      {label && <label className="block text-[13px] font-medium text-stone-700 mb-1.5">{label}</label>}
      <div 
        className={`relative min-h-[44px] w-full px-2 py-1.5 border rounded-lg bg-white text-stone-900 transition-colors cursor-text ${disabled ? 'opacity-60 cursor-not-allowed bg-stone-50' : 'hover:border-stone-400'} ${isOpen ? 'ring-3 ring-brand-600/15 border-brand-600' : 'border-stone-300'} ${className}`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        <div className="flex flex-wrap gap-1.5 pr-6">
          {selectedValues.map(val => {
            const opt = options.find(o => o.value === val);
            return (
              <span key={val} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-stone-100 text-stone-800 border border-stone-200">
                {opt?.label}
                <button 
                  onClick={(e) => removeValue(e, val)}
                  className="ml-1.5 text-stone-400 hover:text-brand-700 rounded-full focus:outline-none" aria-label="Bỏ chọn"
                  type="button"
                >
                  <X className="w-3 h-3" />
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
                             className={`w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:bg-stone-50 transition-colors flex items-center justify-between ${isSelected ? 'text-brand-700 font-medium' : 'text-stone-700'}`}
                         >
                             <span>{opt.label}</span>
                             {isSelected && <Check className="w-4 h-4 text-brand-700" />}
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

/** Ảnh đại diện: chữ cái đầu của họ tên (không phụ thuộc dịch vụ ảnh bên ngoài) */
export const Avatar: React.FC<{ name?: string; size?: number; className?: string }> = ({ name = '', size = 32, className = '' }) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-stone-200 text-stone-700 font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} title={name}>
      {initials}
    </span>
  );
};


// --- Hiệu ứng chuyển động dùng chung ---
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Rung ngắn trên điện thoại (Android). iPhone không hỗ trợ rung từ trang web nên bỏ qua. */
export const haptic = (pattern: number | number[] = 40) => {
  try { if (!prefersReducedMotion()) navigator.vibrate?.(pattern); } catch { /* bỏ qua */ }
};

/** Số đếm từ giá trị cũ lên giá trị mới (lần đầu đếm từ 0) */
export const CountUp: React.FC<{ value: number; duration?: number; suffix?: string }> = ({ value, duration = 900, suffix = '' }) => {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); fromRef.current = value; return; }
    const from = fromRef.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(step); else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); fromRef.current = value; };
  }, [value, duration]);
  return <>{shown}{suffix}</>;
};

/** Số nảy lên mỗi khi giá trị đổi (không nảy ở lần hiện đầu tiên) */
export const BumpNumber: React.FC<{ value: React.ReactNode; className?: string }> = ({ value, className = '' }) => {
  const first = useRef(true);
  const [k, setK] = useState(0);
  useEffect(() => { if (first.current) { first.current = false; return; } setK(x => x + 1); }, [value]);
  return <span key={k} className={`${k ? 'num-bump' : ''} ${className}`}>{value}</span>;
};

/** Khung chờ tải dạng danh sách thẻ */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 3, className = '' }) => (
  <div className={`space-y-2.5 ${className}`} aria-busy="true" aria-label="Đang tải">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="skel h-4 w-3/5" />
        <div className="skel h-3 w-4/5 mt-3" />
        <div className="skel h-3 w-2/5 mt-2" />
      </div>
    ))}
  </div>
);

/** Dấu kết quả: vòng tròn bật ra, dấu tích tự vẽ (thành công) hoặc dấu X (lỗi) */
export const ResultMark: React.FC<{ ok: boolean; size?: number }> = ({ ok, size = 72 }) => (
  <div className="result-mark rounded-full mx-auto flex items-center justify-center text-white"
    style={{ width: size, height: size, background: ok ? '#10b981' : '#dc2626',
      boxShadow: `0 10px 24px -8px ${ok ? 'rgba(16,185,129,.7)' : 'rgba(220,38,38,.7)'}, inset 0 -3px 6px rgba(0,0,0,.15), inset 0 1px 1px rgba(255,255,255,.4)` }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
    </svg>
  </div>
);
