import React, { useState, useMemo, useEffect } from 'react';
import { Task, TaskStatus, TaskPriority } from '../types';
import { getFullDateInfo } from '../utils/dateUtils';
import { PriorityBadge, StatusBadge } from './UI';

interface CalendarViewProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onBack: () => void; // Kept for prop compatibility, though button is removed
  onDateSelect?: (date: Date) => void; // Notify parent on selection
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onEditTask, onDateSelect }) => {
  // State for Month Navigation
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  // State for Selected Day
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  // Helper: Convert any date to Local YYYY-MM-DD string to avoid timezone shifts
  const toLocalYMD = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Initial sync with parent if needed
  useEffect(() => {
     if (onDateSelect) onDateSelect(selectedDate);
  }, []);

  // Reset selected date to today if month matches, otherwise 1st of month
  useEffect(() => {
     if (selectedDate.getMonth() !== month) {
        const newDate = new Date(year, month, 1);
        setSelectedDate(newDate);
        if (onDateSelect) onDateSelect(newDate);
     }
  }, [month, year]);

  const { days, blankDays } = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday
    // Adjust for Monday start (Vietnamese standard): 0(Sun) -> 6, 1(Mon) -> 0...
    const startDayOfWeek = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    return {
        days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
        blankDays: Array.from({ length: startDayOfWeek }, (_, i) => i)
    };
  }, [year, month]);

  const handlePrevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));
  const handleToday = () => {
      const now = new Date();
      setCurrentMonthDate(now);
      setSelectedDate(now);
      if (onDateSelect) onDateSelect(now);
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  const handleDayClick = (dateObj: Date) => {
     setSelectedDate(dateObj);
     if (onDateSelect) onDateSelect(dateObj);
  };

  // Get info for the selected day (Mobile Detail View)
  const selectedDayInfo = useMemo(() => {
      const info = getFullDateInfo(selectedDate);
      const selectedYMD = toLocalYMD(selectedDate);
      
      const dayTasks = tasks.filter(t => {
          // Parse task due date to Date object first, then get Local YMD
          const tDateObj = new Date(t.dueDate);
          const tYMD = toLocalYMD(tDateObj);
          return tYMD === selectedYMD && t.status !== TaskStatus.CANCELLED;
      });
      return { info, tasks: dayTasks };
  }, [selectedDate, tasks]);

  // Helper to render dots on calendar grid
  const getTasksForDay = (day: number) => {
      const currentYMD = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      return tasks.filter(t => {
          const tDateObj = new Date(t.dueDate);
          const tYMD = toLocalYMD(tDateObj);
          return tYMD === currentYMD && t.status !== TaskStatus.CANCELLED;
      });
  };

  return (
    <div className="flex flex-col h-full gap-4 pb-safe">
        {/* Main Calendar Card */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col flex-shrink-0">
        
        {/* Calendar Header */}
        <div className="bg-white text-stone-900 px-4 py-3 md:px-5 md:py-3.5 flex items-center justify-between border-b border-stone-200 relative">

            <div className="flex items-center gap-3 z-10">
                <div>
                    <h2 className="text-base md:text-lg font-semibold leading-none">
                    Tháng {month + 1}, {year}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-stone-600 font-medium bg-stone-100 px-1.5 py-0.5 rounded">
                            {getFullDateInfo(currentMonthDate).canChi.year}
                        </span>
                        <button onClick={handleToday} className="text-xs font-medium text-brand-700 hover:underline">
                            Về hôm nay
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex gap-1 z-10">
                <button onClick={handlePrevMonth} aria-label="Tháng trước" className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <button onClick={handleNextMonth} aria-label="Tháng sau" className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-stone-50 border-b border-stone-200">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, idx) => (
                <div key={day} className={`py-2 md:py-3 text-center text-[10px] md:text-xs font-bold ${idx === 6 ? 'text-red-600' : 'text-stone-500'}`}>
                <span className="md:hidden">{day}</span>
                <span className="hidden md:inline">Thứ {day === 'CN' ? 'CN' : day.replace('T', '')}</span>
                </div>
            ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 bg-stone-100 gap-px border-b border-stone-200">
            {/* Blank Days */}
            {blankDays.map((_, idx) => (
                <div key={`blank-${idx}`} className="bg-stone-50/50 min-h-[50px] md:min-h-[120px]"></div>
            ))}

            {/* Actual Days */}
            {days.map(day => {
                const dateObj = new Date(year, month, day);
                const info = getFullDateInfo(dateObj);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isCurrentDay = isSameDay(dateObj, new Date());
                const isSelected = isSameDay(dateObj, selectedDate);
                const dayTasks = getTasksForDay(day);
                const hasTask = dayTasks.length > 0;
                const hasUrgent = dayTasks.some(t => t.priority === TaskPriority.URGENT || t.status === TaskStatus.OVERDUE);

                return (
                <div 
                    key={day} 
                    onClick={() => handleDayClick(dateObj)}
                    className={`
                        bg-white relative group transition-all cursor-pointer flex flex-col items-center md:items-stretch
                        min-h-[55px] md:min-h-[120px] 
                        ${isSelected ? 'bg-brand-50 ring-inset ring-2 ring-brand-600 z-10' : 'hover:bg-stone-50'}
                        ${isCurrentDay && !isSelected ? 'bg-red-50' : ''}
                    `}
                >
                    {/* Date Number Header */}
                    <div className="flex flex-col md:flex-row justify-between items-center md:items-start p-1 md:p-2 w-full">
                        <span className={`text-sm md:text-lg font-bold leading-none ${isWeekend ? 'text-red-600' : 'text-stone-700'} ${isCurrentDay ? 'text-red-700 underline decoration-2 underline-offset-2' : ''}`}>
                            {day}
                        </span>
                        <div className="text-center md:text-right mt-0.5 md:mt-0">
                            <div className="text-[8px] md:text-[10px] font-bold text-stone-400 leading-tight">
                            {info.lunar.day}/{info.lunar.month}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Indicators (Dots) */}
                    <div className="flex gap-1 mb-1 md:hidden">
                        {hasTask && (
                            <div className={`h-1.5 w-1.5 rounded-full ${hasUrgent ? 'bg-red-500 animate-pulse' : 'bg-blue-400'}`}></div>
                        )}
                        {dayTasks.length > 1 && (
                            <div className="h-1.5 w-1.5 rounded-full bg-stone-300"></div>
                        )}
                    </div>

                    {/* Desktop Task List (Text) */}
                    <div className="hidden md:flex flex-col gap-1 px-1 pb-1 overflow-y-auto custom-scrollbar flex-1">
                        {dayTasks.slice(0, 3).map(task => {
                            let bgClass = 'bg-blue-100 text-blue-700 border-blue-200';
                            if (task.status === TaskStatus.COMPLETED) bgClass = 'bg-green-100 text-green-700 border-green-200 line-through opacity-70';
                            else if (task.status === TaskStatus.OVERDUE) bgClass = 'bg-red-100 text-red-700 border-red-200 font-bold';
                            else if (task.priority === 'URGENT') bgClass = 'bg-red-50 text-red-700 border-red-100 border-l-2 border-l-red-600';

                            return (
                            <div 
                                key={task.id} 
                                onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
                                className={`text-[10px] px-1.5 py-1 rounded border truncate font-medium hover:opacity-80 transition-opacity ${bgClass}`}
                                title={task.title}
                            >
                                {task.title}
                            </div>
                            );
                        })}
                        {dayTasks.length > 3 && (
                            <div className="text-[9px] text-stone-400 text-center font-bold">+{dayTasks.length - 3} việc khác</div>
                        )}
                    </div>
                </div>
                );
            })}
        </div>
        </div>

        {/* Mobile Detail View (Smart Agenda Style) */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 flex items-baseline gap-2 mb-2">
                <h3 className="text-xl font-semibold text-stone-800">
                    {selectedDate.getDate()} <span className="text-sm font-medium text-stone-500">tháng {selectedDate.getMonth() + 1}</span>
                </h3>
                <div className="h-px bg-stone-200 flex-1"></div>
                <span className="text-xs font-bold text-stone-400">
                    {selectedDayInfo.info.canChi.day}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-20 space-y-4">
                {selectedDayInfo.tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-70">
                        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        </div>
                        <p className="text-stone-400 text-sm font-bold">Không có nhiệm vụ</p>
                        <p className="text-stone-300 text-xs">Ngày làm việc thảnh thơi</p>
                    </div>
                ) : (
                    selectedDayInfo.tasks.map((task, idx) => {
                        const isCompleted = task.status === TaskStatus.COMPLETED;
                        const isOverdue = task.status === TaskStatus.OVERDUE;
                        
                        return (
                        <div 
                            key={task.id}
                            onClick={() => onEditTask(task)}
                            className="flex gap-4 group"
                        >
                            {/* Time Column (Timeline) */}
                            <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full border-2 mt-1.5 z-10 ${isCompleted ? 'bg-green-500 border-green-500' : isOverdue ? 'bg-red-500 border-red-500' : 'bg-white border-blue-400'}`}></div>
                                {idx !== selectedDayInfo.tasks.length - 1 && (
                                    <div className="w-0.5 flex-1 bg-stone-200 my-1"></div>
                                )}
                            </div>

                            {/* Task Card */}
                            <div className={`flex-1 bg-white rounded-xl p-3 border shadow-sm transition-all ${isOverdue ? 'border-red-200 bg-red-50/30' : isCompleted ? 'border-green-200 opacity-80' : 'border-stone-100'}`}>
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex gap-2">
                                        <PriorityBadge priority={task.priority} />
                                        {task.isRegularDuty && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">TX</span>}
                                    </div>
                                    <StatusBadge status={task.status} />
                                </div>
                                <h4 className={`font-bold text-sm mb-1 line-clamp-2 ${isCompleted ? 'text-stone-500 line-through' : 'text-stone-800'}`}>
                                    {task.title}
                                </h4>
                                <p className="text-xs text-stone-500 line-clamp-1">{task.description}</p>
                            </div>
                        </div>
                        );
                    })
                )}
            </div>
        </div>
    </div>
  );
};