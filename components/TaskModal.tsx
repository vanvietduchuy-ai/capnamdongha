import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskPriority, TaskStatus, User, UserRole, RecurringType, ManagerResponse } from '../types';
import { Button, Input, Select, MultiSelect } from './UI';
import { GeminiService } from '../services/geminiService';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (id: string) => void;
  initialTask?: Task | null;
  users: User[];
  currentUser: User;
  initialDueDate?: string; 
}

// Helper for safe rendering input value
const ensureString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.title || val.content || val.message || JSON.stringify(val);
  }
  return String(val);
};

export const TaskModal: React.FC<TaskModalProps> = ({ 
  isOpen, onClose, onSave, onDelete, initialTask, users, currentUser, initialDueDate
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposal, setProposal] = useState('');
  const [dispatchNumber, setDispatchNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [issueDate, setIssueDate] = useState('');
  
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  
  const [dueDate, setDueDate] = useState('');
  const [isRegularDuty, setIsRegularDuty] = useState(false);

  const [status, setStatus] = useState<TaskStatus>(TaskStatus.PENDING);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  
  const [recurring, setRecurring] = useState<RecurringType[]>([]);
  
  const [acceptedAt, setAcceptedAt] = useState<number | undefined>(undefined);
  
  const [isImageScanning, setIsImageScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiSuggestedSteps, setAiSuggestedSteps] = useState<string[]>([]);
  
  const [managerResponseType, setManagerResponseType] = useState<'AGREE' | 'REJECT' | 'OTHER' | null>(null);
  const [managerResponseContent, setManagerResponseContent] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLeader = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.DEPUTY || currentUser.role === UserRole.ADMIN;
  const isCreator = initialTask?.creatorId === currentUser.id;
  const isCreatingPersonalTask = !initialTask && currentUser.role === UserRole.OFFICER;

  const canEditDetails = isLeader || !initialTask || isCreator;
  const isAssignee = initialTask?.assigneeIds.includes(currentUser.id);
  const isAccepted = !!acceptedAt;

  useEffect(() => {
    if (initialTask) {
      setTitle(ensureString(initialTask.title));
      setDescription(ensureString(initialTask.description));
      setProposal(ensureString(initialTask.proposal));
      setDispatchNumber(ensureString(initialTask.dispatchNumber));
      setIssuingAuthority(ensureString(initialTask.issuingAuthority));
      setIssueDate(ensureString(initialTask.issueDate));
      
      if (initialTask.assigneeIds && initialTask.assigneeIds.length > 0) {
          setAssigneeIds(initialTask.assigneeIds);
      } else if ((initialTask as any).assigneeId) {
          setAssigneeIds([(initialTask as any).assigneeId]);
      } else {
          setAssigneeIds([]);
      }

      setDueDate(initialTask.dueDate.split('T')[0]);
      setIsRegularDuty(!!initialTask.isRegularDuty);

      setStatus(initialTask.status);
      setPriority(initialTask.priority);
      
      if (Array.isArray(initialTask.recurring)) {
          setRecurring(initialTask.recurring);
      } else if (initialTask.recurring && initialTask.recurring !== RecurringType.NONE) {
          setRecurring([initialTask.recurring as unknown as RecurringType]);
      } else {
          setRecurring([]);
      }
      
      setAcceptedAt(initialTask.acceptedAt);
      setAiSuggestedSteps(initialTask.aiSuggestedSteps || []);
      
      if (initialTask.managerResponse) {
        setManagerResponseType(initialTask.managerResponse.type);
        setManagerResponseContent(ensureString(initialTask.managerResponse.content));
      } else {
        setManagerResponseType(null);
        setManagerResponseContent('');
      }

    } else {
      resetForm();
    }
  }, [initialTask, isOpen]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setProposal('');
    setDispatchNumber('');
    setIssuingAuthority('');
    setIssueDate('');
    
    if (!isLeader) {
        setAssigneeIds([currentUser.id]);
    } else {
        // Updated: Empty by default so leader can search
        setAssigneeIds([]);
    }
    
    setDueDate(initialDueDate || new Date().toISOString().split('T')[0]);
    setIsRegularDuty(false);
    
    setStatus(currentUser.role === UserRole.OFFICER ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);
    setPriority(TaskPriority.MEDIUM);
    setRecurring([]);
    setAcceptedAt(undefined);
    setAiSuggestedSteps([]);
    setManagerResponseType(null);
    setManagerResponseContent('');
    setScanError(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImageScanning(true);
    setScanError(null);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const result = await GeminiService.extractDocumentDetails(base64String, file.type);
        
        if (result.abstract) setTitle(result.abstract);
        else setTitle("Văn bản chỉ đạo mới");

        if (result.dispatchNumber) setDispatchNumber(result.dispatchNumber);
        if (result.issuingAuthority) setIssuingAuthority(result.issuingAuthority);
        if (result.issueDate) setIssueDate(result.issueDate);
        
        if (result.deadline) setDueDate(result.deadline);
        
        if (!result.abstract && !result.dispatchNumber) {
            setScanError("Hệ thống trích xuất văn bản gặp lỗi hoặc ảnh mờ. Đồng chí vui lòng thử lại.");
        }

        setIsImageScanning(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setScanError("Hệ thống trích xuất văn bản gặp lỗi. Đồng chí vui lòng thử lại.");
      setIsImageScanning(false);
    }
  };

  const handleRecurringChange = (type: RecurringType) => {
    setRecurring(prev => {
        if (prev.includes(type)) {
            return prev.filter(t => t !== type);
        } else {
            return [...prev, type];
        }
    });
  };

  const constructTaskFromState = (): Task => {
    let managerResponse: ManagerResponse | undefined = undefined;
    if (managerResponseType) {
       managerResponse = {
         type: managerResponseType,
         content: managerResponseContent,
         respondedAt: Date.now()
       };
    }

    const isPersonal = !initialTask && currentUser.role === UserRole.OFFICER;
    let finalStatus = isPersonal ? TaskStatus.IN_PROGRESS : status;
    const finalAcceptedAt = isPersonal ? Date.now() : acceptedAt;

    const finalDueDate = isRegularDuty ? (dueDate || new Date().toISOString()) : new Date(dueDate).toISOString();

    if (finalStatus === TaskStatus.OVERDUE && !isRegularDuty) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const newDueStart = new Date(dueDate);
        newDueStart.setHours(0, 0, 0, 0);

        if (newDueStart >= todayStart) {
            finalStatus = finalAcceptedAt ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING;
        }
    }

    // Removed calendarSequence logic here
    
    return {
      id: initialTask ? initialTask.id : Date.now().toString(),
      title: title || "Nhiệm vụ mới",
      description,
      proposal,
      dispatchNumber,
      issuingAuthority,
      issueDate,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : [currentUser.id],
      creatorId: initialTask ? initialTask.creatorId : currentUser.id,
      status: finalStatus,
      priority: priority,
      recurring: recurring.length > 0 ? recurring : [RecurringType.NONE],
      dueDate: finalDueDate,
      isRegularDuty,
      createdAt: initialTask ? initialTask.createdAt : Date.now(),
      acceptedAt: finalAcceptedAt, 
      aiSuggestedSteps,
      managerResponse,
      isProposalRead: (isLeader && proposal) ? true : initialTask?.isProposalRead,
    };
  };

  const handleSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (assigneeIds.length === 0) {
        alert("Vui lòng chọn ít nhất một cán bộ thực hiện.");
        return;
    }
    const task = constructTaskFromState();
    onSave(task);
  };

  const handleAcceptTask = () => {
     const now = Date.now();
     setAcceptedAt(now);
     const newStatus = status === TaskStatus.PENDING ? TaskStatus.IN_PROGRESS : status;
     setStatus(newStatus);
     const task = constructTaskFromState();
     task.acceptedAt = now;
     task.status = newStatus;
     onSave(task);
  };

  if (!isOpen) return null;

  const canAssignAny = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CHIEF;

  const assignableUsers = users.filter(u => {
    if (canAssignAny) return true;
    return u.department === currentUser.department;
  });

  const sortedUsers = [...assignableUsers].sort((a, b) => {
    if (a.role === b.role) return a.fullName.localeCompare(b.fullName);
    const roleOrder = { 
      [UserRole.ADMIN]: 0, 
      [UserRole.CHIEF]: 1, 
      [UserRole.DEPUTY_CHIEF]: 2, 
      [UserRole.MANAGER]: 3, 
      [UserRole.DEPUTY]: 4, 
      [UserRole.OFFICER]: 5 
    };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  const assigneeOptions = sortedUsers.map(u => ({
    value: u.id,
    label: `${u.fullName} (${
      u.role === UserRole.ADMIN ? 'Quản trị viên' : 
      u.role === UserRole.CHIEF ? 'Trưởng CA' : 
      u.role === UserRole.DEPUTY_CHIEF ? 'Phó Trưởng CA' : 
      u.role === UserRole.MANAGER ? 'Tổ trưởng' : 
      u.role === UserRole.DEPUTY ? 'Tổ phó' : 'Cán bộ'
    })`
  }));

  const showProposalSection = (isAssignee && !!initialTask && !isCreator) || (proposal && proposal.trim() !== '');

  const modalTitle = initialTask 
      ? (isLeader || isCreator ? 'Cập nhật nhiệm vụ' : 'Chi tiết nhiệm vụ') 
      : (isLeader ? 'Giao Nhiệm Vụ Mới' : 'Thêm Nhiệm vụ Cá nhân');

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-stone-900/60 backdrop-blur-sm transition-all p-0 md:p-4">
      <div className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[95vh] md:rounded-3xl rounded-none shadow-2xl overflow-hidden flex flex-col animate-fade-in-up md:border-t-0 md:border-none">
        
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-stone-100 flex justify-between items-center sticky top-0 z-20 shadow-sm shrink-0">
          <div className="flex-1">
             <div className="flex items-center gap-2">
                 <h2 className="text-xl font-extrabold text-red-900 uppercase tracking-tight">
                   {modalTitle}
                 </h2>
                 {initialTask && isAccepted && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold border border-green-200">
                      ĐÃ TIẾP NHẬN
                    </span>
                 )}
                 {initialTask && isCreator && !isLeader && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold border border-amber-200">
                      CÁ NHÂN
                    </span>
                 )}
             </div>
             <p className="text-xs text-stone-500 font-medium">Nhập thông tin chi tiết công việc.</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Body - Flex-1 with overflow auto ensures it scrolls correctly without pushing footer */}
        <div className="flex-1 overflow-y-auto bg-white min-h-0 relative">
          <form className="p-5 md:p-8 pb-32 md:pb-8">
          
          {/* Section 1: Scan & Basic Info */}
          <div className="mb-8">
             {canEditDetails && !initialTask && (
                <div 
                   onClick={() => !isImageScanning && fileInputRef.current?.click()}
                   className="mb-6 border border-dashed border-yellow-400 bg-yellow-50/30 rounded-xl p-3 flex items-center justify-center gap-3 cursor-pointer hover:bg-yellow-50 transition-colors group"
                >
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                   {isImageScanning ? (
                     <div className="flex items-center gap-2 text-yellow-700 font-bold text-sm animate-pulse">
                        <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                        Đang xử lý ảnh văn bản...
                     </div>
                   ) : (
                     <div className="flex items-center gap-2 text-stone-400 group-hover:text-yellow-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <span className="text-sm font-bold uppercase">Chụp ảnh văn bản để điền tự động</span>
                     </div>
                   )}
                </div>
             )}

             <div className="flex items-center gap-2 mb-4">
               <span className="w-1 h-4 bg-red-700 rounded-full"></span>
               <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wide">1. Thông tin văn bản</h3>
             </div>

             <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12">
                   <Input
                      label="Trích yếu văn bản"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="VD: Kế hoạch tuần tra kiểm soát..."
                      disabled={!canEditDetails}
                      className="bg-stone-50 border-stone-200 font-bold text-stone-800"
                   />
                </div>
                <div className="col-span-6 md:col-span-4">
                   <Input
                      label="Số hiệu văn bản"
                      value={dispatchNumber}
                      onChange={(e) => setDispatchNumber(e.target.value)}
                      placeholder="VD: 123/KH-CAT"
                      disabled={!canEditDetails}
                      className="bg-stone-50"
                   />
                </div>
                <div className="col-span-6 md:col-span-3">
                   <Input
                      type="date"
                      label="Ngày ban hành"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      disabled={!canEditDetails}
                      className="bg-stone-50"
                   />
                </div>
                <div className="col-span-12 md:col-span-5">
                   <Input
                      label="Cơ quan"
                      value={issuingAuthority}
                      onChange={(e) => setIssuingAuthority(e.target.value)}
                      placeholder="VD: CAT"
                      disabled={!canEditDetails}
                      className="bg-stone-50"
                   />
                </div>
             </div>
          </div>

          {/* Section 2: Assignment Details */}
          <div className="mb-8">
             <div className="flex items-center gap-2 mb-4">
               <span className="w-1 h-4 bg-amber-500 rounded-full"></span>
               <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wide">2. Nội dung & Phân công</h3>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <MultiSelect
                    label="Cán bộ thực hiện"
                    selectedValues={assigneeIds}
                    onChange={setAssigneeIds}
                    options={assigneeOptions}
                    disabled={!isLeader}
                    className="bg-stone-50 font-semibold"
                  />
                </div>
                <div>
                  <Select
                    label="Độ ưu tiên"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    options={[
                      { value: TaskPriority.LOW, label: 'Thấp' },
                      { value: TaskPriority.MEDIUM, label: 'Trung bình' },
                      { value: TaskPriority.HIGH, label: 'Cao' },
                      { value: TaskPriority.URGENT, label: 'Hỏa tốc' },
                    ]}
                    disabled={!canEditDetails}
                    className={`bg-stone-50 font-semibold ${priority === TaskPriority.URGENT ? 'text-red-600 border-red-200' : ''}`}
                  />
                </div>
             </div>

             <div>
                <label className="block text-sm font-bold text-red-900 mb-1.5">Nội dung chỉ đạo chi tiết</label>
                <textarea
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl bg-stone-50 text-stone-800 font-medium placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all h-32 resize-none shadow-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEditDetails}
                  placeholder="Nhập nội dung chỉ đạo cụ thể..."
                />
             </div>
          </div>

          {/* Section 3: Time & Recurring */}
          <div>
             <div className="flex items-center gap-2 mb-4">
               <span className="w-1 h-4 bg-stone-400 rounded-full"></span>
               <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wide">3. Thời hạn & Thiết lập</h3>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                <div className="w-full">
                   <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-sm font-bold text-red-900">Hạn hoàn thành</label>
                      {canEditDetails && (
                        <div className="flex items-center gap-2">
                           <input 
                             type="checkbox" 
                             id="regularDuty" 
                             checked={isRegularDuty} 
                             onChange={(e) => setIsRegularDuty(e.target.checked)}
                             className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                           />
                           <label htmlFor="regularDuty" className="text-xs font-bold text-stone-500 cursor-pointer select-none">Công tác thường xuyên</label>
                        </div>
                      )}
                   </div>
                   
                   {!isRegularDuty ? (
                     <Input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        disabled={!canEditDetails}
                        className="bg-stone-50 text-red-700 font-bold border-stone-200 w-full"
                     />
                   ) : (
                     <div className="w-full px-4 py-2.5 border border-dashed border-stone-300 rounded-xl bg-stone-100 text-stone-500 font-medium italic flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Không áp dụng thời hạn cụ thể
                     </div>
                   )}
                   
                   {(canEditDetails || isAssignee) && initialTask && (
                     <div className="mt-4">
                        <Select
                            label="Trạng thái hiện tại"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as TaskStatus)}
                            options={[
                                { value: TaskStatus.PENDING, label: '⚪ Chờ xử lý' },
                                { value: TaskStatus.IN_PROGRESS, label: '🟡 Đang thực hiện' },
                                { value: TaskStatus.COMPLETED, label: '🟢 Hoàn thành' },
                                ...((isLeader || isCreator) ? [{ value: TaskStatus.CANCELLED, label: '⚫ Hủy bỏ' }] : [])
                            ]}
                            className="bg-white font-bold"
                        />
                     </div>
                   )}
                </div>

                {(isLeader || isCreator || isCreatingPersonalTask) && (
                   <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 block">Chu kỳ lặp lại</label>
                      <div className="flex flex-wrap gap-2">
                         {[
                           { type: RecurringType.WEEKLY, label: 'Tuần' },
                           { type: RecurringType.MONTHLY, label: 'Tháng' },
                           { type: RecurringType.QUARTERLY, label: 'Quý' },
                           { type: RecurringType.ANNUALLY, label: 'Năm' }
                         ].map(opt => {
                            const isSelected = recurring.includes(opt.type);
                            return (
                              <button
                                 key={opt.type}
                                 type="button"
                                 onClick={() => handleRecurringChange(opt.type)}
                                 className={`px-3 py-2 rounded-lg text-xs font-bold border shadow-sm transition-all flex-1 text-center ${
                                   isSelected 
                                     ? 'bg-amber-500 text-white border-amber-600 shadow-amber-200' 
                                     : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                                 }`}
                              >
                                 {isSelected && '✓'} {opt.label}
                              </button>
                            );
                         })}
                      </div>
                      <p className="text-[10px] text-stone-400 mt-2 italic text-center">Chọn để tự động tạo công việc mới khi hoàn thành.</p>
                   </div>
                )}
             </div>
          </div>

          {/* Error Message Simulation */}
          {scanError && (
             <div className="mt-6 flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100 animate-pulse">
                <div className="w-1 h-10 bg-red-600 rounded-full shrink-0"></div>
                <p className="text-sm font-bold text-red-700 leading-snug">{scanError}</p>
             </div>
          )}

          {/* Proposal Section */}
          {showProposalSection && (
            <div className="mt-8 pt-6 border-t border-dashed border-stone-300">
              <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                <div className="flex justify-between items-center mb-2">
                   <label className="text-xs font-bold text-blue-800 uppercase">Ý kiến / Đề xuất của Cán bộ</label>
                   {isLeader && proposal && !initialTask?.isProposalRead && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">Mới</span>}
                </div>
                <textarea
                  className="w-full px-4 py-3 border border-blue-200 rounded-xl bg-white h-24 text-sm focus:ring-blue-200 focus:border-blue-400"
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                  disabled={!isAssignee && !isLeader} 
                  placeholder="Nhập đề xuất..."
                />
              </div>

              {proposal && (
                <div className="mt-4 p-5 rounded-2xl border border-stone-200 bg-stone-50">
                   <label className="text-xs font-bold text-red-900 uppercase mb-3 block">Chỉ đạo / Phản hồi của Chỉ huy</label>
                   {isLeader ? (
                     <div className="space-y-3">
                        <div className="flex gap-2">
                           {['AGREE', 'REJECT', 'OTHER'].map((type) => (
                             <button 
                               key={type}
                               type="button"
                               onClick={() => setManagerResponseType(type as any)}
                               className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${managerResponseType === type 
                                 ? (type === 'AGREE' ? 'bg-green-600 text-white border-green-700' : type === 'REJECT' ? 'bg-red-600 text-white border-red-700' : 'bg-stone-600 text-white border-stone-700') 
                                 : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'}`}
                             >
                               {type === 'AGREE' ? 'Đồng ý' : type === 'REJECT' ? 'Từ chối' : 'Khác'}
                             </button>
                           ))}
                        </div>
                        <textarea
                          className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm bg-white"
                          value={managerResponseContent}
                          onChange={(e) => setManagerResponseContent(e.target.value)}
                          placeholder="Nhập nội dung phản hồi..."
                        />
                     </div>
                   ) : (
                      managerResponseType && (
                       <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-stone-100">
                          <div className={`mt-1 w-2 h-2 rounded-full ${managerResponseType === 'AGREE' ? 'bg-green-500' : (managerResponseType === 'REJECT' ? 'bg-red-500' : 'bg-stone-500')}`}></div>
                          <div>
                             <p className={`text-sm font-bold ${managerResponseType === 'AGREE' ? 'text-green-700' : (managerResponseType === 'REJECT' ? 'text-red-700' : 'text-stone-700')}`}>
                               {managerResponseType === 'AGREE' ? 'ĐỒNG Ý' : (managerResponseType === 'REJECT' ? 'TỪ CHỐI' : 'CHỈ ĐẠO KHÁC')}
                             </p>
                             {managerResponseContent && <p className="text-sm text-stone-600 mt-1">{managerResponseContent}</p>}
                          </div>
                       </div>
                      )
                   )}
                </div>
              )}
            </div>
          )}
          </form>
        </div>

        {/* Footer - Use explicit z-index and padding to ensure visibility on mobile */}
        <div className="shrink-0 p-4 pb-12 md:px-8 md:py-5 bg-white border-t border-stone-100 flex flex-col md:flex-row gap-3 relative z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
           {!initialTask ? (
             <div className="flex w-full gap-3">
               <Button 
                 type="button"
                 variant="secondary" 
                 onClick={onClose} 
                 className="flex-1 py-3 rounded-xl text-sm font-bold border-stone-300 text-stone-600 hover:bg-stone-100"
               >
                 Huỷ bỏ
               </Button>
               <button 
                 type="button"
                 onClick={handleSubmit} 
                 className="flex-1 py-3 rounded-xl bg-red-800 hover:bg-red-900 text-white text-sm font-bold uppercase tracking-wide shadow-lg shadow-red-900/20 active:scale-[0.98] transition-all"
               >
                  {isLeader ? 'Xác nhận giao việc' : 'Lưu việc cá nhân'}
               </button>
             </div>
           ) : (
             isAssignee && !isAccepted && !isCreator && !isCreatingPersonalTask ? (
                <button
                  type="button"
                  onClick={handleAcceptTask}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-bold uppercase tracking-wide shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Xác nhận tiếp nhận
                </button>
             ) : (
               canEditDetails || isAssignee ? (
                 <div className="flex-1 flex gap-3">
                   {(isLeader || isCreator) && onDelete && (
                     <Button 
                       type="button"
                       variant="secondary" 
                       onClick={() => onDelete(initialTask.id)} 
                       className="flex-shrink-0 px-5 py-3 rounded-xl text-sm font-bold text-red-600 border-red-200 hover:bg-red-50"
                       title="Xóa nhiệm vụ"
                     >
                       Xóa
                     </Button>
                   )}
                   <button 
                     type="button"
                     onClick={handleSubmit} 
                     className="flex-1 py-3 rounded-xl bg-red-800 hover:bg-red-900 text-white text-sm font-bold uppercase tracking-wide shadow-lg shadow-red-900/20 active:scale-[0.98] transition-all"
                   >
                      Cập nhật
                   </button>
                 </div>
               ) : (
                 <Button type="button" variant="secondary" onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold">Đóng</Button>
               )
             )
           )}
        </div>
      </div>
    </div>
  );
};