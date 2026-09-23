import React, { useRef, useState, useEffect } from 'react';
import { CalendarEvent, User, UserRole } from '../types';
import { Button } from './UI';
import { jsPDF } from "jspdf";

interface WeeklyCalendarExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  weekStart: Date;
  currentUser: User;
}

export const WeeklyCalendarExportModal: React.FC<WeeklyCalendarExportModalProps> = ({ 
  isOpen, onClose, events, weekStart, currentUser 
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scale, setScale] = useState(1);

  // Auto-fit to mobile screen on mount
  useEffect(() => {
    if (isOpen) {
        handleFitScreen();
    }
  }, [isOpen]);

  const handleFitScreen = () => {
      const screenWidth = window.innerWidth;
      // 210mm is approx 794px at 96 DPI. We use 800px as a safe approximation for calculation.
      const docWidth = 794; 
      const padding = 32;
      const availableWidth = screenWidth - padding;
      
      if (availableWidth < docWidth) {
          setScale(availableWidth / docWidth);
      } else {
          setScale(1);
      }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 2.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.3));

  // Helper: Format date for headers
  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const weekEnd = weekDates[6];

  // Logic: Group events by Date -> Session -> Time
  interface GroupedEventRow {
     time: string;
     events: CalendarEvent[];
  }

  const scheduleData: Record<string, { MORNING: GroupedEventRow[], AFTERNOON: GroupedEventRow[] }> = {};
  
  weekDates.forEach(d => {
    const dateStr = d.toISOString().split('T')[0];
    scheduleData[dateStr] = { MORNING: [], AFTERNOON: [] };
  });

  const groupEventsByTime = (eventsList: CalendarEvent[]): GroupedEventRow[] => {
     const timeMap: Record<string, CalendarEvent[]> = {};
     eventsList.forEach(ev => {
        const t = ev.time || 'UNKNOWN';
        if (!timeMap[t]) timeMap[t] = [];
        timeMap[t].push(ev);
     });
     
     return Object.keys(timeMap).sort().map(time => ({
        time,
        events: timeMap[time]
     }));
  };
  
  // Populate data
  weekDates.forEach(d => {
     const dateStr = d.toISOString().split('T')[0];
     const daysEvents = events.filter(e => e.date === dateStr);
     
     const morningRaw = daysEvents.filter(e => e.session === 'MORNING');
     const afternoonRaw = daysEvents.filter(e => e.session === 'AFTERNOON');

     scheduleData[dateStr].MORNING = groupEventsByTime(morningRaw);
     scheduleData[dateStr].AFTERNOON = groupEventsByTime(afternoonRaw);
  });

  // --- CAPTURE HELPER FUNCTION ---
  // Uses html2canvas with onclone to ensure strict styling on the capture
  const generateCanvas = async () => {
    if (!printRef.current) return null;

    try {
        // @ts-ignore
        const canvas = await window.html2canvas(printRef.current, {
            scale: 2, // Standard high quality (approx 200 DPI) - Higher scales can cause text artifacts
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: 794, // Explicit A4 width in pixels
            windowWidth: 1280,
            // Allow html2canvas to detect width/height from CSS
            onclone: (clonedDoc: Document) => {
                const element = clonedDoc.getElementById('print-content');
                if (element) {
                    // Remove shadow for the export
                    element.style.boxShadow = 'none';
                    element.style.margin = '0';
                    
                    // Force specific text rendering to avoid "clumping"
                    element.style.textRendering = 'geometricPrecision';
                    // @ts-ignore
                    element.style.webkitFontSmoothing = 'antialiased';
                    
                    // Ensure text color is black
                    const allElements = element.querySelectorAll('*');
                    allElements.forEach((el) => {
                        if (el instanceof HTMLElement) {
                            el.style.color = '#000000';
                        }
                    });
                }
            }
        });
        return canvas;
    } catch (error) {
        console.error("Capture failed:", error);
        return null;
    }
  };

  const handleShareImage = async () => {
    setIsProcessing(true);

    try {
      const canvas = await generateCanvas();
      
      if (!canvas) {
          throw new Error("Canvas generation failed");
      }

      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
            alert('Lỗi tạo ảnh.');
            setIsProcessing(false);
            return;
        }

        const fileName = `LichTuan_${weekStart.toISOString().split('T')[0]}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // Check if Web Share API is supported AND valid for files (Mobile mostly)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Lịch công tác tuần',
              text: `Lịch công tác từ ngày ${weekStart.getDate()}/${weekStart.getMonth()+1} đến ${weekEnd.getDate()}/${weekEnd.getMonth()+1}`,
            });
          } catch (error) {
            console.log('Share cancelled', error);
          }
        } else {
          // Desktop Download Fallback
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setIsProcessing(false);
      }, 'image/png', 1.0);
    } catch (error) {
      console.error('Capture error:', error);
      alert('Có lỗi xảy ra khi tạo ảnh.');
      setIsProcessing(false);
    }
  };

  const handleCopyImage = async () => {
    setIsProcessing(true);
    try {
      const canvas = await generateCanvas();
      if (!canvas) throw new Error("Canvas generation failed");

      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
            alert('Lỗi tạo ảnh.');
            setIsProcessing(false);
            return;
        }

        try {
            // @ts-ignore
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            alert("Đã sao chép ảnh! Bạn có thể dán (Ctrl+V) ngay vào Zalo hoặc Word.");
        } catch (err) {
            console.error("Clipboard write failed:", err);
            alert("Trình duyệt không hỗ trợ sao chép ảnh trực tiếp. Vui lòng dùng nút Lưu Ảnh.");
        }
        setIsProcessing(false);
      }, 'image/png', 1.0);
    } catch (error) {
      console.error('Copy error:', error);
      setIsProcessing(false);
    }
  };

  const handleExportPDF = async () => {
    setIsProcessing(true);

    try {
        const canvas = await generateCanvas();
        
        if (!canvas) {
            throw new Error("Canvas generation failed");
        }

        const imgData = canvas.toDataURL('image/png');
        
        // A4 dimensions in mm: 210 x 297 (Portrait)
        const pdfWidth = 210;
        const pageHeight = 297;
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgProps = pdf.getImageProperties(imgData);
        // Calculate total image height in PDF units based on A4 width
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;

        // Loop to add subsequent pages if content is longer than one page
        while (heightLeft > 0) {
            position -= pageHeight; // Move the image up to show the next section
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        pdf.save(`LichTuan_${weekStart.toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('PDF export error:', error);
        alert('Có lỗi xảy ra khi xuất PDF.');
    } finally {
        setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/95 backdrop-blur-sm p-0 animate-fade-in-up">
      {/* Full screen container */}
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        
        {/* Floating Close Button (Top Right) */}
        <button 
            onClick={onClose} 
            className="absolute top-4 right-4 z-50 bg-stone-800/80 hover:bg-stone-700 text-white rounded-full p-2 backdrop-blur-md shadow-lg transition-transform hover:scale-110"
            title="Đóng"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto bg-stone-800/50 flex justify-center items-start custom-scrollbar relative">
           
           {/* Zoom Wrapper */}
           <div 
             className="origin-top transition-transform duration-200 ease-out p-4 md:p-8"
             style={{ transform: `scale(${scale})` }}
           >
               {/* Document Simulation 
                   Using fixed pixel width (800px ~ A4 width) ensures text wrapping is IDENTICAL 
                   on mobile preview vs exported image. 
               */}
               <div 
                 id="print-content"
                 ref={printRef} 
                 className="bg-white shadow-2xl mx-auto flex-shrink-0" 
                 style={{ 
                    width: '794px', // A4 Width in pixels (96 DPI)
                    minWidth: '794px',
                    height: 'auto', 
                    minHeight: '1123px', // A4 Height in pixels (96 DPI)
                    padding: '40px 40px', // Approx 10mm margins
                    fontFamily: '"Times New Roman", Times, serif',
                    backgroundColor: '#ffffff',
                    color: '#000000', // Force pure black text
                    boxSizing: 'border-box',
                    lineHeight: '1.3', // Explicit line height
                    letterSpacing: 'normal' // Explicit letter spacing
                 }}
               >
                  
                  {/* Header Quốc Hiệu */}
                  <div className="flex justify-between items-start mb-6 text-black">
                     <div className="text-center w-[40%]">
                        <p className="font-bold text-[13px] uppercase leading-tight">CÔNG AN TỈNH QUẢNG TRỊ</p>
                        <p className="font-bold text-[13px] uppercase underline decoration-1 underline-offset-4 leading-tight">CÔNG AN PHƯỜNG NAM ĐÔNG HÀ</p>
                     </div>
                     <div className="text-center w-[50%]">
                        <p className="font-bold text-[13px] uppercase leading-tight">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                        <p className="font-bold text-[14px] underline decoration-1 underline-offset-4 leading-tight">Độc lập - Tự do - Hạnh phúc</p>
                     </div>
                  </div>

                  {/* Title */}
                  <div className="text-center mb-6 text-black">
                     <h1 className="text-[24px] font-bold uppercase mb-1">LỊCH CÔNG TÁC TUẦN</h1>
                     <p className="text-[15px] italic">
                        (Từ ngày {weekStart.getDate()}/{weekStart.getMonth()+1}/{weekStart.getFullYear()} đến ngày {weekEnd.getDate()}/{weekEnd.getMonth()+1}/{weekEnd.getFullYear()})
                     </p>
                  </div>

                  {/* Table */}
                  <table className="w-full border-collapse border border-black text-[13px] leading-snug table-fixed text-black">
                     <thead>
                        <tr className="bg-stone-100 text-center font-bold text-black">
                           <th className="border border-black p-2 w-[10%]">Thứ/Ngày</th>
                           <th className="border border-black p-2 w-[6%]">Buổi</th>
                           <th className="border border-black p-2 w-[8%]">Giờ</th>
                           <th className="border border-black p-2 w-[36%]">Nội dung</th>
                           <th className="border border-black p-2 w-[15%]">Địa điểm</th>
                           <th className="border border-black p-2 w-[15%]">Chủ trì</th>
                           <th className="border border-black p-2 w-[10%]">Thành phần</th>
                        </tr>
                     </thead>
                     <tbody>
                        {weekDates.map((date, idx) => {
                           const dateStr = date.toISOString().split('T')[0];
                           const morningGroups = scheduleData[dateStr].MORNING;
                           const afternoonGroups = scheduleData[dateStr].AFTERNOON;
                           
                           // Calculate rowspan based on TOTAL EVENTS
                           // If a session is empty, we still render 1 row (placeholder)
                           const mRowCount = morningGroups.reduce((acc, g) => acc + g.events.length, 0) || 1;
                           const aRowCount = afternoonGroups.reduce((acc, g) => acc + g.events.length, 0) || 1;
                           const totalRows = mRowCount + aRowCount;

                           const rows = [];

                           // --- Morning Session ---
                           if (morningGroups.length === 0) {
                               rows.push(
                                   <tr key={`${dateStr}-m-empty`} className="text-black">
                                       <td rowSpan={totalRows} className="border border-black text-center font-bold align-middle bg-stone-50 p-2 text-black">
                                          {idx === 6 ? 'Chủ nhật' : `Thứ ${idx + 2}`}<br/>
                                          <span className="font-normal italic text-[12px]">{date.getDate()}/{date.getMonth()+1}</span>
                                       </td>
                                       <td rowSpan={mRowCount} className="border border-black text-center font-bold align-middle p-2">Sáng</td>
                                       <td className="border border-black p-2 text-center align-middle font-bold"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                   </tr>
                               );
                           } else {
                               let renderedEventsCount = 0;
                               morningGroups.forEach((group, gIdx) => {
                                   const events = group.events;
                                   events.forEach((ev, eIdx) => {
                                       const isFirstEventOfGroup = eIdx === 0;
                                       const isFirstRowOfSession = renderedEventsCount === 0;
                                       
                                       rows.push(
                                           <tr key={`${dateStr}-m-${gIdx}-${eIdx}`} className="text-black">
                                               {isFirstRowOfSession && (
                                                   <td rowSpan={totalRows} className="border border-black text-center font-bold align-middle bg-stone-50 p-2 text-black">
                                                      {idx === 6 ? 'Chủ nhật' : `Thứ ${idx + 2}`}<br/>
                                                      <span className="font-normal italic text-[12px]">{date.getDate()}/{date.getMonth()+1}</span>
                                                   </td>
                                               )}
                                               {isFirstRowOfSession && (
                                                   <td rowSpan={mRowCount} className="border border-black text-center font-bold align-middle p-2">Sáng</td>
                                               )}
                                               
                                               {isFirstEventOfGroup && (
                                                   <td rowSpan={events.length} className="border border-black p-2 text-center align-middle font-bold">
                                                       {group.time}
                                                   </td>
                                               )}

                                               <td className="border border-black p-2 align-middle text-justify whitespace-pre-wrap leading-relaxed">{ev.content}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.location}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.chairperson}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.participants}</td>
                                           </tr>
                                       );
                                       renderedEventsCount++;
                                   });
                               });
                           }

                           // --- Afternoon Session ---
                           if (afternoonGroups.length === 0) {
                               rows.push(
                                   <tr key={`${dateStr}-a-empty`} className="text-black">
                                       {/* Date cell already rendered above */}
                                       <td rowSpan={aRowCount} className="border border-black text-center font-bold align-middle p-2">Chiều</td>
                                       <td className="border border-black p-2 text-center align-middle font-bold"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                       <td className="border border-black p-2"></td>
                                   </tr>
                               );
                           } else {
                               let renderedEventsCount = 0;
                               afternoonGroups.forEach((group, gIdx) => {
                                   const events = group.events;
                                   events.forEach((ev, eIdx) => {
                                       const isFirstEventOfGroup = eIdx === 0;
                                       const isFirstRowOfSession = renderedEventsCount === 0;

                                       rows.push(
                                           <tr key={`${dateStr}-a-${gIdx}-${eIdx}`} className="text-black">
                                               {/* Date cell already rendered above */}
                                               {isFirstRowOfSession && (
                                                   <td rowSpan={aRowCount} className="border border-black text-center font-bold align-middle p-2">Chiều</td>
                                               )}
                                               
                                               {isFirstEventOfGroup && (
                                                   <td rowSpan={events.length} className="border border-black p-2 text-center align-middle font-bold">
                                                       {group.time}
                                                   </td>
                                               )}

                                               <td className="border border-black p-2 align-middle text-justify whitespace-pre-wrap leading-relaxed">{ev.content}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.location}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.chairperson}</td>
                                               <td className="border border-black p-2 text-center align-middle whitespace-pre-wrap">{ev.participants}</td>
                                           </tr>
                                       );
                                       renderedEventsCount++;
                                   });
                               });
                           }
                           
                           return rows;
                        })}
                     </tbody>
                  </table>

                  {/* Signature */}
                  <div className="mt-8 flex justify-end text-black">
                     <div className="text-center w-[40%]">
                        <p className="font-bold text-[13px] uppercase">TỔ TRƯỞNG TỔ TỔNG HỢP</p>
                        <div className="h-24"></div>
                        <p className="font-bold text-[14px]">{currentUser.role === UserRole.MANAGER ? currentUser.fullName : 'Trung tá Lê Đình Thắng'}</p>
                     </div>
                  </div>

               </div>
           </div>
        </div>

        {/* Zoom Controls (Fixed Bottom Right of Preview Area) */}
        <div className="absolute bottom-24 right-4 flex flex-col gap-2 z-50">
            <button onClick={handleZoomIn} className="w-10 h-10 bg-stone-800/80 text-white rounded-full flex items-center justify-center shadow-lg backdrop-blur hover:bg-stone-700 active:scale-95 transition-all" title="Phóng to">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </button>
            <button onClick={handleFitScreen} className="w-10 h-10 bg-stone-800/80 text-white rounded-full flex items-center justify-center shadow-lg backdrop-blur hover:bg-stone-700 active:scale-95 transition-all" title="Vừa màn hình">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
            </button>
            <button onClick={handleZoomOut} className="w-10 h-10 bg-stone-800/80 text-white rounded-full flex items-center justify-center shadow-lg backdrop-blur hover:bg-stone-700 active:scale-95 transition-all" title="Thu nhỏ">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            </button>
        </div>

        {/* Floating Action Button (Bottom Center) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 bg-stone-900/90 backdrop-blur-md flex justify-center gap-3 z-50 border-t border-stone-800">
           <Button 
             variant="secondary" 
             onClick={handleCopyImage} 
             isLoading={isProcessing} 
             className="bg-blue-600 hover:bg-blue-700 text-white border-blue-800 shadow-lg px-4 py-2.5 text-sm rounded-full flex-1 md:flex-none"
             icon={<span className="text-lg">📋</span>}
             title="Sao chép vào bộ nhớ tạm"
           >
              Copy
           </Button>

           <Button 
             variant="primary" 
             onClick={handleShareImage} 
             isLoading={isProcessing} 
             className="bg-green-700 hover:bg-green-800 border-green-900 shadow-lg px-4 py-2.5 text-sm rounded-full flex-1 md:flex-none"
             icon={<span className="text-lg">📸</span>}
           >
              {isProcessing ? '...' : 'Lưu Ảnh'}
           </Button>
           
           <Button 
             variant="primary" 
             onClick={handleExportPDF} 
             isLoading={isProcessing} 
             className="bg-red-700 hover:bg-red-800 border-red-900 shadow-lg px-4 py-2.5 text-sm rounded-full flex-1 md:flex-none"
             icon={<span className="text-lg">📄</span>}
           >
              {isProcessing ? '...' : 'PDF'}
           </Button>
        </div>
      </div>
    </div>
  );
};