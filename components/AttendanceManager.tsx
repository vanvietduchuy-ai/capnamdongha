import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { MockDB } from '../services/mockDatabase';
import { User, AttendanceRecord, AttendanceSession, UserDepartment, UserRole, UserPermission, UserGroup } from '../types';
import { Button, Input } from './UI';

interface AttendanceManagerProps {
  currentUser: User;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({ currentUser }) => {
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);
  
  // Đồng bộ với quy tắc phân quyền ở App: Quản trị viên, Trưởng/Phó Trưởng CAP
  // hoặc cán bộ được cấp quyền riêng.
  const canManageAttendance = currentUser.role === UserRole.ADMIN ||
                             currentUser.role === UserRole.CHIEF ||
                             currentUser.role === UserRole.DEPUTY_CHIEF ||
                             !!currentUser.permissions?.includes(UserPermission.MANAGE_ATTENDANCE);

  // Form state for new session
  const [title, setTitle] = useState('');
  const [endTimeMode, setEndTimeMode] = useState<'DURATION' | 'TIME'>('DURATION');
  const [durationMinutes, setDurationMinutes] = useState<number | string>(30);
  const [endTime, setEndTime] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSelectedUserIds, setGroupSelectedUserIds] = useState<string[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summaryStats, setSummaryStats] = useState<{
      session: AttendanceSession;
      total: number;
      present: number;
      absent: number;
      guests: number;
      absentUsers: User[];
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  
  // Refs for accessing state in interval/async closures
  const activeSessionRef = useRef(activeSession);
  const recordsRef = useRef(records);
  const usersRef = useRef(users);
  
  // Dynamic QR Code State
  const [qrValue, setQrValue] = useState('');
  // OFFICER: cán bộ quét bằng ứng dụng; GUEST: khách mời quét bằng camera điện thoại (mở trang web)
  const [qrMode, setQrMode] = useState<'OFFICER' | 'GUEST'>('OFFICER');

  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => { usersRef.current = users; }, [users]);

  const calculateStats = (session: AttendanceSession, currentRecords: AttendanceRecord[], currentUsers: User[]) => {
      const expected = Array.isArray(session.expectedUserIds) ? session.expectedUserIds : [];
      const checkedIn = new Set(currentRecords.filter(r => r.sessionId === session.id).map(r => r.userId));
      const absentIds = expected.filter(id => !checkedIn.has(id));
      // Người vắng mà không nằm trong danh sách hiển thị vẫn phải có tên trong kết quả
      const absentUsers = absentIds.map(id =>
          currentUsers.find(u => u.id === id) ||
          ({ id, username: id, fullName: `(Tài khoản đã xoá: ${id})`, role: UserRole.OFFICER } as User)
      );

      return {
          session,
          total: expected.length,
          present: expected.filter(id => checkedIn.has(id)).length,
          absent: absentIds.length,
          guests: Array.from(checkedIn).filter(id => !expected.includes(id)).length,
          absentUsers
      };
  };

  const loadData = async () => {
    const fetchedSession = await MockDB.getActiveSession();
    
    // Check for natural expiration (Auto-End)
    const currentSession = activeSessionRef.current;
    if (!fetchedSession && currentSession && currentSession.isActive) {
        // DB says no active session, but we had one. 
        // Check if it expired by time
        if (Date.now() > currentSession.expiresAt) {
            // It expired! Show summary immediately
            const stats = calculateStats(currentSession, recordsRef.current, usersRef.current);
            setSummaryStats(stats);
            
            // Clean up DB status
            await MockDB.endSession(currentSession.id);
        }
    }

    setActiveSession(fetchedSession);
    
    if (fetchedSession) {
        const attData = await MockDB.getAttendanceRecords(fetchedSession.id);
        setRecords(attData);
    } else {
        setRecords([]);
    }

    const userData = await MockDB.getUsers();
    const groupData = await MockDB.getUserGroups();
    setUserGroups(groupData);
    
    const canSeeAll = currentUser.role === UserRole.ADMIN || 
                     currentUser.role === UserRole.CHIEF || 
                     (currentUser.role === UserRole.DEPUTY_CHIEF && currentUser.department === UserDepartment.PHU_TRACH_CHUNG) ||
                     canManageAttendance;

    // Filter out ADMIN users and restrict by department if necessary
    const eligibleUsers = userData.filter(u => {
        if (u.role === UserRole.ADMIN) return false;
        if (canSeeAll) return true;
        return u.department === currentUser.department;
    });
    setUsers(eligibleUsers);
  };

  useEffect(() => {
    loadData();
    // Subscribe to realtime changes
    const unsubscribe = MockDB.subscribe(loadData);
    
    // Keep polling as backup (less frequent)
    const interval = setInterval(loadData, 10000); // Dự phòng; cập nhật chính nhờ đồng bộ tức thời
    
    return () => {
        unsubscribe();
        clearInterval(interval);
    };
  }, []); // Empty dependency array is fine because loadData uses refs for state access

  // Update Dynamic QR Code every 5 seconds
  useEffect(() => {
      if (activeSession && activeSession.isActive) {
          const updateQr = () => {
              if (qrMode === 'GUEST') {
                  // Liên kết cho khách mời, kèm cấu hình máy chủ để điện thoại lạ vẫn kết nối được
                  let c = '';
                  try {
                      const raw = localStorage.getItem('cloudConfig');
                      if (raw) {
                          const cfg = JSON.parse(raw);
                          if (cfg.supabaseUrl && cfg.supabaseKey) {
                              c = btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.supabaseUrl, k: cfg.supabaseKey }))));
                          }
                      }
                  } catch { /* bỏ qua */ }
                  const base = `${window.location.origin}/?guest_session=${encodeURIComponent(activeSession.id)}&t=${Date.now()}`;
                  setQrValue(c ? `${base}&c=${encodeURIComponent(c)}` : base);
              } else {
                  // Format: sessionId|timestamp
                  setQrValue(`${activeSession.id}|${Date.now()}`);
              }
          };
          
          updateQr(); // Initial update
          const qrInterval = setInterval(updateQr, 5000); // Update every 5s
          
          return () => clearInterval(qrInterval);
      }
  }, [activeSession, qrMode]);

  const handleExportImage = async () => {
    if (summaryRef.current) {
        try {
            const dataUrl = await toPng(summaryRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `ket-qua-diem-danh-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to export image', err);
        }
    }
  };

  const handleExportPDF = async () => {
    if (summaryRef.current) {
        try {
            const dataUrl = await toPng(summaryRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
            const pdf = new jsPDF();
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`ket-qua-diem-danh-${Date.now()}.pdf`);
        } catch (err) {
            console.error('Failed to export PDF', err);
        }
    }
  };

  // Xuất báo cáo vắng mặt của phiên vừa kết thúc (Word đúng thể thức NĐ30 / Excel)
  const exportSessionReport = async (kind: 'DOCX' | 'XLSX') => {
      if (!summaryStats) return;
      setExporting(true);
      try {
          const svc = await import('../services/absenceReportService');
          const s = summaryStats.session;
          const [recs, abs, allUsers] = await Promise.all([
              MockDB.getAttendanceRecords(s.id),
              MockDB.getAbsences([s.id]),
              MockDB.getUsers()
          ]);
          const rep = svc.buildAbsenceReport([s], recs, abs, allUsers, s.createdAt, s.expiresAt);
          if (kind === 'DOCX') {
              let signer = { chucDanh: 'TRƯỞNG CÔNG AN PHƯỜNG', hoTen: '' };
              try {
                  const raw = localStorage.getItem('absence_report_signer');
                  if (raw) signer = JSON.parse(raw);
              } catch { /* bỏ qua */ }
              await svc.exportAbsenceWord(rep, signer);
          } else {
              await svc.exportAbsenceExcel(rep);
          }
      } catch (err) {
          console.error('Xuất báo cáo thất bại', err);
          alert('Có lỗi khi xuất báo cáo. Vui lòng thử lại.');
      } finally {
          setExporting(false);
      }
  };

  const handleSelectByDept = (dept: string) => {
      const usersInDept = users.filter(u => u.department === dept).map(u => u.id);
      // Toggle logic: if all in dept are selected, deselect them. Otherwise select all in dept.
      const allSelected = usersInDept.every(id => selectedUserIds.includes(id));
      
      if (allSelected) {
          setSelectedUserIds(selectedUserIds.filter(id => !usersInDept.includes(id)));
      } else {
          setSelectedUserIds([...new Set([...selectedUserIds, ...usersInDept])]);
      }
  };

  const handleSelectByRole = (roleType: 'LEADERS' | 'OFFICERS') => {
      const targetUsers = users.filter(u => {
          if (roleType === 'LEADERS') {
              return u.role === 'CHIEF' || u.role === 'DEPUTY_CHIEF' || u.role === 'MANAGER' || u.role === 'DEPUTY';
          }
          return u.role === 'OFFICER';
      }).map(u => u.id);

      const allSelected = targetUsers.every(id => selectedUserIds.includes(id));
      
      if (allSelected) {
          setSelectedUserIds(selectedUserIds.filter(id => !targetUsers.includes(id)));
      } else {
          setSelectedUserIds([...new Set([...selectedUserIds, ...targetUsers])]);
      }
  };

  const handleSelectByGroup = (groupId: string) => {
      const group = userGroups.find(g => g.id === groupId);
      if (!group) return;
      
      const targetUsers = group.userIds.filter(id => users.some(u => u.id === id));
      const allSelected = targetUsers.every(id => selectedUserIds.includes(id));
      
      if (allSelected) {
          setSelectedUserIds(selectedUserIds.filter(id => !targetUsers.includes(id)));
      } else {
          setSelectedUserIds([...new Set([...selectedUserIds, ...targetUsers])]);
      }
  };

  const handleGroupSelectByDept = (dept: string) => {
      const usersInDept = users.filter(u => u.department === dept).map(u => u.id);
      const allSelected = usersInDept.every(id => groupSelectedUserIds.includes(id));
      
      if (allSelected) {
          setGroupSelectedUserIds(groupSelectedUserIds.filter(id => !usersInDept.includes(id)));
      } else {
          setGroupSelectedUserIds([...new Set([...groupSelectedUserIds, ...usersInDept])]);
      }
  };

  const handleStartEditGroup = (group: UserGroup) => {
      setEditingGroupId(group.id);
      setNewGroupName(group.name);
      setGroupSelectedUserIds(group.userIds);
  };

  const handleCancelEditGroup = () => {
      setEditingGroupId(null);
      setNewGroupName('');
      setGroupSelectedUserIds([]);
  };

  const handleCreateGroup = async () => {
      if (!newGroupName.trim()) {
          alert("Vui lòng nhập tên nhóm.");
          return;
      }
      if (groupSelectedUserIds.length === 0) {
          alert("Vui lòng chọn ít nhất 1 cán bộ để tạo nhóm.");
          return;
      }
      
      if (editingGroupId) {
          const updatedGroup: UserGroup = {
              id: editingGroupId,
              name: newGroupName.trim(),
              userIds: groupSelectedUserIds,
              creatorId: currentUser.id
          };
          await MockDB.updateUserGroup(updatedGroup);
          setEditingGroupId(null);
          alert("Cập nhật nhóm thành công!");
      } else {
          const newGroup: UserGroup = {
              id: `group_${Date.now()}`,
              name: newGroupName.trim(),
              userIds: groupSelectedUserIds,
              creatorId: currentUser.id
          };
          await MockDB.createUserGroup(newGroup);
          alert("Tạo nhóm thành công!");
      }
      
      setNewGroupName('');
      setGroupSelectedUserIds([]);
      loadData();
  };

  const handleDeleteGroup = async (groupId: string) => {
      if (window.confirm("Bạn có chắc chắn muốn xóa nhóm này?")) {
          await MockDB.deleteUserGroup(groupId);
          loadData();
      }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;
      if (selectedUserIds.length === 0) {
          alert('Vui lòng chọn ít nhất 1 cán bộ tham gia.');
          return;
      }

      const now = Date.now();
      let expiresAt = now;

      if (endTimeMode === 'DURATION') {
          const duration = typeof durationMinutes === 'string' ? parseInt(durationMinutes) || 0 : durationMinutes;
          if (duration <= 0) {
              alert('Vui lòng nhập số phút hợp lệ.');
              return;
          }
          expiresAt = now + (duration * 60 * 1000);
      } else {
          if (!endTime) {
              alert('Vui lòng chọn thời gian kết thúc.');
              return;
          }
          const endDate = new Date(endTime);
          
          if (endDate.getTime() < now) {
               alert('Thời gian kết thúc phải lớn hơn thời gian hiện tại.');
               return;
          }
          expiresAt = endDate.getTime();
      }

      const newSession: AttendanceSession = {
          id: `sess_${now}`,
          title: title.trim(),
          creatorId: currentUser.id,
          createdAt: now,
          expiresAt: expiresAt,
          isActive: true,
          expectedUserIds: selectedUserIds
      };

      try {
          await MockDB.createAttendanceSession(newSession);
      } catch (err: any) {
          alert(err?.message || 'Không tạo được phiên điểm danh.');
          return;
      }
      setTitle('');
      setDurationMinutes(30);
      setEndTime('');
      loadData();
  };

  const handleEndSession = async () => {
      if (activeSession) {
          // Calculate stats before ending
          const stats = calculateStats(activeSession, records, users);
          setSummaryStats(stats);

          await MockDB.endSession(activeSession.id);
          loadData();
      }
  };

  const handleExtendSession = async (minutes: number) => {
      if (activeSession) {
          const newExpiresAt = activeSession.expiresAt + (minutes * 60 * 1000);
          try {
              await MockDB.updateAttendanceSession({
                  ...activeSession,
                  expiresAt: newExpiresAt
              });
          } catch (err: any) {
              alert(err?.message || 'Không gia hạn được phiên.');
          }
          loadData();
      }
  };

  const getUserName = (uid: string) => {
    return users.find(u => u.id === uid)?.fullName || uid;
  };

  const getUserDept = (uid: string) => {
    return users.find(u => u.id === uid)?.department || '';
  };

  const isExpired = activeSession ? Date.now() > activeSession.expiresAt : true;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* QR Code Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center space-y-4 md:w-1/3">
          
          {!activeSession || isExpired ? (
              <div className="w-full">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">Tạo mã điểm danh hội nghị</h2>
                  {canManageAttendance ? (
                      <form onSubmit={handleCreateSession} className="space-y-4">
                          <Input 
                            label="Nội dung / Tên hội nghị" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                            placeholder="VD: Giao ban sáng thứ 2..."
                            required 
                          />
                          <div>
                              <div className="flex justify-between items-center mb-1">
                                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider">Thời gian kết thúc</label>
                                  <div className="flex bg-stone-100 rounded-lg p-0.5">
                                      <button 
                                        type="button"
                                        onClick={() => setEndTimeMode('DURATION')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${endTimeMode === 'DURATION' ? 'bg-white text-red-600 shadow-sm' : 'text-stone-500'}`}
                                      >
                                        Số phút
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => setEndTimeMode('TIME')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${endTimeMode === 'TIME' ? 'bg-white text-red-600 shadow-sm' : 'text-stone-500'}`}
                                      >
                                        Giờ cụ thể
                                      </button>
                                  </div>
                              </div>
                              
                              {endTimeMode === 'DURATION' ? (
                                  <>
                                    <div className="flex gap-2 mb-2">
                                        {[15, 30, 60, 120].map(m => (
                                            <button 
                                                key={m}
                                                type="button"
                                                onClick={() => setDurationMinutes(m)}
                                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                                                    Number(durationMinutes) === m 
                                                    ? 'bg-red-600 border-red-700 text-white shadow-sm' 
                                                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                                }`}
                                            >
                                                {m >= 60 ? `${m/60}h` : `${m}p`}
                                            </button>
                                        ))}
                                    </div>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="1440"
                                        value={durationMinutes} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            setDurationMinutes(val === '' ? '' : parseInt(val));
                                        }}
                                        className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all outline-none text-sm font-medium text-stone-800"
                                    />
                                  </>
                              ) : (
                                  <input 
                                    type="datetime-local" 
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all outline-none text-sm font-medium text-stone-800"
                                    required={endTimeMode === 'TIME'}
                                  />
                              )}
                          </div>
                          
                          <div className="relative">
                              <div className="flex justify-between items-center mb-1">
                                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider">Thành phần tham gia ({selectedUserIds.length}/{users.length})</label>
                                  <button type="button" onClick={() => setShowUserSelect(!showUserSelect)} className="text-xs text-red-600 font-bold hover:underline">
                                      {showUserSelect ? 'Thu gọn' : 'Chọn cán bộ'}
                                  </button>
                              </div>
                              {showUserSelect && (
                                  <>
                                  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowUserSelect(false)}>
                                      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                                          <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50 rounded-t-2xl">
                                              <h3 className="font-bold text-lg text-stone-800">Chọn cán bộ tham gia</h3>
                                              <button type="button" onClick={() => setShowUserSelect(false)} className="text-stone-400 hover:text-stone-600">
                                                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                              </button>
                                          </div>
                                          <div className="p-4 border-b border-stone-200 bg-white">
                                              <div className="mb-3">
                                                  <input 
                                                      type="text" 
                                                      placeholder="Tìm kiếm cán bộ..." 
                                                      value={searchQuery}
                                                      onChange={(e) => setSearchQuery(e.target.value)}
                                                      className="w-full px-4 py-2 text-sm rounded-xl border border-stone-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                                                  />
                                              </div>
                                              <div className="flex flex-wrap gap-2 mb-3">
                                                  <span className="w-full text-xs font-bold text-stone-500 uppercase mb-1">Chọn nhanh:</span>
                                                  <button type="button" onClick={() => setSelectedUserIds(users.map(u => u.id))} className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 font-bold transition-colors">Tất cả</button>
                                                  <button type="button" onClick={() => setSelectedUserIds([])} className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded-lg hover:bg-stone-200 font-bold transition-colors">Bỏ chọn hết</button>
                                                  <button type="button" onClick={() => handleSelectByRole('LEADERS')} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold transition-colors">Ban chỉ huy & Tổ trưởng</button>
                                                  <button type="button" onClick={() => handleSelectByRole('OFFICERS')} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 font-bold transition-colors">Toàn bộ Cán bộ</button>
                                              </div>
                                              <div className="flex flex-wrap gap-2 mb-3">
                                                  <span className="w-full text-xs font-bold text-stone-500 uppercase mb-1">Theo tổ công tác:</span>
                                                  {Object.values(UserDepartment).map(dept => {
                                                      const usersInDept = users.filter(u => u.department === dept);
                                                      if (usersInDept.length === 0) return null;
                                                      const isAllSelected = usersInDept.every(u => selectedUserIds.includes(u.id));
                                                      return (
                                                          <button 
                                                            key={dept}
                                                            type="button" 
                                                            onClick={() => handleSelectByDept(dept)} 
                                                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                                                                isAllSelected 
                                                                ? 'bg-orange-100 border-orange-300 text-orange-800' 
                                                                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                                            }`}
                                                          >
                                                            {dept}
                                                          </button>
                                                      );
                                                  })}
                                              </div>
                                              <div className="flex flex-wrap gap-2">
                                                  <div className="w-full flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-stone-500 uppercase">Nhóm tuỳ chọn:</span>
                                                    <button type="button" onClick={() => setShowGroupManager(true)} className="text-xs text-red-600 font-bold hover:underline bg-red-50 px-2 py-1 rounded-md">
                                                        + Quản lý nhóm
                                                    </button>
                                                  </div>
                                                  {userGroups.length === 0 && (
                                                      <span className="text-xs text-stone-400 italic">Chưa có nhóm nào.</span>
                                                  )}
                                                  {userGroups.map(group => {
                                                      const targetUsers = group.userIds.filter(id => users.some(u => u.id === id));
                                                      if (targetUsers.length === 0) return null;
                                                      const isAllSelected = targetUsers.every(id => selectedUserIds.includes(id));
                                                      return (
                                                          <button 
                                                            key={group.id}
                                                            type="button" 
                                                            onClick={() => handleSelectByGroup(group.id)} 
                                                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                                                                isAllSelected 
                                                                ? 'bg-purple-100 border-purple-300 text-purple-800' 
                                                                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                                            }`}
                                                          >
                                                            {group.name} ({targetUsers.length})
                                                          </button>
                                                      );
                                                  })}
                                              </div>
                                          </div>
                                          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-stone-50">
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                  {users.filter(u => u.fullName.toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
                                                      <label key={u.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${selectedUserIds.includes(u.id) ? 'bg-red-50 border-red-200' : 'bg-white border-stone-200 hover:border-red-300'}`}>
                                                          <input 
                                                              type="checkbox" 
                                                              checked={selectedUserIds.includes(u.id)}
                                                              onChange={(e) => {
                                                                  if (e.target.checked) setSelectedUserIds([...selectedUserIds, u.id]);
                                                                  else setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                                                              }}
                                                              className="w-5 h-5 rounded text-red-600 focus:ring-red-500 border-stone-300"
                                                          />
                                                          <div className="flex flex-col">
                                                              <span className="text-sm font-bold text-stone-800">{u.fullName}</span>
                                                              <span className="text-xs text-stone-500">{u.role} • {u.department || 'Chưa phân tổ'}</span>
                                                          </div>
                                                      </label>
                                                  ))}
                                              </div>
                                          </div>
                                          <div className="p-4 border-t border-stone-200 bg-white rounded-b-2xl flex justify-end">
                                              <Button type="button" onClick={() => setShowUserSelect(false)}>Xong ({selectedUserIds.length} đã chọn)</Button>
                                          </div>
                                      </div>
                                  </div>
                                  </>
                              )}
                          </div>

                          <Button type="submit" className="w-full">Tạo mã QR</Button>
                      </form>
                  ) : (
                      <div className="text-center py-10 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                          <svg className="w-12 h-12 text-stone-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                          <p className="text-sm text-stone-500 px-4">Bạn không có quyền tạo phiên điểm danh mới. Vui lòng liên hệ Quản trị viên.</p>
                      </div>
                  )}
              </div>
          ) : (
              <div className="flex flex-col items-center w-full">
                  <h2 className="text-xl font-bold text-gray-800 text-center">{activeSession.title}</h2>
                  <div className="flex flex-col items-center gap-1 mb-4">
                      <div className="text-sm text-stone-600">
                          <span className="font-semibold">Bắt đầu:</span> {new Date(activeSession.createdAt).toLocaleString('vi-VN')}
                      </div>
                      <div className="text-sm text-red-600 font-bold">
                          <span className="font-semibold">Kết thúc:</span> {new Date(activeSession.expiresAt).toLocaleString('vi-VN')}
                      </div>
                      {canManageAttendance && (
                          <div className="flex gap-2 mt-1">
                              <button 
                                onClick={() => handleExtendSession(15)}
                                className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                              >
                                +15 phút
                              </button>
                              <button 
                                onClick={() => handleExtendSession(30)}
                                className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                              >
                                +30 phút
                              </button>
                          </div>
                      )}
                  </div>
                  
                  <div className="flex bg-stone-100 p-1 rounded-xl mb-3 w-full max-w-xs">
                      <button onClick={() => setQrMode('OFFICER')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${qrMode === 'OFFICER' ? 'bg-white text-red-700 shadow-sm' : 'text-stone-500'}`}>
                        QR cán bộ
                      </button>
                      <button onClick={() => setQrMode('GUEST')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${qrMode === 'GUEST' ? 'bg-white text-blue-700 shadow-sm' : 'text-stone-500'}`}>
                        QR khách mời
                      </button>
                  </div>
                  <div className="p-4 bg-white border-2 border-gray-900 rounded-xl mb-4 relative group">
                    {/* Dynamic QR Code */}
                    <QRCodeSVG value={qrValue || activeSession.id} size={300} level={qrMode === 'GUEST' ? 'M' : 'H'} />
                    <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Mã QR tự động cập nhật"></div>
                    <button 
                        onClick={() => setIsFullscreen(true)}
                        className="absolute bottom-2 right-2 bg-black/70 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                        title="Phóng to toàn màn hình"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </button>
                  </div>
                  
                  <p className="text-xs text-gray-400 text-center max-w-xs mb-6">
                    {qrMode === 'GUEST'
                      ? 'Khách mời dùng camera điện thoại quét mã, điền họ tên, đơn vị, số điện thoại để điểm danh. Không cần tài khoản.'
                      : 'Cán bộ quét bằng mục "Quét mã" trong ứng dụng. Mỗi thiết bị chỉ điểm danh được 1 tài khoản, mã QR tự đổi mỗi 5 giây.'}
                  </p>

                  <Button variant="danger" onClick={handleEndSession} className="w-full">Kết thúc điểm danh</Button>
              </div>
          )}
        </div>

        {/* Attendance List Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
                <h2 className="text-xl font-bold text-gray-800">Danh Sách Đã Điểm Danh ({records.length})</h2>
                {activeSession && !isExpired && (
                    <p className="text-sm text-stone-500 mt-1">Đang điểm danh: <span className="font-semibold text-stone-700">{activeSession.title}</span></p>
                )}
            </div>
            <Button onClick={loadData} variant="secondary" size="sm">Làm mới</Button>
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Cán bộ</th>
                  <th className="px-4 py-3">Đơn vị</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Chưa có ai điểm danh
                    </td>
                  </tr>
                ) : (
                  records.sort((a, b) => b.timestamp - a.timestamp).map((rec) => (
                    <tr key={rec.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {new Date(rec.timestamp).toLocaleTimeString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {(rec.guestName ? `${rec.guestName} (khách)` : getUserName(rec.userId))}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {(rec.guestName ? (rec.guestUnit || "Khách mời") : getUserDept(rec.userId))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {rec.status === 'PRESENT' ? 'Đã có mặt' : rec.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {activeSession && activeSession.expectedUserIds && (
            <div className="mt-auto pt-4 border-t border-stone-100">
                <h3 className="text-lg font-bold text-red-800 mb-3">
                    Chưa điểm danh ({activeSession.expectedUserIds.filter(id => !records.some(r => r.userId === id)).length})
                </h3>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {activeSession.expectedUserIds
                        .filter(id => !records.some(r => r.userId === id))
                        .map(id => {
                            const user = users.find(u => u.id === id);
                            return (
                                <span key={id} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm font-medium flex items-center gap-2">
                                    {user?.fullName || id}
                                    <span className="text-[10px] text-red-400 opacity-70">({user?.department || 'N/A'})</span>
                                </span>
                            );
                        })}
                    {activeSession.expectedUserIds.filter(id => !records.some(r => r.userId === id)).length === 0 && (
                        <p className="text-sm text-green-600 font-medium italic">Tất cả cán bộ dự kiến đã điểm danh.</p>
                    )}
                </div>
            </div>
          )}
        </div>
      </div>
      
      {isFullscreen && activeSession && (
          <div className="fixed inset-0 bg-white z-[100] flex flex-col md:flex-row">
              <button 
                  onClick={() => setIsFullscreen(false)}
                  className="absolute top-4 right-4 bg-stone-100 hover:bg-stone-200 text-stone-600 p-3 rounded-full z-10 transition-colors"
                  title="Thoát toàn màn hình"
              >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>

              <div className="flex-1 flex flex-col items-center justify-center bg-white h-full overflow-hidden relative">
                  {/* Overlay Title */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-md px-8 py-4 rounded-3xl shadow-xl border border-stone-100 text-center w-max max-w-[90%]">
                      <h2 className="text-3xl font-black text-gray-900 mb-1 truncate">{activeSession.title}</h2>
                      <div className="text-lg font-bold text-stone-600">
                          Kết thúc lúc: <span className="text-red-600">{new Date(activeSession.expiresAt).toLocaleTimeString('vi-VN')}</span>
                      </div>
                  </div>
                  
                  {/* 100% QR Code */}
                  <div className="w-full h-full flex items-center justify-center p-8 pt-32 pb-8">
                      <div className="w-full h-full flex items-center justify-center relative">
                          <QRCodeSVG value={qrValue || activeSession.id} style={{ width: '100%', height: '100%' }} level={qrMode === 'GUEST' ? 'M' : 'H'} />
                          <div className="absolute top-0 right-0 w-8 h-8 bg-green-500 rounded-full animate-pulse shadow-lg border-4 border-white" title="Mã QR tự động cập nhật"></div>
                      </div>
                  </div>
                  
                  {/* Overlay Minimize Button */}
                  <button 
                      onClick={() => setIsFullscreen(false)}
                      className="absolute bottom-8 right-8 bg-black/80 hover:bg-black text-white px-6 py-4 rounded-2xl z-20 transition-all shadow-2xl flex items-center gap-3 backdrop-blur-md hover:scale-105"
                      title="Thu nhỏ"
                  >
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7M4 10h6m0 0V4m0 6l-7-7m17 11h-6m0 0v6m0-6l7 7" />
                      </svg>
                      <span className="font-bold text-xl">Thu nhỏ</span>
                  </button>
              </div>

              <div className="w-full md:w-[500px] bg-white flex flex-col h-full shadow-xl">
                  <div className="p-6 border-b border-stone-200 bg-white sticky top-0 z-10 flex justify-between items-center">
                      <div>
                          <h3 className="text-2xl font-bold text-gray-900">Đã điểm danh</h3>
                          <p className="text-stone-500 mt-1">{records.length} / {activeSession.expectedUserIds.length} người</p>
                      </div>
                      <div className="text-4xl font-black text-green-600 bg-green-50 w-16 h-16 rounded-2xl flex items-center justify-center">
                          {records.length}
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                      {records.length === 0 ? (
                          <div className="text-center py-20 text-stone-400">
                              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              <p className="text-lg">Chưa có ai điểm danh</p>
                          </div>
                      ) : (
                          records.sort((a, b) => b.timestamp - a.timestamp).map((rec) => (
                              <div key={rec.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100 animate-in slide-in-from-right-4 duration-300">
                                  <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-lg">
                                          {(rec.guestName ? `${rec.guestName} (khách)` : getUserName(rec.userId)).charAt(0)}
                                      </div>
                                      <div>
                                          <div className="font-bold text-gray-900 text-lg">{(rec.guestName ? `${rec.guestName} (khách)` : getUserName(rec.userId))}</div>
                                          <div className="text-sm text-stone-500">{(rec.guestName ? (rec.guestUnit || "Khách mời") : getUserDept(rec.userId))}</div>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-sm font-mono font-bold text-stone-700">
                                          {new Date(rec.timestamp).toLocaleTimeString('vi-VN')}
                                      </div>
                                      <div className="text-xs text-green-600 font-bold mt-1">Đã có mặt</div>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {summaryStats && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                <div ref={summaryRef} className="bg-white p-2 rounded-xl">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                            ✓
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">Kết thúc điểm danh</h3>
                        <p className="text-sm text-gray-500">Tổng hợp kết quả phiên điểm danh</p>
                        <p className="text-sm font-bold text-stone-700 mt-2">{summaryStats.session.title}</p>
                        <p className="text-xs text-stone-400 mt-1">{new Date().toLocaleString('vi-VN')}</p>
                        {summaryStats.guests > 0 && <p className="text-xs text-blue-600 mt-1">Khách mời điểm danh: {summaryStats.guests}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <div className="text-2xl font-bold text-stone-800">{summaryStats.total}</div>
                            <div className="text-xs font-bold text-stone-500 uppercase">Tổng số</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-xl border border-green-100">
                            <div className="text-2xl font-bold text-green-600">{summaryStats.present}</div>
                            <div className="text-xs font-bold text-green-600 uppercase">Có mặt</div>
                        </div>
                        <div className="text-center p-3 bg-red-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-600">{summaryStats.absent}</div>
                            <div className="text-xs font-bold text-red-600 uppercase">Vắng mặt</div>
                        </div>
                    </div>

                    {summaryStats.absent > 0 && (
                        <div className="mb-6">
                            <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase">Danh sách vắng mặt:</h4>
                            <div className="bg-stone-50 rounded-xl p-3 max-h-60 overflow-y-auto custom-scrollbar border border-stone-100">
                                {summaryStats.absentUsers.map(u => (
                                    <div key={u.id} className="flex items-center justify-between py-2 border-b border-stone-200 last:border-0">
                                        <span className="text-sm font-medium text-stone-700">{u.fullName}</span>
                                        <span className="text-xs text-stone-500 bg-white px-2 py-1 rounded border border-stone-200">{u.department}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2 mt-2">
                    <Button onClick={() => exportSessionReport('DOCX')} disabled={exporting} className="bg-blue-800 hover:bg-blue-900 text-xs py-2">Báo cáo Word</Button>
                    <Button onClick={() => exportSessionReport('XLSX')} disabled={exporting} className="bg-green-600 hover:bg-green-700 text-xs py-2">Bảng Excel</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <Button onClick={handleExportImage} className="bg-blue-600 hover:bg-blue-700 text-xs py-2">Xuất Ảnh</Button>
                    <Button onClick={handleExportPDF} className="bg-red-600 hover:bg-red-700 text-xs py-2">Xuất PDF</Button>
                </div>
                <p className="text-[11px] text-stone-400 text-center mb-3">Ghi lý do vắng và xuất báo cáo nhiều phiên tại mục <b>Báo cáo vắng</b>.</p>

                <Button onClick={() => setSummaryStats(null)} className="w-full">Đóng</Button>
            </div>
        </div>
      )}

      {/* Group Manager Modal */}
      {showGroupManager && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">{editingGroupId ? 'Chỉnh sửa nhóm' : 'Quản lý nhóm tuỳ chọn'}</h3>
                      <button onClick={() => { setShowGroupManager(false); handleCancelEditGroup(); }} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                  
                  <div className="mb-6">
                      <label className="block text-sm font-bold text-stone-700 mb-2">{editingGroupId ? 'Thông tin nhóm' : 'Tạo nhóm mới'}</label>
                      <div className="flex gap-2 mb-3">
                          <Input 
                              value={newGroupName}
                              onChange={e => setNewGroupName(e.target.value)}
                              placeholder="Nhập tên nhóm..."
                              className="flex-1"
                          />
                          <Button onClick={handleCreateGroup} disabled={groupSelectedUserIds.length === 0 || !newGroupName.trim()}>
                              {editingGroupId ? 'Cập nhật' : 'Tạo nhóm'}
                          </Button>
                          {editingGroupId && (
                              <Button onClick={handleCancelEditGroup} variant="secondary" className="bg-stone-200 hover:bg-stone-300 text-stone-700">Hủy</Button>
                          )}
                      </div>
                      
                      <div className="border border-stone-200 rounded-xl overflow-hidden flex flex-col h-64">
                          <div className="p-2 border-b border-stone-200 bg-stone-50">
                              <input 
                                  type="text" 
                                  placeholder="Tìm kiếm cán bộ để thêm vào nhóm..." 
                                  value={groupSearchQuery}
                                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none mb-2"
                              />
                              <div className="flex flex-wrap gap-1">
                                  <span className="w-full text-[10px] font-bold text-stone-500 uppercase mb-1">Chọn nhanh theo tổ:</span>
                                  {Object.values(UserDepartment).map(dept => {
                                      const usersInDept = users.filter(u => u.department === dept);
                                      if (usersInDept.length === 0) return null;
                                      const isAllSelected = usersInDept.every(u => groupSelectedUserIds.includes(u.id));
                                      return (
                                          <button 
                                            key={dept}
                                            type="button" 
                                            onClick={() => handleGroupSelectByDept(dept)} 
                                            className={`text-[10px] px-2 py-1 rounded border transition-colors font-medium ${
                                                isAllSelected 
                                                ? 'bg-orange-100 border-orange-300 text-orange-800' 
                                                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                                            }`}
                                          >
                                            {dept}
                                          </button>
                                      );
                                  })}
                              </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {users.filter(u => u.fullName.toLowerCase().includes(groupSearchQuery.toLowerCase())).map(u => (
                                      <label key={u.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${groupSelectedUserIds.includes(u.id) ? 'bg-red-50 border-red-200' : 'bg-white border-stone-100 hover:border-red-300'}`}>
                                          <input 
                                              type="checkbox" 
                                              checked={groupSelectedUserIds.includes(u.id)}
                                              onChange={(e) => {
                                                  if (e.target.checked) setGroupSelectedUserIds([...groupSelectedUserIds, u.id]);
                                                  else setGroupSelectedUserIds(groupSelectedUserIds.filter(id => id !== u.id));
                                              }}
                                              className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-stone-300"
                                          />
                                          <div className="flex flex-col">
                                              <span className="text-sm font-bold text-stone-800">{u.fullName}</span>
                                              <span className="text-[10px] text-stone-500">{u.department || 'Chưa phân tổ'}</span>
                                          </div>
                                      </label>
                                  ))}
                              </div>
                          </div>
                          <div className="p-2 bg-stone-50 border-t border-stone-200 text-xs text-stone-600 font-medium flex justify-between items-center">
                              <span>Đã chọn: <span className="font-bold text-red-600">{groupSelectedUserIds.length}</span> cán bộ</span>
                              <button 
                                  type="button" 
                                  onClick={() => setGroupSelectedUserIds([])}
                                  className="text-stone-500 hover:text-red-600 hover:underline"
                              >
                                  Bỏ chọn hết
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar border-t border-stone-200 pt-4">
                      <h4 className="text-sm font-bold text-stone-700 mb-3 uppercase">Danh sách nhóm đã tạo</h4>
                      {userGroups.length === 0 ? (
                          <p className="text-sm text-stone-500 italic text-center py-4">Chưa có nhóm nào được tạo.</p>
                      ) : (
                          <div className="space-y-3">
                              {userGroups.map(group => (
                                  <div key={group.id} className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex justify-between items-start">
                                      <div>
                                          <h5 className="font-bold text-stone-800">{group.name}</h5>
                                          <p className="text-xs text-stone-500 mt-1">{group.userIds.length} thành viên</p>
                                      </div>
                                      <div className="flex gap-2">
                                          <button 
                                              onClick={() => handleStartEditGroup(group)}
                                              className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 hover:bg-blue-100 rounded"
                                              title="Chỉnh sửa nhóm"
                                          >
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                          </button>
                                          <button 
                                              onClick={() => handleDeleteGroup(group.id)}
                                              className="text-red-500 hover:text-red-700 p-1 bg-red-50 hover:bg-red-100 rounded"
                                              title="Xóa nhóm"
                                          >
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
