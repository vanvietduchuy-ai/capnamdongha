import React, { useState, useEffect, useRef } from 'react';
import { CalendarEvent, User, UserRole, UserDepartment, UserPermission } from '../types';
import { MockDB } from '../services/mockDatabase';
import { Button, Input } from './UI';
import { GeminiService } from '../services/geminiService';
import { WeeklyCalendarExportModal } from './WeeklyCalendarExportModal';
import { ExcelService } from '../services/excelService';
import { WordService } from '../services/wordService';

interface WeeklyCalendarProps {
  currentUser: User;
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ currentUser }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<UserDepartment | 'ALL'>('ALL');
  
  // AI Scan Modal State
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<CalendarEvent[]>([]);
  
  // Unified Input
  const [textInput, setTextInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check Permissions: Admin or users with MANAGE_WEEKLY_CALENDAR permission can edit
  const canEdit = currentUser.role === UserRole.ADMIN || 
                  currentUser.permissions?.includes(UserPermission.MANAGE_WEEKLY_CALENDAR);

  useEffect(() => {
    loadEvents();
  }, [currentWeekStart]);

  function getMonday(d: Date) {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const loadEvents = async () => {
    setIsLoading(true);
    const allEvents = await MockDB.getCalendarEvents();
    setEvents(allEvents);
    setIsLoading(false);
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const handleToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  // --- CRUD Operations ---

  const handleCellChange = (id: string, field: keyof CalendarEvent, value: any) => {
    if (!canEdit) return;
    setEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleAddEvent = (date: string, session: 'MORNING' | 'AFTERNOON') => {
    if (!canEdit) return;
    const newEvent: CalendarEvent = {
      id: `evt_${Date.now()}_${Math.random()}`,
      date,
      session,
      time: session === 'MORNING' ? '07:30' : '13:30',
      content: '',
      location: '',
      chairperson: '',
      participants: '',
      isOnline: false,
      creatorId: currentUser.id
    };
    setEvents(prev => [...prev, newEvent]);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!canEdit) return;
    if (confirm('Xóa sự kiện này?')) {
        await MockDB.deleteCalendarEvent(id);
        setEvents(prev => prev.filter(e => e.id !== id));
    }
  };

  const handleSaveAll = async () => {
    if (!canEdit) return;
    setIsLoading(true);
    await MockDB.saveWeeklySchedule(events);
    setIsLoading(false);
    alert('Đã lưu lịch công tác!');
  };

  // --- AI SCAN HANDLERS ---

  const determineSession = (timeStr: string): 'MORNING' | 'AFTERNOON' => {
    if (!timeStr) return 'MORNING';
    const cleanTime = timeStr.toLowerCase().trim();
    if (cleanTime.includes('chiều') || cleanTime.includes('13h') || cleanTime.includes('14h') || cleanTime.includes('15h') || cleanTime.includes('16h') || cleanTime.includes('17h')) {
        return 'AFTERNOON';
    }
    if (cleanTime.includes('sáng')) return 'MORNING';
    const parts = cleanTime.match(/(\d{1,2})[:h]/);
    if (parts && parts[1]) {
        const hour = parseInt(parts[1], 10);
        return hour >= 12 ? 'AFTERNOON' : 'MORNING';
    }
    return 'MORNING'; 
  };

  const processScanResult = async (scannedEvents: any[]) => {
    if (scannedEvents.length > 0) {
        const newEvents: CalendarEvent[] = scannedEvents.map(se => ({
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            date: se.date,
            session: determineSession(se.time),
            time: se.time,
            content: se.content,
            location: se.location || '',
            chairperson: se.chairperson || '',
            participants: se.participants || '',
            isOnline: false,
            creatorId: currentUser.id,
            department: se.department
        }));
        
        setPendingEvents(newEvents);
        setShowReviewModal(true);
        setShowScanModal(false);
        setTextInput('');
        setSelectedFiles([]);
    } else {
        alert('AI không tìm thấy thông tin lịch phù hợp trong nội dung này. Vui lòng kiểm tra lại.');
    }
  };

  const handleConfirmReview = async () => {
    if (!canEdit) return;
    setIsLoading(true);
    try {
        const updatedEvents = [...events, ...pendingEvents];
        setEvents(updatedEvents);
        await MockDB.saveWeeklySchedule(updatedEvents);
        alert(`Đã lưu thành công ${pendingEvents.length} công việc vào lịch.`);
        setShowReviewModal(false);
        setPendingEvents([]);
    } catch (error) {
        console.error("Save error:", error);
        alert("LỖI LƯU DỮ LIỆU. Vui lòng kiểm tra kết nối mạng.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleUpdatePendingEvent = (id: string, field: keyof CalendarEvent, value: any) => {
    setPendingEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleDeletePendingEvent = (id: string) => {
    setPendingEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        const newFiles = Array.from(e.target.files);
        setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!textInput.trim() && selectedFiles.length === 0) {
        alert("Vui lòng nhập nội dung hoặc chọn file để phân tích.");
        return;
    }

    setIsScanning(true);
    try {
        let combinedTextContent = textInput;
        const mediaInputs: { data: string, mimeType: string }[] = [];

        // Loop through all selected files
        for (const file of selectedFiles) {
            if (file.type.includes('image')) {
                const reader = new FileReader();
                const b64 = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                mediaInputs.push({ data: b64, mimeType: file.type });
            }
            else if (file.type === 'application/pdf') {
                const reader = new FileReader();
                const b64 = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                mediaInputs.push({ data: b64, mimeType: 'application/pdf' });
            }
            else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                const textData = await ExcelService.readExcelFile(file);
                combinedTextContent += `\n\n--- FILE: ${file.name} ---\n` + textData;
            }
            else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
                const textData = await WordService.readDocxFile(file);
                combinedTextContent += `\n\n--- FILE: ${file.name} ---\n` + textData;
            }
            else {
                console.warn("Skipping unsupported file:", file.name);
            }
        }

        const result = await GeminiService.scanScheduleDocument(mediaInputs, combinedTextContent, currentWeekStart);
        processScanResult(result);

    } catch (e: any) {
        console.error("Analysis Error:", e);
        let errorMsg = e.message || "Lỗi không xác định";
        if (errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE")) {
            errorMsg = "Hệ thống AI đang quá tải (503). Vui lòng thử lại sau giây lát.";
        } else if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
            errorMsg = "Bạn đã hết lượt sử dụng AI trong lúc này. Vui lòng đợi một lát.";
        }
        alert('Có lỗi xảy ra khi phân tích: ' + errorMsg);
    } finally {
        setIsScanning(false);
    }
  };

  // --- Render Helpers ---
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(currentWeekStart.getDate() + i);
    weekDates.push(d);
  }

  // Mobile Render Row (Optimized Timeline View)
  const renderEventCard = (ev: CalendarEvent) => (
    <div key={ev.id} className={`relative pl-3 border-l-4 ${ev.session === 'MORNING' ? 'border-yellow-400 bg-white' : 'border-blue-400 bg-white'} rounded-r-lg shadow-sm mb-3 py-3 pr-3 animate-fade-in-up`}>
        {/* Delete Button (Mobile) */}
        {canEdit && (
            <button 
                onClick={() => handleDeleteEvent(ev.id)} 
                className="absolute top-2 right-2 text-stone-300 hover:text-red-500 p-1 bg-stone-50 rounded-full z-10"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        )}

        {/* Time & Badge */}
        <div className="flex items-center gap-3 mb-2">
            <input 
                type="time" 
                value={ev.time} 
                onChange={e => handleCellChange(ev.id, 'time', e.target.value)} 
                className={`font-extrabold text-lg bg-transparent border-none p-0 w-auto focus:ring-0 ${ev.session === 'MORNING' ? 'text-yellow-700' : 'text-blue-700'}`}
                disabled={!canEdit}
            />
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${ev.session === 'MORNING' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                {ev.session === 'MORNING' ? 'SÁNG' : 'CHIỀU'}
            </span>
            {ev.department && <span className="bg-stone-100 text-stone-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">{ev.department}</span>}
            {ev.isOnline && <span className="bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-bold">ONLINE</span>}
        </div>
        
        {/* Content */}
        <textarea 
            value={ev.content} 
            onChange={e => handleCellChange(ev.id, 'content', e.target.value)}
            placeholder="Nội dung công việc"
            className="w-full text-sm font-semibold text-stone-800 bg-transparent border-none p-0 mb-3 focus:ring-0 resize-none leading-relaxed"
            rows={2}
            disabled={!canEdit}
        />
        
        {/* Meta Info Grid */}
        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-stone-100 border-dashed">
            <div className="flex items-start gap-2">
                <span className="text-stone-400 mt-0.5">📍</span>
                <input 
                    value={ev.location} 
                    onChange={e => handleCellChange(ev.id, 'location', e.target.value)}
                    placeholder="Địa điểm"
                    className="text-xs text-stone-600 bg-transparent border-none p-0 w-full focus:ring-0 placeholder-stone-300"
                    disabled={!canEdit}
                />
            </div>
            <div className="flex items-start gap-2">
                <span className="text-stone-400 mt-0.5">👤</span>
                <input 
                    value={ev.chairperson} 
                    onChange={e => handleCellChange(ev.id, 'chairperson', e.target.value)}
                    placeholder="Chủ trì"
                    className="text-xs text-stone-600 bg-transparent border-none p-0 w-full focus:ring-0 italic placeholder-stone-300"
                    disabled={!canEdit}
                />
            </div>
            <div className="flex items-start gap-2">
                <span className="text-stone-400 mt-0.5">👥</span>
                <textarea 
                    value={ev.participants} 
                    onChange={e => handleCellChange(ev.id, 'participants', e.target.value)}
                    placeholder="Thành phần tham dự"
                    className="text-xs text-stone-500 bg-transparent border-none p-0 w-full focus:ring-0 resize-none placeholder-stone-300"
                    rows={1}
                    disabled={!canEdit}
                />
            </div>
            {canEdit && (
                <div className="flex items-start gap-2">
                    <span className="text-stone-400 mt-0.5">🏢</span>
                    <select 
                        value={ev.department || ''} 
                        onChange={e => handleCellChange(ev.id, 'department', e.target.value || undefined)}
                        className="text-xs text-stone-600 bg-transparent border-none p-0 w-full focus:ring-0 outline-none"
                    >
                        <option value="">-- Chọn đơn vị --</option>
                        {Object.values(UserDepartment).map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        {/* Meeting Link */}
        {ev.isOnline && (
            <div className="mt-3">
                 <input 
                    value={ev.meetingLink || ''} 
                    onChange={e => handleCellChange(ev.id, 'meetingLink', e.target.value)}
                    placeholder="Dán link họp vào đây..."
                    className="w-full text-xs text-blue-600 bg-blue-50 px-2 py-1.5 rounded border border-blue-100 mb-1"
                    disabled={!canEdit}
                />
                {!canEdit && ev.meetingLink && (
                    <a href={ev.meetingLink} target="_blank" rel="noreferrer" className="block text-center text-xs font-bold text-white bg-blue-600 py-1.5 rounded hover:bg-blue-700 shadow-sm shadow-blue-200">
                        Tham gia cuộc họp ngay
                    </a>
                )}
            </div>
        )}
    </div>
  );

  // Desktop Render Row (Scientific)
  const renderDesktopRow = (ev: CalendarEvent, isLast: boolean) => (
    <div key={ev.id} className={`flex group transition-colors hover:bg-stone-50 ${!isLast ? 'border-b border-stone-200' : ''}`}>
        {/* Time & Session */}
        <div className="w-[100px] p-2 border-r border-stone-200 flex flex-col items-center justify-center shrink-0">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mb-1 ${ev.session === 'MORNING' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                {ev.session === 'MORNING' ? 'SÁNG' : 'CHIỀU'}
            </span>
            {ev.department && <span className="text-[8px] text-stone-400 font-bold uppercase mb-1">{ev.department}</span>}
            <input 
                type="time" 
                value={ev.time} 
                onChange={e => handleCellChange(ev.id, 'time', e.target.value)} 
                className="text-center font-bold text-sm bg-transparent outline-none w-full"
                disabled={!canEdit}
            />
            {canEdit && (
                <button 
                    onClick={() => handleCellChange(ev.id, 'isOnline', !ev.isOnline)}
                    className={`mt-1 w-2 h-2 rounded-full ${ev.isOnline ? 'bg-green-500' : 'bg-stone-200'}`}
                    title="Online Meeting"
                ></button>
            )}
        </div>

        {/* Content */}
        <div className="flex-1 p-2 border-r border-stone-200 min-w-[200px]">
            <textarea 
                value={ev.content} 
                onChange={e => handleCellChange(ev.id, 'content', e.target.value)}
                className="w-full h-full bg-transparent outline-none resize-none text-sm font-medium leading-relaxed min-h-[50px]"
                disabled={!canEdit}
            />
            {ev.isOnline && (
                <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded font-bold">ONLINE</span>
                    <input 
                        value={ev.meetingLink || ''} 
                        onChange={e => handleCellChange(ev.id, 'meetingLink', e.target.value)}
                        placeholder="Link họp..."
                        className="flex-1 text-xs text-blue-600 bg-transparent border-b border-blue-100 focus:border-blue-400 outline-none"
                        disabled={!canEdit}
                    />
                    {!canEdit && ev.meetingLink && <a href={ev.meetingLink} target="_blank" className="text-xs text-blue-600 underline">Vào</a>}
                </div>
            )}
        </div>

        {/* Location & Chair */}
        <div className="w-[180px] p-2 border-r border-stone-200 flex flex-col gap-1 shrink-0">
            <input 
                value={ev.location} 
                onChange={e => handleCellChange(ev.id, 'location', e.target.value)} 
                className="w-full bg-transparent outline-none text-xs font-medium text-stone-700 placeholder-stone-300" 
                placeholder="Địa điểm"
                disabled={!canEdit}
            />
            <input 
                value={ev.chairperson} 
                onChange={e => handleCellChange(ev.id, 'chairperson', e.target.value)} 
                className="w-full bg-transparent outline-none text-xs text-stone-500 italic placeholder-stone-300"
                placeholder="Chủ trì"
                disabled={!canEdit}
            />
            {canEdit && (
                <select 
                    value={ev.department || ''} 
                    onChange={e => handleCellChange(ev.id, 'department', e.target.value || undefined)}
                    className="w-full bg-transparent outline-none text-[10px] text-stone-400 font-bold uppercase"
                >
                    <option value="">-- ĐƠN VỊ --</option>
                    {Object.values(UserDepartment).map(dept => (
                        <option key={dept} value={dept}>{dept.toUpperCase()}</option>
                    ))}
                </select>
            )}
        </div>

        {/* Participants */}
        <div className="w-[180px] p-2 relative shrink-0 group-cell">
            <textarea 
                value={ev.participants} 
                onChange={e => handleCellChange(ev.id, 'participants', e.target.value)} 
                className="w-full h-full bg-transparent outline-none resize-none text-xs text-stone-600 min-h-[50px]" 
                placeholder="Thành phần"
                disabled={!canEdit}
            />
            {canEdit && (
                <button onClick={() => handleDeleteEvent(ev.id)} className="absolute top-1 right-1 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">✕</button>
            )}
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-stone-50 pb-safe">
      {/* --- HEADER CONTROLS --- */}
      <div className="flex flex-col md:flex-row justify-between items-center p-4 bg-white border-b border-stone-200 gap-4 shrink-0">
         <div className="flex items-center gap-3">
            <button onClick={handlePrevWeek} className="p-2 hover:bg-stone-100 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg></button>
            <div className="text-center">
               <h2 className="text-lg font-bold text-red-900 uppercase">Tuần {Math.ceil((currentWeekStart.getDate() + 6 - currentWeekStart.getDay()) / 7) + 1}</h2>
               <p className="text-xs text-stone-500 font-bold">
                  {currentWeekStart.toLocaleDateString('vi-VN')} - {new Date(currentWeekStart.getTime() + 6 * 86400000).toLocaleDateString('vi-VN')}
               </p>
            </div>
            <button onClick={handleNextWeek} className="p-2 hover:bg-stone-100 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg></button>
            <button onClick={handleToday} className="text-xs font-bold text-blue-600 hover:underline">Hôm nay</button>
         </div>

         <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase">Lọc theo:</span>
            <select 
                value={departmentFilter} 
                onChange={(e) => setDepartmentFilter(e.target.value as any)}
                className="text-xs font-bold bg-stone-100 border border-stone-200 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-red-200"
            >
                <option value="ALL">TẤT CẢ ĐƠN VỊ</option>
                {Object.values(UserDepartment).map(dept => (
                    <option key={dept} value={dept}>{dept.toUpperCase()}</option>
                ))}
            </select>
         </div>

         <div className="flex gap-2">
            {canEdit && (
                <>
                    <Button 
                        variant="secondary" 
                        onClick={() => setShowScanModal(true)} 
                        icon={<span>✨</span>}
                    >
                        Nhập liệu AI
                    </Button>
                    <Button 
                        onClick={handleSaveAll} 
                        isLoading={isLoading} 
                        className="bg-green-600 hover:bg-green-700 border-green-800"
                    >
                        Lưu Lịch
                    </Button>
                </>
            )}
            <Button variant="outline" onClick={() => setShowExportModal(true)}>Xuất ảnh A4</Button>
         </div>
      </div>

      {/* --- UNIFIED SCAN MODAL --- */}
      {showScanModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in-up">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-stone-100 bg-red-900 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">✨ AI Phân Tích & Nhập Liệu</h3>
                        <p className="text-xs text-red-200">Hỗ trợ Ảnh, PDF, Word, Excel hoặc Văn bản</p>
                    </div>
                    <button onClick={() => setShowScanModal(false)} className="text-white/70 hover:text-white">✕</button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* File Attachment */}
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${selectedFiles.length > 0 ? 'bg-green-50 border-green-300' : 'bg-stone-50 border-stone-300 hover:bg-red-50 hover:border-red-300'}`}
                    >
                        <div className={`p-3 rounded-full ${selectedFiles.length > 0 ? 'bg-green-200 text-green-700' : 'bg-stone-200 text-stone-500'}`}>
                            {selectedFiles.length > 0 ? <span className="text-xl">📚</span> : <span className="text-xl">📎</span>}
                        </div>
                        
                        <div className="text-center">
                            <p className="font-bold text-stone-700 text-sm">
                                {selectedFiles.length > 0 ? `${selectedFiles.length} file đã chọn` : "Chọn nhiều file để phân tích"}
                            </p>
                            {selectedFiles.length === 0 && <p className="text-xs text-stone-400">Word, Excel, PDF, Ảnh...</p>}
                        </div>

                        {selectedFiles.length > 0 && (
                            <div className="w-full mt-2 space-y-1">
                                {selectedFiles.map((f, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white/50 p-1.5 rounded text-xs border border-green-100">
                                        <span className="truncate max-w-[200px] text-green-800 font-medium">{f.name}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                            className="text-red-500 hover:text-red-700 px-1 font-bold"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <div className="text-center mt-2">
                                     <span className="text-[10px] text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded">
                                        Nhấn để thêm file khác
                                     </span>
                                </div>
                            </div>
                        )}
                        
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            accept="image/*, application/pdf, .docx, .doc, .xlsx, .xls" 
                            className="hidden" 
                            multiple 
                            onChange={handleFileSelect} 
                        />
                    </div>

                    {/* Text Input */}
                    <div className="relative">
                        <textarea 
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            className="w-full h-32 p-4 pt-10 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none resize-none shadow-sm"
                            placeholder="Hoặc dán nội dung văn bản vào đây..."
                        />
                        <div className="absolute top-3 left-4 text-xs font-bold text-stone-400 uppercase tracking-wide">
                            Nội dung văn bản
                        </div>
                    </div>

                    {/* Action Button */}
                    <Button 
                        onClick={handleAnalyze} 
                        isLoading={isScanning} 
                        className="w-full py-3 text-base shadow-red-900/30"
                        disabled={!textInput && selectedFiles.length === 0}
                    >
                        {isScanning ? 'Đang phân tích...' : 'Tiến hành phân tích'}
                    </Button>
                </div>
            </div>
        </div>
      )}

      {/* --- REVIEW MODAL --- */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/90 backdrop-blur-md p-2 md:p-4 animate-fade-in-up">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="px-6 py-4 border-b border-stone-100 bg-blue-900 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">✅ Xác nhận nội dung đã trích xuất</h3>
                        <p className="text-xs text-blue-200">Vui lòng kiểm tra và chỉnh sửa nếu cần thiết trước khi đăng lịch</p>
                    </div>
                    <button onClick={() => setShowReviewModal(false)} className="text-white/70 hover:text-white">✕</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-stone-50">
                    {pendingEvents.length === 0 ? (
                        <div className="text-center py-10 text-stone-400 italic">Không có dữ liệu để hiển thị</div>
                    ) : (
                        <div className="space-y-4">
                            {pendingEvents.map((ev, idx) => (
                                <div key={ev.id} className="bg-white border border-stone-200 rounded-xl shadow-sm p-4 relative group">
                                    <button 
                                        onClick={() => handleDeletePendingEvent(ev.id)}
                                        className="absolute top-2 right-2 text-stone-300 hover:text-red-500 p-1"
                                        title="Xóa mục này"
                                    >
                                        ✕
                                    </button>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                        {/* Date & Time */}
                                        <div className="md:col-span-3 space-y-2">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Ngày</label>
                                                <input 
                                                    type="date" 
                                                    value={ev.date} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'date', e.target.value)}
                                                    className="text-sm font-bold text-stone-800 border-b border-stone-100 focus:border-blue-500 outline-none py-1"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Giờ</label>
                                                <input 
                                                    type="time" 
                                                    value={ev.time} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'time', e.target.value)}
                                                    className="text-sm font-bold text-stone-800 border-b border-stone-100 focus:border-blue-500 outline-none py-1"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Đơn vị phụ trách</label>
                                                <select 
                                                    value={ev.department || ''} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'department', e.target.value || undefined)}
                                                    className="text-xs font-bold text-stone-800 border-b border-stone-100 focus:border-blue-500 outline-none py-1 bg-transparent"
                                                >
                                                    <option value="">-- Chọn đơn vị --</option>
                                                    {Object.values(UserDepartment).map(dept => (
                                                        <option key={dept} value={dept}>{dept}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2">
                                                <button 
                                                    onClick={() => handleUpdatePendingEvent(ev.id, 'session', ev.session === 'MORNING' ? 'AFTERNOON' : 'MORNING')}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${ev.session === 'MORNING' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}
                                                >
                                                    {ev.session === 'MORNING' ? 'Sáng' : 'Chiều'}
                                                </button>
                                                <button 
                                                    onClick={() => handleUpdatePendingEvent(ev.id, 'isOnline', !ev.isOnline)}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${ev.isOnline ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-500'}`}
                                                >
                                                    {ev.isOnline ? 'Online' : 'Trực tiếp'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="md:col-span-5 flex flex-col">
                                            <label className="text-[10px] font-bold text-stone-400 uppercase">Nội dung công việc</label>
                                            <textarea 
                                                value={ev.content} 
                                                onChange={e => handleUpdatePendingEvent(ev.id, 'content', e.target.value)}
                                                className="flex-1 text-sm font-medium text-stone-800 border border-stone-100 rounded-lg p-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none min-h-[80px] resize-none"
                                                placeholder="Nội dung..."
                                            />
                                        </div>

                                        {/* Meta */}
                                        <div className="md:col-span-4 space-y-2">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Địa điểm</label>
                                                <input 
                                                    value={ev.location} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'location', e.target.value)}
                                                    className="text-xs text-stone-700 border-b border-stone-100 focus:border-blue-500 outline-none py-1"
                                                    placeholder="Địa điểm..."
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Chủ trì</label>
                                                <input 
                                                    value={ev.chairperson} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'chairperson', e.target.value)}
                                                    className="text-xs text-stone-700 border-b border-stone-100 focus:border-blue-500 outline-none py-1 italic"
                                                    placeholder="Người chủ trì..."
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-stone-400 uppercase">Thành phần</label>
                                                <textarea 
                                                    value={ev.participants} 
                                                    onChange={e => handleUpdatePendingEvent(ev.id, 'participants', e.target.value)}
                                                    className="text-xs text-stone-600 border border-stone-100 rounded-lg p-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none min-h-[40px] resize-none"
                                                    placeholder="Thành phần tham dự..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-between items-center shrink-0">
                    <button 
                        onClick={() => setShowReviewModal(false)}
                        className="px-6 py-2 text-sm font-bold text-stone-500 hover:text-stone-700"
                    >
                        Hủy bỏ
                    </button>
                    <div className="flex gap-3">
                        <Button 
                            variant="outline"
                            onClick={() => {
                                setShowReviewModal(false);
                                setShowScanModal(true);
                            }}
                        >
                            Quay lại nhập liệu
                        </Button>
                        <Button 
                            onClick={handleConfirmReview} 
                            isLoading={isLoading}
                            disabled={pendingEvents.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 border-blue-800 px-8"
                        >
                            Xác nhận & Đăng lịch
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- CONTENT --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 md:p-6 bg-stone-100">
         
         {/* DESKTOP SCIENTIFIC TABLE VIEW */}
         <div className="hidden md:block bg-white shadow-sm border border-stone-300 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[120px_100px_1fr_180px_180px] bg-red-900 text-white text-sm font-bold border-b border-red-800 sticky top-0 z-10">
                <div className="p-3 text-center border-r border-red-800">THỨ / NGÀY</div>
                <div className="p-3 text-center border-r border-red-800">THỜI GIAN</div>
                <div className="p-3 border-r border-red-800 text-center">NỘI DUNG CÔNG TÁC</div>
                <div className="p-3 border-r border-red-800 text-center">ĐỊA ĐIỂM / CHỦ TRÌ</div>
                <div className="p-3 text-center">THÀNH PHẦN</div>
            </div>
            
            <div className="divide-y divide-stone-300">
               {weekDates.map((date, dateIdx) => {
                  const dateStr = date.toISOString().split('T')[0];
                  // Sort events by time and filter by department
                  const dayEvents = events
                    .filter(e => e.date === dateStr && (departmentFilter === 'ALL' || e.department === departmentFilter))
                    .sort((a, b) => a.time.localeCompare(b.time));
                  
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                  // Render empty row if no events
                  if (dayEvents.length === 0) {
                      return (
                        <div key={dateStr} className="grid grid-cols-[120px_1fr] group hover:bg-stone-50 min-h-[60px]">
                            <div className={`p-3 border-r border-stone-200 flex flex-col justify-center items-center text-center ${isToday ? 'bg-red-50' : 'bg-white'}`}>
                                <span className={`font-extrabold text-sm uppercase ${isWeekend ? 'text-red-600' : 'text-stone-700'}`}>{dateIdx === 6 ? 'Chủ nhật' : `Thứ ${dateIdx + 2}`}</span>
                                <span className="text-xs font-medium text-stone-500">{date.getDate()}/{date.getMonth() + 1}</span>
                                {canEdit && (
                                    <div className="flex gap-1 mt-2">
                                        <button onClick={() => handleAddEvent(dateStr, 'MORNING')} className="w-5 h-5 flex items-center justify-center text-[10px] bg-yellow-100 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-200" title="Thêm Sáng">+</button>
                                        <button onClick={() => handleAddEvent(dateStr, 'AFTERNOON')} className="w-5 h-5 flex items-center justify-center text-[10px] bg-blue-100 text-blue-700 rounded border border-blue-200 hover:bg-blue-200" title="Thêm Chiều">+</button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-center text-stone-300 text-xs italic bg-white">
                                Không có lịch công tác
                            </div>
                        </div>
                      );
                  }

                  return (
                    <div key={dateStr} className="grid grid-cols-[120px_1fr] group">
                        {/* Date Column (Rowspan visual) */}
                        <div className={`p-3 border-r border-stone-200 flex flex-col justify-center items-center text-center ${isToday ? 'bg-red-50' : 'bg-white'}`}>
                            <span className={`font-extrabold text-sm uppercase ${isWeekend ? 'text-red-600' : 'text-stone-700'}`}>{dateIdx === 6 ? 'Chủ nhật' : `Thứ ${dateIdx + 2}`}</span>
                            <span className="text-xs font-medium text-stone-500">{date.getDate()}/{date.getMonth() + 1}</span>
                            {canEdit && (
                                <div className="flex gap-1 mt-2">
                                    <button onClick={() => handleAddEvent(dateStr, 'MORNING')} className="w-5 h-5 flex items-center justify-center text-[10px] bg-yellow-100 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-200" title="Thêm Sáng">+</button>
                                    <button onClick={() => handleAddEvent(dateStr, 'AFTERNOON')} className="w-5 h-5 flex items-center justify-center text-[10px] bg-blue-100 text-blue-700 rounded border border-blue-200 hover:bg-blue-200" title="Thêm Chiều">+</button>
                                </div>
                            )}
                        </div>

                        {/* Events List */}
                        <div className="flex flex-col w-full bg-white">
                            {dayEvents.map((ev, idx) => renderDesktopRow(ev, idx === dayEvents.length - 1))}
                        </div>
                    </div>
                  );
               })}
            </div>
         </div>

         {/* MOBILE CARD VIEW - UPDATED to Sticky Header & Timeline */}
         <div className="md:hidden space-y-2">
            {weekDates.map((date, dateIdx) => {
               const dateStr = date.toISOString().split('T')[0];
               const dayEvents = events
                    .filter(e => e.date === dateStr && (departmentFilter === 'ALL' || e.department === departmentFilter))
                    .sort((a, b) => a.time.localeCompare(b.time));
                    
               const isWeekend = date.getDay() === 0 || date.getDay() === 6;
               const isToday = new Date().toISOString().split('T')[0] === dateStr;

               return (
                  <div key={dateStr} className="relative">
                     {/* Sticky Header */}
                     <div className={`sticky top-0 z-20 flex justify-between items-center px-3 py-2 border-b shadow-sm mb-2 backdrop-blur-md ${isToday ? 'bg-red-50/95 border-red-200 text-red-900' : (isWeekend ? 'bg-stone-50/95 border-stone-200 text-red-800' : 'bg-white/95 border-stone-200 text-stone-800')}`}>
                        <div className="flex items-baseline gap-2">
                            <span className="font-extrabold text-sm uppercase">{dateIdx === 6 ? 'Chủ nhật' : `Thứ ${dateIdx + 2}`}</span>
                            <span className="font-medium text-xs opacity-70">{date.getDate()}/{date.getMonth() + 1}</span>
                            {isToday && <span className="text-[9px] font-bold bg-red-600 text-white px-1.5 rounded">HÔM NAY</span>}
                        </div>
                        {canEdit && (
                            <div className="flex gap-2">
                                <button onClick={() => handleAddEvent(dateStr, 'MORNING')} className="w-6 h-6 flex items-center justify-center rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 text-sm shadow-sm" title="+ Sáng">+</button>
                                <button onClick={() => handleAddEvent(dateStr, 'AFTERNOON')} className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm shadow-sm" title="+ Chiều">+</button>
                            </div>
                        )}
                     </div>
                     
                     <div className="px-2 pb-2">
                        {dayEvents.length === 0 ? (
                            <div className="text-xs text-stone-300 italic text-center py-4 border border-dashed border-stone-200 rounded-lg">Không có lịch công tác</div> 
                        ) : (
                            dayEvents.map(ev => renderEventCard(ev))
                        )}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>

      <WeeklyCalendarExportModal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)}
        events={events}
        weekStart={currentWeekStart}
        currentUser={currentUser}
      />
    </div>
  );
};