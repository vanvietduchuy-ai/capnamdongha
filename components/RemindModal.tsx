import React, { useRef, useState } from 'react';
import { Task, TaskStatus, User } from '../types';
import { Button } from './UI';
import jsPDF from 'jspdf';

interface RemindModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  users: User[];
  targetUser?: User; 
}

export const RemindModal: React.FC<RemindModalProps> = ({ isOpen, onClose, tasks, users, targetUser }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const pendingTasks = tasks.filter(t => 
    t.status !== TaskStatus.COMPLETED && 
    t.status !== TaskStatus.CANCELLED &&
    !t.isRegularDuty
  ).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const handleShare = async () => {
    if (!printRef.current) return;
    setIsProcessing(true);

    try {
      const scaleFactor = 2.5; 

      // @ts-ignore
      const canvas = await window.html2canvas(printRef.current, {
        scale: scaleFactor, 
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        allowTaint: true,
        width: 794, // Match the fixed width of the div (A4 width in px approx)
        windowWidth: 1200, 
        scrollY: 0, 
        height: printRef.current.scrollHeight
      });

      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) {
            alert('Lỗi tạo ảnh.');
            setIsProcessing(false);
            return;
        }

        const file = new File([blob], `nhac-viec-${Date.now()}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Nhắc nhở công việc',
              text: 'Đề nghị các đồng chí kiểm tra và xử lý các công việc còn tồn đọng',
            });
          } catch (error) {
            console.log('Share cancelled or failed', error);
          }
        } else {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `nhac-viec-${Date.now()}.png`;
          link.click();
          alert('Ảnh đã được tải xuống thiết bị.');
        }
        setIsProcessing(false);
      }, 'image/png', 0.9); 
    } catch (error) {
      console.error('Capture error:', error);
      alert('Có lỗi xảy ra khi tạo ảnh.');
      setIsProcessing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setIsProcessing(true);

    try {
        // @ts-ignore
        const canvas = await window.html2canvas(printRef.current, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: 794, // A4 width in pixels (96 DPI)
            windowWidth: 1280,
            onclone: (clonedDoc: Document) => {
                const element = clonedDoc.getElementById('print-content-remind');
                if (element) {
                    element.style.boxShadow = 'none';
                    element.style.margin = '0';
                    const allElements = element.querySelectorAll('*');
                    allElements.forEach((el) => {
                        if (el instanceof HTMLElement) {
                            el.style.color = '#000000';
                        }
                    });
                }
            }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`nhac-viec-${Date.now()}.pdf`);
        setIsProcessing(false);
    } catch (error) {
        console.error("PDF Export failed:", error);
        alert("Có lỗi khi xuất PDF.");
        setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/95 backdrop-blur-sm p-0 animate-fade-in-up">
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        
        {/* Floating Close Button */}
        <button 
            onClick={onClose} 
            className="absolute top-4 right-4 z-50 bg-stone-800/80 hover:bg-stone-700 text-white rounded-full p-2 backdrop-blur-md shadow-lg transition-transform hover:scale-110"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-auto p-4 flex justify-center items-start custom-scrollbar">
           
           {/* THE DOCUMENT TO CAPTURE 
               Fixed width 794px (A4 approx) ensures consistency.
           */}
           <div 
             id="print-content-remind"
             ref={printRef} 
             className="bg-white shadow-2xl text-black flex flex-col relative mx-auto shrink-0"
             style={{ 
                width: '794px', 
                minWidth: '794px',
                height: 'auto', 
                minHeight: '1123px', // A4 Height
                padding: '40px 40px', 
                fontFamily: '"Times New Roman", Times, serif',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box'
             }}
           >
              
              {/* Official Header */}
              <div className="flex justify-between items-start mb-6 border-b-2 border-stone-800 pb-2">
                 <div className="text-center w-1/2">
                    <p className="text-[14px] font-bold uppercase tracking-tight leading-snug">CÔNG AN TỈNH QUẢNG TRỊ</p>
                    <p className="text-[14px] font-bold uppercase leading-snug underline decoration-1 underline-offset-4">CÔNG AN PHƯỜNG NAM ĐÔNG HÀ</p>
                 </div>
                 <div className="text-right w-1/2">
                    <p className="text-[14px] italic">
                        Ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                    </p>
                 </div>
              </div>

              {/* Title */}
              <div className="text-center mb-8">
                 <h1 className="text-[24px] font-bold text-red-700 uppercase tracking-wide leading-none mb-2">THÔNG BÁO</h1>
                 <p className="text-[16px] font-bold text-black uppercase tracking-wide">V/v đôn đốc thực hiện nhiệm vụ</p>
              </div>

              {/* Greeting */}
              <div className="mb-6 text-[14px] leading-relaxed">
                 <p className="mb-2">Kính gửi: <span className="font-bold">{targetUser ? targetUser.fullName : 'Các đồng chí Cán bộ'}</span></p>
                 <p className="text-justify indent-8">
                    Qua rà soát trên hệ thống, hiện tại còn tồn đọng các nhiệm vụ có thời hạn sau đây, đề nghị đồng chí khẩn trương kiểm tra và xử lý:
                 </p>
              </div>

              {/* Task List Table */}
              <div className="flex-1 mb-8">
                 {pendingTasks.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-stone-300 rounded-lg bg-stone-50">
                       <p className="text-green-700 font-bold text-[16px] uppercase">Đã hoàn thành tất cả nhiệm vụ</p>
                       <p className="text-stone-600 text-[14px] mt-1">Không có công việc tồn đọng.</p>
                    </div>
                 ) : (
                    <table className="w-full text-[13px] border-collapse border border-black">
                       <thead>
                          <tr className="bg-stone-100 text-black">
                             <th className="p-2 w-[40px] text-center font-bold border border-black">STT</th>
                             <th className="p-2 text-left font-bold border border-black">NỘI DUNG</th>
                             <th className="p-2 w-[150px] text-left font-bold border border-black">CÁN BỘ THỰC HIỆN</th>
                             <th className="p-2 w-[90px] text-center font-bold border border-black">TRẠNG THÁI</th>
                             <th className="p-2 w-[90px] text-center font-bold border border-black">HẠN</th>
                          </tr>
                       </thead>
                       <tbody className="align-top">
                          {pendingTasks.map((t, idx) => {
                             const isOverdue = t.status === TaskStatus.OVERDUE;
                             
                             const today = new Date();
                             today.setHours(0,0,0,0);
                             const dueDate = new Date(t.dueDate);
                             dueDate.setHours(0,0,0,0);
                             const diffTime = dueDate.getTime() - today.getTime();
                             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                             const isDueSoon = diffDays >= 0 && diffDays <= 3;
                             const isNotAccepted = !t.acceptedAt;

                             // Get assignee names
                             const assigneeNames = t.assigneeIds.map(id => users.find(u => u.id === id)?.fullName).filter(Boolean).join(', ');

                             return (
                                <tr key={t.id}>
                                   <td className="p-2 text-center border border-black align-middle">{idx + 1}</td>
                                   <td className="p-2 border border-black align-top">
                                      <div className="font-bold text-black leading-relaxed text-justify">{t.title}</div>
                                      {t.dispatchNumber && <div className="text-[11px] italic mt-1">Số hiệu: {t.dispatchNumber}</div>}
                                   </td>
                                   <td className="p-2 border border-black align-top font-medium">
                                      {assigneeNames || <span className="italic text-stone-400">Chưa giao</span>}
                                   </td>
                                   <td className="p-2 text-center border border-black align-middle">
                                      <div className="flex flex-col items-center gap-1">
                                        {isOverdue && <span className="font-bold text-red-600 text-[10px] border border-red-600 px-1 rounded bg-red-50">QUÁ HẠN</span>}
                                        {isDueSoon && !isOverdue && <span className="font-bold text-orange-600 text-[10px] border border-orange-600 px-1 rounded bg-orange-50">SẮP HẠN</span>}
                                        {isNotAccepted && <span className="font-bold text-stone-500 text-[10px] border border-stone-500 px-1 rounded bg-stone-50">CHƯA NHẬN</span>}
                                        {!isOverdue && !isDueSoon && !isNotAccepted && <span className="text-[11px]">Đang làm</span>}
                                      </div>
                                   </td>
                                   <td className={`p-2 text-center border border-black align-middle font-bold ${isOverdue ? 'text-red-700' : 'text-black'}`}>
                                      {new Date(t.dueDate).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit', year: 'numeric'})}
                                   </td>
                                </tr>
                             );
                          })}
                       </tbody>
                    </table>
                 )}
              </div>

              {/* Note */}
              <div className="text-[13px] italic mb-10 text-stone-600">
                  * Yêu cầu các đồng chí báo cáo kết quả đúng hạn trên hệ thống.
              </div>

              {/* Footer */}
              <div className="flex justify-end text-center">
                 <div className="w-[250px]">
                    <p className="text-[13px] font-bold uppercase mb-1">CHỈ HUY ĐƠN VỊ</p>
                    <div className="h-32"></div>
                    <p className="text-[13px] font-bold uppercase">BAN CHỈ HUY TỔ</p>
                 </div>
              </div>
              
           </div>

        </div>

        {/* Floating Action Button */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-50 pointer-events-none">
           <Button 
             variant="secondary" 
             onClick={handleShare} 
             isLoading={isProcessing} 
             className="pointer-events-auto bg-white hover:bg-stone-100 text-stone-800 border-stone-300 shadow-xl px-6 py-3 text-base rounded-full"
             icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>}
           >
              Lưu Ảnh
           </Button>
           <Button 
             variant="primary" 
             onClick={handleExportPDF} 
             isLoading={isProcessing} 
             className="pointer-events-auto bg-red-700 hover:bg-red-800 border-red-900 shadow-xl px-6 py-3 text-base rounded-full"
             icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>}
           >
              Xuất PDF
           </Button>
        </div>
      </div>
    </div>
  );
};