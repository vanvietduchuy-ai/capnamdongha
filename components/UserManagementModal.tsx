import React, { useState, useEffect } from 'react';
import { User, UserRole, UserDepartment, UserPermission } from '../types';
import { Button, Input, Select } from './UI';
import { MockDB } from '../services/mockDatabase';
import { GoogleGenAI } from "@google/genai";

interface OfficerStat {
  user: User;
  total: number;
  completed: number;
  todo: number;
  overdue: number;
  accepted: number;
  completionRate: number;
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onUsersUpdated: () => Promise<any> | void; // Updated type definition to handle async
  officerStats: OfficerStat[];
  absentOfficers: User[];
  currentUser: User | null;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ 
  isOpen, onClose, users, onUsersUpdated, officerStats, absentOfficers, currentUser
}) => {
  // Views: LIST (Danh sách), FORM (Thêm/Sửa), STATS (Thống kê), AI_IMPORT (Thêm bằng AI)
  const [view, setView] = useState<'LIST' | 'FORM' | 'STATS' | 'AI_IMPORT'>('LIST');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // const [currentUser, setCurrentUser] = useState<User | null>(null); // Removed internal state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Import State
  const [aiInputText, setAiInputText] = useState('');
  const [aiSelectedImage, setAiSelectedImage] = useState<File | null>(null);
  const [aiPreviewUsers, setAiPreviewUsers] = useState<User[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const ROLE_WEIGHTS: Record<UserRole, number> = {
    [UserRole.ADMIN]: 100,
    [UserRole.CHIEF]: 90,
    [UserRole.DEPUTY_CHIEF]: 80,
    [UserRole.MANAGER]: 70,
    [UserRole.DEPUTY]: 60,
    [UserRole.OFFICER]: 50,
  };

  const canManageUser = (targetUser: User) => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    
    // Cannot manage self (for deletion) or higher/equal rank
    // Note: Chief can manage everyone except Admin
    if (currentUser.role === UserRole.CHIEF) return targetUser.role !== UserRole.ADMIN;
    
    // Target is higher or equal rank
    if (ROLE_WEIGHTS[currentUser.role] <= ROLE_WEIGHTS[targetUser.role]) return false;
    
    // For unit leaders, must be in same department
    if (currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.DEPUTY) {
        return currentUser.department === targetUser.department;
    }
    
    return true;
  };

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.OFFICER);
  const [department, setDepartment] = useState<UserDepartment>(UserDepartment.TONG_HOP);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* Removed useEffect for localStorage
  useEffect(() => {
    // Get current logged-in user to prevent self-deletion
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
    }
  }, []);
  */

  useEffect(() => {
    if (isOpen) {
      setView('LIST');
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setFullName('');
    setEmail('');
    setRole(UserRole.OFFICER);
    setDepartment(UserDepartment.TONG_HOP);
    setPermissions([]);
    setEditingUser(null);
    setIsSubmitting(false);
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setFullName(user.fullName);
    setEmail(user.email || '');
    setRole(user.role);
    setDepartment(user.department || UserDepartment.TONG_HOP);
    setPermissions(user.permissions || []);
    setPassword(''); 
    setView('FORM');
  };

  const handleAddClick = () => {
    resetForm();
    setView('FORM');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onUsersUpdated();
    // Artificial delay for visual feedback
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDeleteClick = async (id: string) => {
    if (currentUser && currentUser.id === id) {
        alert("Bạn không thể xóa tài khoản đang đăng nhập!");
        return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa cán bộ này khỏi hệ thống? Dữ liệu công việc liên quan có thể bị ảnh hưởng.')) {
      try {
        await MockDB.deleteUser(id);
      } catch (error: any) {
        alert(error?.message || 'Không xoá được cán bộ.');
      }
      onUsersUpdated();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingUser) {
        // Update existing user
        const updatedUser: User = {
          ...editingUser,
          username,
          fullName,
          role,
          department,
          permissions, // Include permissions
          email: email.trim(),
          // Chỉ gửi mật khẩu khi quản trị viên nhập mật khẩu mới.
          // Máy chủ sẽ tự băm; bỏ trống thì mật khẩu cũ được giữ nguyên.
          ...(password && password.trim() !== '' ? { password } : {}),
          // Update avatar if name changes
          avatarUrl: editingUser.fullName !== fullName 
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&color=fff` 
            : editingUser.avatarUrl
        };
        await MockDB.updateUser(updatedUser);
      } else {
        // Create new user
        if (users.some(u => u.username === username)) {
          alert('Tên đăng nhập đã tồn tại! Vui lòng chọn tên khác.');
          setIsSubmitting(false);
          return;
        }

        const newUser: User = {
          id: `u${Date.now()}`,
          username,
          password: password || '123123',
          isFirstLogin: true,
          fullName,
          role,
          department,
          permissions, // Include permissions
          email: email.trim(),
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&color=fff`
        };
        await MockDB.addUser(newUser);
      }

      await onUsersUpdated();
      setView('LIST');
      resetForm();
    } catch (error: any) {
      console.error("Error saving user:", error);
      alert(error?.message || "Có lỗi xảy ra khi lưu dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to format last login
  const renderLoginTime = (timestamp?: number) => {
     if (!timestamp) return <span className="text-stone-400">Chưa đăng nhập</span>;
     
     const loginDate = new Date(timestamp);
     const now = new Date();
     const isToday = loginDate.setHours(0,0,0,0) === now.setHours(0,0,0,0);
     
     // If logged in within last 5 minutes
     const diffMins = (Date.now() - timestamp) / 60000;
     const isOnline = diffMins < 5;

     return (
       <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></div>
          <span className={`text-[10px] font-medium ${isOnline ? 'text-green-700 font-bold' : 'text-stone-500'}`}>
            {isOnline ? 'Vừa đăng nhập' : (isToday ? `Hôm nay ${new Date(timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}` : new Date(timestamp).toLocaleDateString('vi-VN'))}
          </span>
       </div>
     );
  };

  if (!isOpen) return null;

  const handleAIAnalyze = async () => {
    if (!aiInputText && !aiSelectedImage) {
        setAiError("Vui lòng nhập văn bản hoặc chọn ảnh.");
        return;
    }

    setIsAnalyzing(true);
    setAiError(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const prompt = `Trích xuất danh sách cán bộ từ dữ liệu đầu vào. Trả về một mảng JSON các đối tượng với các trường:
        - fullName (string): Họ và tên đầy đủ.
        - username (string): Tên đăng nhập. Quy tắc: Lấy các chữ cái đầu của họ và tên đệm ghép với tên chính, viết thường, không dấu, không cách. Ví dụ: "Nguyễn Đức Dũng" -> "nddung", "Lê Thị Hoa" -> "lthoa", "Phạm Văn Nam" -> "pvnam".
        - role (enum: OFFICER, DEPUTY, MANAGER, DEPUTY_CHIEF, CHIEF, ADMIN. Mặc định: OFFICER)
        - department (enum: "Tổ Tổng hợp", "Tổ CSKV", "Tổ CSTT", "Tổ PCTP", "Tổ An ninh", "Phụ trách chung". Mặc định: "Tổ Tổng hợp")
        - email (string, optional)
        
        Dữ liệu đầu vào: ${aiInputText}`;

        let parts: any[] = [{ text: prompt }];

        if (aiSelectedImage) {
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(aiSelectedImage);
            });
            // Remove data:image/jpeg;base64, prefix
            const base64Data = base64.split(',')[1];
            parts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: aiSelectedImage.type
                }
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts }
        });
        
        const text = response.text || "";
        
        // Extract JSON from response
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
            const usersData = JSON.parse(jsonMatch[0]);
            // Map to User objects
            const newUsers: User[] = usersData.map((u: any) => ({
                id: `u${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                username: u.username,
                password: '123123',
                fullName: u.fullName,
                role: u.role || UserRole.OFFICER,
                department: u.department || UserDepartment.TONG_HOP,
                isFirstLogin: true,
                avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=random&color=fff`,
                email: u.email
            }));
            setAiPreviewUsers(newUsers);
        } else {
            setAiError("Không tìm thấy dữ liệu hợp lệ từ phản hồi của AI.");
        }

    } catch (error: any) {
        console.error("AI Error:", error);
        setAiError(`Có lỗi xảy ra: ${error.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleConfirmImport = async () => {
      const duplicates = aiPreviewUsers.filter(u => users.some(existing => existing.username === u.username));
      
      if (duplicates.length > 0) {
          const confirmMsg = `Phát hiện ${duplicates.length} tài khoản có tên đăng nhập đã tồn tại trong hệ thống:\n${duplicates.map(d => `- ${d.fullName} (${d.username})`).join('\n')}\n\nCác tài khoản trùng sẽ được tự động thêm hậu tố số để phân biệt. Bạn có muốn tiếp tục?`;
          if (!window.confirm(confirmMsg)) return;
      }

      setIsSubmitting(true);
      try {
          for (const user of aiPreviewUsers) {
              let finalUsername = user.username;
              let counter = 1;
              
              // Check duplicate username and append number if needed
              while (users.some(u => u.username === finalUsername)) {
                  finalUsername = `${user.username}${counter}`;
                  counter++;
              }
              
              await MockDB.addUser({
                  ...user,
                  username: finalUsername
              });
          }
          await onUsersUpdated();
          setView('LIST');
          setAiPreviewUsers([]);
          setAiInputText('');
          setAiSelectedImage(null);
          alert("Đã thêm danh sách cán bộ thành công.");
      } catch (error: any) {
          alert(error?.message || "Lỗi khi lưu dữ liệu.");
          await onUsersUpdated();
      } finally {
          setIsSubmitting(false);
      }
  };

  const renderAIImport = () => (
      <div className="p-6 space-y-6 h-full overflow-y-auto bg-stone-50">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200">
              <h3 className="font-bold text-stone-800 mb-2">1. Nhập dữ liệu (Văn bản hoặc Ảnh)</h3>
              <textarea 
                  className="w-full p-3 border border-stone-300 rounded-lg mb-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={4}
                  placeholder="Nhập danh sách cán bộ (VD: Nguyễn Văn A - Tổ trưởng, Trần Thị B - Cán bộ...)"
                  value={aiInputText}
                  onChange={e => setAiInputText(e.target.value)}
              />
              <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer transition-colors border border-stone-300 text-stone-700 text-sm font-medium">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      {aiSelectedImage ? aiSelectedImage.name : "Chọn ảnh danh sách"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => setAiSelectedImage(e.target.files?.[0] || null)} />
                  </label>
                  <Button onClick={handleAIAnalyze} isLoading={isAnalyzing} className="bg-blue-600 hover:bg-blue-700 text-white">
                      Phân tích bằng AI
                  </Button>
              </div>
              {aiError && <p className="text-red-600 text-sm mt-2">{aiError}</p>}
          </div>

          {aiPreviewUsers.length > 0 && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-stone-800">2. Kết quả phân tích ({aiPreviewUsers.length} cán bộ)</h3>
                      <Button onClick={handleConfirmImport} isLoading={isSubmitting} className="bg-green-600 hover:bg-green-700 text-white">
                          Xác nhận thêm {aiPreviewUsers.length} cán bộ
                      </Button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                      {aiPreviewUsers.map((u, idx) => {
                          const isDuplicate = users.some(existing => existing.username === u.username);
                          return (
                              <div key={idx} className={`flex items-center justify-between p-2 rounded border text-sm ${isDuplicate ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-100'}`}>
                                  <div>
                                      <span className="font-bold text-stone-800">{u.fullName}</span>
                                      <span className={`text-stone-500 ml-2 ${isDuplicate ? 'text-red-600 font-bold' : ''}`}>
                                          ({u.username})
                                          {isDuplicate && <span className="ml-1 text-[10px] uppercase">[Trùng]</span>}
                                      </span>
                                  </div>
                                  <div className="flex gap-2">
                                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100">{u.role}</span>
                                      <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs border border-orange-100">{u.department}</span>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}
      </div>
  );

  const renderHeader = () => (
    <div className="bg-red-900 text-white shadow-md shrink-0">
      <div className="px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button 
            onClick={view === 'FORM' || view === 'AI_IMPORT' ? () => setView('LIST') : onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          </button>
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide">
              {view === 'FORM' ? (editingUser ? 'Cập nhật Cán bộ' : 'Thêm Cán bộ') : 
               view === 'AI_IMPORT' ? 'Thêm Cán bộ bằng AI' : 'Quản lý Hệ thống'}
            </h2>
            <p className="text-xs text-red-200">
              {view === 'FORM' ? 'Nhập thông tin tài khoản' : 
               view === 'AI_IMPORT' ? 'Nhập liệu tự động từ văn bản/ảnh' : 'Quản lý nhân sự & Thống kê'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {/* Refresh Button */}
            {view !== 'FORM' && view !== 'AI_IMPORT' && (
                <button 
                    onClick={handleRefresh}
                    className={`p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                    title="Làm mới"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </button>
            )}

            {/* Only show Add buttons in List view and for ADMIN only */}
            {view === 'LIST' && currentUser?.role === UserRole.ADMIN && (
            <>
                <button 
                    onClick={() => setView('AI_IMPORT')}
                    className="p-2 bg-blue-500/20 hover:bg-blue-500/40 rounded-full text-blue-200 hover:text-white transition-colors border border-blue-400/30"
                    title="Thêm bằng AI"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </button>
                <button 
                    onClick={handleAddClick}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                    title="Thêm mới thủ công"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                </button>
            </>
            )}
        </div>
      </div>

      {/* Tabs */}
      {view !== 'FORM' && view !== 'AI_IMPORT' && (
        <div className="flex px-4 gap-4 mt-1">
          <button 
            onClick={() => setView('LIST')}
            className={`pb-3 px-2 text-sm font-bold border-b-4 transition-colors ${view === 'LIST' ? 'border-yellow-400 text-white' : 'border-transparent text-red-200 hover:text-white'}`}
          >
            Danh sách Cán bộ
          </button>
          <button 
            onClick={() => setView('STATS')}
            className={`pb-3 px-2 text-sm font-bold border-b-4 transition-colors ${view === 'STATS' ? 'border-yellow-400 text-white' : 'border-transparent text-red-200 hover:text-white'}`}
          >
            Thống kê & Đánh giá
          </button>
        </div>
      )}
    </div>
  );

  const canManageAll = currentUser?.role === UserRole.ADMIN || 
                       currentUser?.role === UserRole.CHIEF || 
                       (currentUser?.role === UserRole.DEPUTY_CHIEF && currentUser?.department === UserDepartment.PHU_TRACH_CHUNG);

  const visibleUsers = users.filter(u => {
    if (!currentUser) return false;
    if (canManageAll) return true;
    
    // For Managers/Deputies (not canManageAll)
    // 1. Must be in same department
    if (u.department !== currentUser.department) return false;

    // 2. Must NOT be higher rank (Admin, Chief, Deputy Chief)
    if (currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.DEPUTY) {
        if (u.role === UserRole.ADMIN || u.role === UserRole.CHIEF || u.role === UserRole.DEPUTY_CHIEF) {
            return false;
        }
    }
    
    return true;
  });

  const renderStats = () => {
    // Get all officers for display in grid (filtered by visibility)
    const allOfficers = visibleUsers.filter(u => u.role === UserRole.OFFICER);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startTimestamp = todayStart.getTime();

    // Sort: Present first, then Absent
    const sortedOfficers = [...allOfficers].sort((a, b) => {
        const aPresent = a.lastLoginAt && a.lastLoginAt >= startTimestamp;
        const bPresent = b.lastLoginAt && b.lastLoginAt >= startTimestamp;
        if (aPresent && !bPresent) return -1;
        if (!aPresent && bPresent) return 1;
        return a.fullName.localeCompare(b.fullName);
    });

    return (
    <div className="p-4 md:p-6 space-y-6 bg-stone-50 h-full overflow-y-auto">
        {/* Attendance Section */}
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-5 bg-red-700 rounded-full"></span>
                    <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wide">Điểm danh (Hôm nay)</h3>
                </div>
                <div className="flex gap-2">
                   <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                      Có mặt: {sortedOfficers.filter(u => u.lastLoginAt && u.lastLoginAt >= startTimestamp).length}
                   </span>
                   <span className="text-xs font-bold text-stone-500 bg-white border border-stone-200 px-2 py-1 rounded-lg">
                      Vắng: <span className="text-red-600">{sortedOfficers.filter(u => !u.lastLoginAt || u.lastLoginAt < startTimestamp).length}</span>
                   </span>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sortedOfficers.map(officer => {
                    const isPresent = officer.lastLoginAt && officer.lastLoginAt >= startTimestamp;
                    
                    return (
                    <div key={officer.id} className={`border rounded-xl p-3 flex items-center gap-3 shadow-sm transition-all ${isPresent ? 'bg-white border-green-200 ring-1 ring-green-50' : 'bg-stone-50 border-stone-200 opacity-70'}`}>
                        <div className="relative">
                            <img src={officer.avatarUrl} className={`w-10 h-10 rounded-full border ${isPresent ? 'border-green-100' : 'grayscale border-stone-200'}`} alt="" />
                            <span className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${isPresent ? 'bg-green-500 animate-pulse' : 'bg-stone-400'}`}></span>
                        </div>
                        <div className="overflow-hidden min-w-0">
                            <p className="text-xs font-bold text-stone-700 truncate">{officer.fullName}</p>
                            <p className={`text-[10px] font-bold truncate ${isPresent ? 'text-green-600' : 'text-stone-400'}`}>
                                {isPresent 
                                  ? (<span>Đã đăng nhập <span className="font-normal text-[9px] text-green-500">{new Date(officer.lastLoginAt!).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span></span>) 
                                  : 'Chưa đăng nhập'}
                            </p>
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>

        {/* Performance Section */}
        <div>
            <div className="flex items-center gap-2 mb-4">
                <span className="w-1 h-5 bg-blue-600 rounded-full"></span>
                <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wide">Hiệu suất công việc</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {officerStats.filter(stat => visibleUsers.some(u => u.id === stat.user.id)).map(stat => (
                <div key={stat.user.id} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 card-3d flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <img src={stat.user.avatarUrl} className="w-12 h-12 rounded-full ring-2 ring-stone-100" alt="" />
                        <div>
                            <h3 className="font-bold text-base text-red-900">{stat.user.fullName}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                {stat.completionRate >= 80 ? (<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">Tốt ({stat.completionRate}%)</span>) : stat.overdue > 0 ? (<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Cần nhắc nhở</span>) : (<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200">Đang hoạt động</span>)}
                            </div>
                        </div>
                    </div>
                    
                    <div className="w-full bg-stone-100 rounded-full h-2 mb-4">
                        <div className={`h-2 rounded-full ${stat.completionRate >= 80 ? 'bg-green-600' : (stat.completionRate >= 50 ? 'bg-yellow-500' : 'bg-orange-500')}`} style={{ width: `${stat.completionRate}%` }}></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-auto text-center">
                        <div className="bg-stone-50 rounded-lg p-2 border border-stone-100">
                            <p className="text-[10px] text-stone-500 font-bold uppercase">Tổng</p>
                            <p className="text-lg font-bold text-stone-800">{stat.total}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                            <p className="text-[10px] text-green-600 font-bold uppercase">Xong</p>
                            <p className="text-lg font-bold text-green-600">{stat.completed}</p>
                        </div>
                        <div className={`rounded-lg p-2 border ${stat.overdue > 0 ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
                            <p className={`text-[10px] font-bold uppercase ${stat.overdue > 0 ? 'text-red-600' : 'text-orange-600'}`}>{stat.overdue > 0 ? 'Quá hạn' : 'Đang làm'}</p>
                            <p className={`text-lg font-bold ${stat.overdue > 0 ? 'text-red-600' : 'text-orange-600'}`}>{stat.overdue > 0 ? stat.overdue : stat.todo}</p>
                        </div>
                    </div>
                </div>
                ))}
            </div>
        </div>
    </div>
  )};

  const handleApprove = async (user: User, approved: boolean) => {
    if (!approved && !window.confirm(`Từ chối và xoá tài khoản "${user.fullName}"?`)) return;
    try {
      await MockDB.approveUser(user, approved);
    } catch (error: any) {
      alert(error?.message || 'Không thực hiện được.');
    }
    onUsersUpdated();
  };

  const renderPendingBox = () => {
    const pending = visibleUsers.filter(u => u.isApproved === false);
    if (!canManageAll || pending.length === 0) return null;

    return (
      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔔</span>
          <h3 className="text-sm font-bold text-amber-900">
            Tài khoản chờ phê duyệt ({pending.length})
          </h3>
        </div>
        <div className="space-y-2">
          {pending.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-amber-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-800 truncate">{u.fullName}</p>
                <p className="text-[11px] text-stone-500 font-mono truncate">@{u.username} · {u.email}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    u.emailVerified
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-stone-100 text-stone-500 border-stone-200'
                  }`}>
                    {u.emailVerified ? 'Đã xác thực email' : 'Chưa xác thực email'}
                  </span>
                  {u.position && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-100">
                      {u.position}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleApprove(u, true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Duyệt
                </button>
                <button
                  onClick={() => handleApprove(u, false)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                >
                  Từ chối
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-amber-800/80 mt-3 leading-relaxed">
          Chỉ duyệt khi đã xác minh đúng nhân thân cán bộ. Tài khoản chưa duyệt không đăng nhập được.
        </p>
      </div>
    );
  };

  const renderList = () => {
    const filteredUsers = visibleUsers.filter(u =>
      u.isApproved !== false && (
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

    return (
    <div className="p-4 space-y-3 overflow-y-auto pb-20 md:pb-4 bg-stone-50 h-full flex flex-col">
      {renderPendingBox()}
      <div className="mb-2">
        <Input 
          type="text" 
          placeholder="Tìm kiếm theo tên hoặc tên đăng nhập..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          className="w-full"
        />
      </div>
      {filteredUsers.length === 0 ? (
         <div className="text-center py-10 text-stone-400">
            <p>Không tìm thấy cán bộ nào.</p>
         </div>
      ) : (
        filteredUsers.map(user => (
            <div key={user.id} className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-stone-200 card-3d group hover:border-yellow-300 transition-all">
            <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full border border-stone-100 shadow-sm object-cover" onError={(e) => (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=random`} />
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-stone-800 truncate">{user.fullName}</h3>
                <p className="text-xs text-stone-500 font-mono mb-1">@{user.username}</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border w-fit ${
                        user.role === UserRole.ADMIN ? 'bg-stone-800 text-white border-stone-900' :
                        user.role === UserRole.CHIEF ? 'bg-red-600 text-white border-red-700' :
                        user.role === UserRole.DEPUTY_CHIEF ? 'bg-red-100 text-red-800 border-red-200' :
                        user.role === UserRole.MANAGER ? 'bg-red-50 text-red-700 border-red-100' : 
                        user.role === UserRole.DEPUTY ? 'bg-orange-50 text-orange-700 border-orange-100' : 
                        'bg-green-50 text-green-700 border-green-100'
                    }`}>
                        {user.role === UserRole.ADMIN ? 'Quản trị viên' : 
                          user.role === UserRole.CHIEF ? 'Trưởng CA' :
                          user.role === UserRole.DEPUTY_CHIEF ? 'Phó Trưởng CA' :
                          user.role === UserRole.MANAGER ? 'Tổ trưởng' : 
                          (user.role === UserRole.DEPUTY ? 'Tổ phó' : 'Cán bộ')}
                    </span>
                    {user.department && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-100 w-fit">
                        {user.department}
                      </span>
                    )}
                    {user.email ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-100 flex items-center gap-1 truncate max-w-[150px]" title={user.email}>
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                           {user.email}
                        </span>
                    ) : null}
                </div>
                {/* Permissions List */}
                {user.permissions && user.permissions.length > 0 && user.role !== UserRole.ADMIN && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {user.permissions.map(perm => (
                            <span key={perm} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                {perm === UserPermission.MANAGE_USERS ? 'Quản lý Cán bộ' :
                                 perm === UserPermission.ASSIGN_TASKS ? 'Giao việc' :
                                 perm === UserPermission.VIEW_STATISTICS ? 'Xem Thống kê' :
                                 perm === UserPermission.MANAGE_WEEKLY_CALENDAR ? 'Quản lý Lịch' :
                                 perm === UserPermission.VIEW_WEEKLY_CALENDAR ? 'Xem Lịch' :
                                 perm === UserPermission.MANAGE_UTILITIES ? 'Quản lý Tiện ích' :
                                 perm === UserPermission.MANAGE_ATTENDANCE ? 'Quản lý Điểm danh' : 
                                 perm === UserPermission.MANAGE_TASKS ? 'Quản lý Nhiệm vụ' :
                                 perm === UserPermission.VIEW_ALL_TASKS ? 'Xem toàn bộ NV' :
                                 perm === UserPermission.MANAGE_PROPOSALS ? 'Quản lý Đề xuất' : perm}
                            </span>
                        ))}
                    </div>
                )}
                {user.role === UserRole.ADMIN && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                            <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                            Toàn quyền hệ thống
                        </span>
                    </div>
                )}
            </div>
                <div className="flex gap-2">
                    <button 
                    onClick={() => handleEditClick(user)}
                    className={`p-2 rounded-lg transition-colors ${canManageUser(user) ? 'text-stone-400 hover:text-blue-600 hover:bg-blue-50' : 'text-stone-200 cursor-not-allowed'}`}
                    title={canManageUser(user) ? "Chỉnh sửa" : "Không có quyền chỉnh sửa chức vụ cao hơn"}
                    disabled={!canManageUser(user)}
                    >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <button 
                    onClick={() => handleDeleteClick(user.id)}
                    className={`p-2 rounded-lg transition-colors ${currentUser?.id === user.id || !canManageUser(user) ? 'text-stone-200 cursor-not-allowed' : 'text-stone-400 hover:text-red-600 hover:bg-red-50'}`}
                    title={currentUser?.id === user.id ? "Không thể xóa chính mình" : !canManageUser(user) ? "Không có quyền xóa chức vụ cao hơn" : "Xóa"}
                    disabled={currentUser?.id === user.id || !canManageUser(user)}
                    >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        ))
      )}
      <div className="h-12 md:hidden"></div> {/* Spacer for mobile */}
    </div>
  );
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto bg-white flex-1">
      <div className="grid grid-cols-1 gap-5">
        <Input 
          label="Họ và tên" 
          value={fullName} 
          onChange={e => setFullName(e.target.value)} 
          placeholder="Nhập họ tên đầy đủ..." 
          required 
        />
        <Input 
          label="Tên đăng nhập" 
          value={username} 
          onChange={e => setUsername(e.target.value)} 
          placeholder="Viết liền không dấu..." 
          required 
          disabled={!!editingUser}
        />
        <div className="relative">
          <Input 
            type="password" 
            label={editingUser ? "Mật khẩu mới (Để trống nếu không đổi)" : "Mật khẩu"} 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder={editingUser ? "******" : "Mặc định: 123123"}
          />
        </div>
        <Select 
          label="Chức vụ"
          value={role}
          onChange={e => {
            const newRole = e.target.value as UserRole;
            setRole(newRole);
            
            // Auto-set Department and Permissions based on Role
            if (newRole === UserRole.CHIEF) {
                setDepartment(UserDepartment.PHU_TRACH_CHUNG);
            }
            
            // Auto-assign permissions based on role
            let defaultPerms: UserPermission[] = [];
            if (newRole === UserRole.CHIEF) {
                defaultPerms = [UserPermission.MANAGE_USERS, UserPermission.ASSIGN_TASKS, UserPermission.VIEW_STATISTICS, UserPermission.MANAGE_UTILITIES, UserPermission.MANAGE_ATTENDANCE, UserPermission.MANAGE_TASKS, UserPermission.VIEW_ALL_TASKS, UserPermission.MANAGE_PROPOSALS];
            } else if (newRole === UserRole.DEPUTY_CHIEF) {
                defaultPerms = [UserPermission.ASSIGN_TASKS, UserPermission.VIEW_STATISTICS, UserPermission.MANAGE_UTILITIES, UserPermission.MANAGE_ATTENDANCE, UserPermission.MANAGE_TASKS, UserPermission.VIEW_ALL_TASKS, UserPermission.MANAGE_PROPOSALS];
            } else if (newRole === UserRole.MANAGER || newRole === UserRole.DEPUTY) {
                defaultPerms = [UserPermission.ASSIGN_TASKS, UserPermission.VIEW_STATISTICS, UserPermission.MANAGE_UTILITIES];
            }
            setPermissions(defaultPerms);
          }}
          options={[
            { value: UserRole.CHIEF, label: 'Trưởng Công an phường' },
            { value: UserRole.DEPUTY_CHIEF, label: 'Phó trưởng Công an phường' },
            { value: UserRole.MANAGER, label: 'Tổ trưởng' },
            { value: UserRole.DEPUTY, label: 'Tổ phó' },
            { value: UserRole.OFFICER, label: 'Cán bộ' },
            { value: UserRole.ADMIN, label: 'Quản trị viên' },
          ]}
          disabled={!canManageAll}
        />

        <div className="grid grid-cols-1 gap-4">
          <Select 
            label="Tổ công tác"
            value={department}
            onChange={e => setDepartment(e.target.value as UserDepartment)}
            options={Object.values(UserDepartment).map(d => ({ value: d, label: d }))}
            disabled={!canManageAll || role === UserRole.CHIEF}
          />
        </div>
        
        {/* Contact Info Group */}
        <div className="space-y-4 pt-2">
            <h4 className="text-sm font-bold text-stone-700 uppercase tracking-wide border-b border-stone-100 pb-2">Thông tin liên lạc (Nhận thông báo)</h4>
            
            {/* Email Field */}
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
               <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  <label className="text-sm font-bold text-purple-900">Email</label>
               </div>
               <Input 
                 type="email"
                 value={email} 
                 onChange={e => setEmail(e.target.value)} 
                 placeholder="VD: canbo@gmail.com" 
                 className="bg-white"
               />
               <p className="text-[10px] text-purple-700 mt-2 italic">Dùng để nhận thông báo công việc qua Email.</p>
            </div>
        </div>

        {/* Permissions Group - Only for Admin */}
        {currentUser?.role === UserRole.ADMIN && (
            <div className="space-y-4 pt-2">
                <h4 className="text-sm font-bold text-stone-700 uppercase tracking-wide border-b border-stone-100 pb-2">Phân quyền chức năng</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.values(UserPermission).map(perm => {
                        const isChecked = role === UserRole.ADMIN || permissions.includes(perm);
                        const isDisabled = role === UserRole.ADMIN;
                        return (
                        <label key={perm} className={`flex items-center gap-3 p-3 border rounded-xl transition-all ${
                            isChecked 
                                ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 shadow-sm' 
                                : isDisabled 
                                    ? 'bg-stone-100 cursor-not-allowed opacity-70' 
                                    : 'hover:bg-stone-50 border-stone-200 cursor-pointer'
                        }`}>
                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                isChecked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-stone-300'
                            }`}>
                                {isChecked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                            </div>
                            <input 
                                type="checkbox" 
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={(e) => {
                                    if (isDisabled) return;
                                    if (e.target.checked) {
                                        setPermissions([...permissions, perm]);
                                    } else {
                                        setPermissions(permissions.filter(p => p !== perm));
                                    }
                                }}
                                className="hidden"
                            />
                            <span className={`text-sm font-medium ${isChecked ? 'text-emerald-800' : 'text-stone-700'}`}>
                                {perm === UserPermission.MANAGE_USERS ? 'Quản lý Cán bộ' :
                                 perm === UserPermission.ASSIGN_TASKS ? 'Giao việc & Phân công' :
                                 perm === UserPermission.VIEW_STATISTICS ? 'Xem Thống kê & Báo cáo' :
                                 perm === UserPermission.MANAGE_WEEKLY_CALENDAR ? 'Quản lý Lịch tuần' :
                                 perm === UserPermission.VIEW_WEEKLY_CALENDAR ? 'Xem Lịch tuần' :
                                 perm === UserPermission.MANAGE_UTILITIES ? 'Quản lý Tiện ích' :
                                 perm === UserPermission.MANAGE_ATTENDANCE ? 'Quản lý Điểm danh' : 
                                 perm === UserPermission.MANAGE_TASKS ? 'Quản lý toàn bộ nhiệm vụ' :
                                 perm === UserPermission.VIEW_ALL_TASKS ? 'Xem toàn bộ nhiệm vụ' :
                                 perm === UserPermission.MANAGE_PROPOSALS ? 'Quản lý đề xuất' : perm}
                            </span>
                        </label>
                        );
                    })}
                </div>
            </div>
        )}
      </div>

      <div className="pt-6 flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setView('LIST')} className="flex-1">Hủy</Button>
        <Button type="submit" isLoading={isSubmitting} className="flex-1 bg-red-800 hover:bg-red-900 border-red-950">{editingUser ? 'Cập nhật' : 'Thêm mới'}</Button>
      </div>
    </form>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-stone-900/60 backdrop-blur-sm transition-all p-0 md:p-4">
      <div className="bg-stone-50 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-3xl rounded-none shadow-2xl overflow-hidden flex flex-col animate-fade-in-up">
        {renderHeader()}
        <div className="flex-1 overflow-hidden flex flex-col">
          {view === 'LIST' ? renderList() : view === 'STATS' ? renderStats() : view === 'AI_IMPORT' ? renderAIImport() : renderForm()}
        </div>
      </div>
    </div>
  );
};