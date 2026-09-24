import { User, UserRole, UserDepartment, Task, TaskStatus, TaskPriority, RecurringType, AppNotification, Utility, CalendarEvent, AttendanceRecord, AttendanceSession, AttendanceAbsence, SeatLayout, SeatFlag, sessionState, sessionTime } from '../types';
import { SupabaseClient } from '@supabase/supabase-js';
import { buildClient, setClientConfig, getClient, CloudConfig as StoredCloudConfig, callRpc, getSessionToken, setSessionToken } from '../lib/supabase';
import { EmailService } from './emailService';

// Default password for everyone
const DEFAULT_PASS = '123123';

const MOCK_USERS: User[] = [
  // --- ADMIN ---
  { 
    id: 'admin', 
    username: 'admin', 
    password: DEFAULT_PASS, 
    isFirstLogin: true, 
    fullName: 'Quản trị viên', 
    role: UserRole.ADMIN, 
    department: UserDepartment.TONG_HOP,
    avatarUrl: 'https://ui-avatars.com/api/?name=Admin&background=000&color=fff' 
  },

  // --- BAN LÃNH ĐẠO (Leadership) ---
  { id: 'u1', username: 'ldthang', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Lê Đình Thắng', role: UserRole.MANAGER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Le+Dinh+Thang&background=ef4444&color=fff' }, // Tổ trưởng
  { id: 'u2', username: 'lqtuan', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Lê Quốc Tuấn', role: UserRole.DEPUTY, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Le+Quoc+Tuan&background=f97316&color=fff' },   // Tổ phó
  { id: 'u3', username: 'nthao', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Thị Hảo', role: UserRole.DEPUTY, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Thi+Hao&background=f97316&color=fff' },   // Tổ phó

  // --- CÁN BỘ (Officers) ---
  { id: 'u4', username: 'ptadao', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Phan Thị Anh Đào', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Phan+Thi+Anh+Dao&background=059669&color=fff' },
  { id: 'u5', username: 'nthuong', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Thị Hường', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Thi+Huong&background=059669&color=fff' },
  { id: 'u6', username: 'nqtrang', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Quỳnh Trang', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Quynh+Trang&background=059669&color=fff' },
  { id: 'u7', username: 'cphang', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Cao Phương Hằng', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Cao+Phuong+Hang&background=059669&color=fff' },
  { id: 'u8', username: 'nttsuong', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Thị Thu Sương', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Thi+Thu+Suong&background=059669&color=fff' },
  { id: 'u9', username: 'ndnguyen', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Đình Nguyên', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Dinh+Nguyen&background=059669&color=fff' },
  { id: 'u10', username: 'hhquynh', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Hoàng Hương Quỳnh', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Hoang+Huong+Quynh&background=059669&color=fff' },
  { id: 'u11', username: 'nklinh', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Khánh Linh', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Khanh+Linh&background=059669&color=fff' },
  { id: 'u12', username: 'hphai', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Hoàng Phi Hải', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Hoang+Phi+Hai&background=059669&color=fff' },
  { id: 'u13', username: 'nthue', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Nguyễn Thị Như Huế', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Thi+Nhu+Hue&background=059669&color=fff' },
  { id: 'u14', username: 'vvdhuy', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Văn Viết Đức Huy', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Van+Viet+Duc+Huy&background=059669&color=fff' },
  { id: 'u15', username: 'lqchung', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Lê Quang Chung', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Le+Quang+Chung&background=059669&color=fff' },
  { id: 'u16', username: 'dvtdat', password: DEFAULT_PASS, isFirstLogin: true, fullName: 'Dương Văn Tiến Đạt', role: UserRole.OFFICER, department: UserDepartment.TONG_HOP, avatarUrl: 'https://ui-avatars.com/api/?name=Duong+Van+Tien+Dat&background=059669&color=fff' },
];

const MOCK_TASKS: Task[] = [];

const MOCK_NOTIFICATIONS: AppNotification[] = [];

// Performance optimization: Remove artificial delay
const delay = (ms: number) => Promise.resolve();

// Helper: Ensure task is clean for DB (convert undefined to null, ensure arrays)
const sanitizeTask = (task: Task): any => {
    return {
        ...task,
        proposal: task.proposal || null,
        dispatchNumber: task.dispatchNumber || null,
        issuingAuthority: task.issuingAuthority || null,
        issueDate: task.issueDate || null,
        acceptedAt: task.acceptedAt || null,
        managerResponse: task.managerResponse || null,
        isRegularDuty: !!task.isRegularDuty,
        recurring: Array.isArray(task.recurring) ? task.recurring : [],
        aiSuggestedSteps: Array.isArray(task.aiSuggestedSteps) ? task.aiSuggestedSteps : [],
        // Database migration check: ensure assigneeIds is array
        assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds : (task as any).assigneeId ? [(task as any).assigneeId] : []
    };
};

// Helper to calculate next due date based on multiple recurrence types
const getNextDueDate = (currentDueDate: string, types: RecurringType[] | RecurringType): string => {
  const now = new Date();
  now.setHours(0, 0, 0, 0); 

  const candidates: number[] = [];
  const baseDate = new Date(currentDueDate); 
  
  const typeArray = Array.isArray(types) ? types : [types as RecurringType];

  typeArray.forEach(type => {
      if (!type || type === RecurringType.NONE) return;

      let d = new Date(baseDate);
      if (isNaN(d.getTime())) return; 

      do {
          if (type === RecurringType.WEEKLY) {
            d.setDate(d.getDate() + 7);
          } else if (type === RecurringType.MONTHLY) {
            d.setMonth(d.getMonth() + 1);
          } else if (type === RecurringType.QUARTERLY) {
            d.setMonth(d.getMonth() + 3);
          } else if (type === RecurringType.ANNUALLY) {
            d.setFullYear(d.getFullYear() + 1);
          }
      } while (d < now);

      candidates.push(d.getTime());
  });

  if (candidates.length === 0) return currentDueDate;
  return new Date(Math.min(...candidates)).toISOString();
};

const processTasksForOverdue = (tasks: Task[]): { tasks: Task[], hasChanges: boolean } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasChanges = false;
    const processed = tasks.map(t => {
        // If regular duty, it doesn't get overdue by date
        if (t.isRegularDuty) return t;

        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        if (today > dueDate && 
            t.status !== TaskStatus.COMPLETED && 
            t.status !== TaskStatus.CANCELLED && 
            t.status !== TaskStatus.OVERDUE) {
            
            hasChanges = true;
            return { ...t, status: TaskStatus.OVERDUE };
        }
        return t;
    });

    return { tasks: processed, hasChanges };
};

// --- LOGIC DỮ LIỆU THỜI GIAN THỰC (SUPABASE) ---
let supabase: SupabaseClient | null = null;
let subscriptions: Array<(table?: string) => void> = [];
// New: Specialized listener for real-time notification alerts
let notificationListeners: Array<(notif: AppNotification) => void> = [];

export interface CloudConfig {
  supabaseUrl: string;  // https://xxxx.supabase.co
  supabaseKey: string;  // Khoá anon (publishable)
}

// Giữ tên cũ để các màn hình đang import không bị lỗi
export type SupabaseConfig = CloudConfig;

// Add local storage listener for basic multi-tab support
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'tasks' || event.key === 'users' || event.key === 'notifications' || event.key === 'calendar_events') {
       const table = event.key;
       subscriptions.forEach(cb => cb(table));
    }
  });
}

export const MockDB = {
  initializeCloud: (config: CloudConfig): boolean => {
    try {
      if (!config || !config.supabaseUrl || !config.supabaseKey) return false;
      if (supabase) return true;

      // Dùng chung một client với các màn hình khác (Sơ đồ bảo vệ...)
      supabase = setClientConfig(config);
      console.log('Đã kết nối Supabase');
      
      const channel = supabase.channel('db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          (payload) => {
            subscriptions.forEach(cb => cb('tasks'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users' },
          (payload) => {
             subscriptions.forEach(cb => cb('users'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          (payload) => {
             // General reload
             subscriptions.forEach(cb => cb('notifications'));
             
             // Specific Real-time Alert for INSERT
             if (payload.eventType === 'INSERT' && payload.new) {
                const newNotif = payload.new as AppNotification;
                notificationListeners.forEach(cb => cb(newNotif));
             }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'utilities' },
          (payload) => {
             subscriptions.forEach(cb => cb('utilities'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'calendar_events' },
          (payload) => {
             subscriptions.forEach(cb => cb('calendar_events'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance_sessions' },
          (payload) => {
             subscriptions.forEach(cb => cb('attendance_sessions'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance_records' },
          (payload) => {
             subscriptions.forEach(cb => cb('attendance_records'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance_absences' },
          () => {
             subscriptions.forEach(cb => cb('attendance_absences'));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance_seat_flags' },
          () => { subscriptions.forEach(cb => cb('attendance_seat_flags')); }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'seating_layouts' },
          () => { subscriptions.forEach(cb => cb('attendance_seating_layouts')); }
        )
        .subscribe();

      return true;
    } catch (error) {
      console.error('Kết nối Supabase thất bại:', error);
      return false;
    }
  },

  isCloudEnabled: (): boolean => {
    return !!supabase;
  },

  disconnectCloud: () => {
    if (supabase) {
        supabase.removeAllChannels();
    }
    supabase = null;
  },

  // Kiểm tra kết nối tới Supabase
  testConnection: async (config: CloudConfig): Promise<{ ok: boolean; message: string }> => {
     try {
       const client = buildClient(config as StoredCloudConfig);
       const { error } = await client.from('users').select('id').limit(1);
       if (error) {
         if ((error as any).code === '42P01') {
           return { ok: false, message: 'Kết nối được nhưng chưa có bảng dữ liệu. Hãy chạy 2 file SQL trong thư mục supabase/.' };
         }
         return { ok: false, message: error.message };
       }
       return { ok: true, message: 'Kết nối thành công tới Supabase.' };
     } catch (e: any) {
       return { ok: false, message: e?.message || 'Không kết nối được Supabase.' };
     }
  },

  // Kiểm tra các bảng và hàm nghiệp vụ đã được cài đặt chưa
  checkCloudSchema: async (config?: CloudConfig): Promise<{ ok: boolean; message: string }> => {
     const client = config ? buildClient(config as StoredCloudConfig) : (supabase || getClient());
     const login = await client.rpc('app_login', { p_username: '__kiem_tra__', p_password: '__kiem_tra__' });
     if (login.error) {
       return { ok: false, message: 'Chưa cài đặt đăng nhập/OTP. Hãy chạy file supabase/02_auth_otp.sql.' };
     }
     const abs = await client.from('attendance_absences').select('id').limit(1);
     if (abs.error) {
       return { ok: false, message: 'Chưa cài bảng lý do vắng mặt. Hãy chạy file supabase/03_absence_report.sql.' };
     }
     const touch = await client.rpc('app_touch', { p_token: 'kiem-tra-cai-dat-000000000000' });
     if (touch.error) {
       return { ok: false, message: 'Chưa cài lớp bảo mật. Hãy chạy file supabase/04_bao_mat.sql.' };
     }
     const meet = await client.rpc('app_start_session', { p_token: 'kiem-tra-cai-dat-000000000000', p_id: '__kiem_tra__', p_auto_end_minutes: 30 });
     const col = await client.from('attendance_sessions').select('status').limit(1);
     if (meet.error || col.error) {
       return { ok: false, message: 'Chưa cài chức năng Bắt đầu/Kết thúc hội nghị. Hãy chạy file supabase/05_hoi_nghi.sql.' };
     }
     const qr = await client.rpc('app_qr_key', { p_token: 'kiem-tra-cai-dat-000000000000', p_session_id: '__kiem_tra__' });
     if (qr.error) {
       return { ok: false, message: 'Chưa cài mã QR động có chữ ký. Hãy chạy file supabase/06_ma_qr_dong.sql.' };
     }
     const seat = await client.from('seating_layouts').select('id').limit(1);
     const flag = await client.rpc('app_flag_seat', { p_token: 'kiem-tra-cai-dat-000000000000', p_session_id: '__kiem_tra__', p_user_id: '__x__', p_status: null });
     if (seat.error || flag.error) {
       return { ok: false, message: 'Chưa cài sơ đồ chỗ ngồi. Hãy chạy file supabase/07_so_do_cho_ngoi.sql.' };
     }
     return { ok: true, message: 'Cơ sở dữ liệu đã đầy đủ bảng và hàm nghiệp vụ (01–07).' };
  },

  subscribe: (callback: (table?: string) => void) => {
    subscriptions.push(callback);
    return () => {
      subscriptions = subscriptions.filter(cb => cb !== callback);
    };
  },

  // New method for specific notification listening (e.g., for playing sound)
  addNotificationListener: (callback: (notif: AppNotification) => void) => {
    notificationListeners.push(callback);
    return () => {
       notificationListeners = notificationListeners.filter(cb => cb !== callback);
    };
  },

  // --- HYBRID DATA METHODS (Cloud > LocalStorage) ---

  getUsers: async (): Promise<User[]> => {
    if (supabase) {
       // Không bao giờ trả danh sách mẫu hay tự tạo tài khoản mặc định trên máy chủ
       const { data, error } = await supabase.from('users').select('*');
       if (error) {
           console.error("Lỗi đọc dữ liệu cán bộ:", error);
           return [];
       }
       return (data as User[]) || [];
    }

    await delay(300);
    const stored = localStorage.getItem('users');
    if (!stored) {
      localStorage.setItem('users', JSON.stringify(MOCK_USERS));
      return MOCK_USERS;
    }
    
    // Migration: Ensure department exists for legacy data
    const users = JSON.parse(stored);
    return users.map((u: User) => ({
        ...u,
        department: u.department || UserDepartment.TONG_HOP,
        role: u.role || UserRole.OFFICER
    }));
  },

  updateUser: async (user: User): Promise<void> => {
    if (supabase) {
        const { password, ...profile } = user as any;
        const res = await callRpc('app_save_user', {
            p_token: getSessionToken(),
            p_user: profile,
            p_password: password && String(password).trim() !== '' ? password : null
        });
        if (!res.ok) throw new Error(res.message || 'Không lưu được thông tin cán bộ.');
        return;
    }

    const users = await MockDB.getUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users[index] = user;
      localStorage.setItem('users', JSON.stringify(users));
    }
  },

  addUser: async (user: User): Promise<User> => {
    if (supabase) {
       const { password, ...profile } = user as any;
       const res = await callRpc<{ user: User }>('app_save_user', {
           p_token: getSessionToken(),
           p_user: profile,
           p_password: password || '123123'
       });
       if (!res.ok) throw new Error(res.message || 'Không tạo được tài khoản.');
       return (res as any).user || user;
    }

    const users = await MockDB.getUsers();
    const newUsers = [...users, user];
    await delay(300);
    localStorage.setItem('users', JSON.stringify(newUsers));
    return user;
  },

  deleteUser: async (id: string): Promise<void> => {
    if (supabase) {
        const res = await callRpc('app_delete_user', { p_token: getSessionToken(), p_id: id });
        if (!res.ok) throw new Error(res.message || 'Không xoá được cán bộ.');
        return;
    }

    const users = await MockDB.getUsers();
    const newUsers = users.filter(u => u.id !== id);
    await delay(300);
    localStorage.setItem('users', JSON.stringify(newUsers));
  },

  getTasks: async (): Promise<Task[]> => {
    let rawTasks: any[] = [];
    let fromCloud = false;

    if (supabase) {
        const { data, error } = await supabase.from('tasks').select('*');
        if (!error && data) {
            rawTasks = data.length > 0 ? data : [];
            if (rawTasks.length === 0 && MOCK_TASKS.length > 0) {
               await supabase.from('tasks').upsert(MOCK_TASKS);
               rawTasks = MOCK_TASKS;
            }
            fromCloud = true;
        }
    } 
    
    if (!fromCloud) {
        await delay(300);
        const stored = localStorage.getItem('tasks');
        if (!stored) {
            localStorage.setItem('tasks', JSON.stringify(MOCK_TASKS));
            rawTasks = MOCK_TASKS;
        } else {
            rawTasks = JSON.parse(stored);
        }
    }

    // --- MIGRATION & NORMALIZATION ---
    // Ensure all tasks have assigneeIds array, fallback to assigneeId if present
    const normalizedTasks: Task[] = rawTasks.map(t => ({
        ...t,
        assigneeIds: Array.isArray(t.assigneeIds) ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []),
        isRegularDuty: !!t.isRegularDuty
    }));

    // --- AUTO UPDATE OVERDUE STATUS ---
    const { tasks: processedTasks, hasChanges } = processTasksForOverdue(normalizedTasks);

    if (hasChanges && !fromCloud) {
        localStorage.setItem('tasks', JSON.stringify(processedTasks));
    }

    return processedTasks;
  },

  saveTask: async (task: Task): Promise<Task> => {
    let existingTask: Task | undefined;
    
    if (supabase) {
        const { data } = await supabase.from('tasks').select('*').eq('id', task.id).single();
        existingTask = data;
    } else {
        const stored = localStorage.getItem('tasks');
        if (stored) {
           const localTasks = JSON.parse(stored) as Task[];
           existingTask = localTasks.find(t => t.id === task.id);
        }
    }
    
    // Recurring Logic
    let currentRecurring: RecurringType[] = [];
    if (Array.isArray(task.recurring)) {
        currentRecurring = task.recurring;
    } else if (task.recurring) {
        currentRecurring = [task.recurring as unknown as RecurringType];
    }
    
    const activeRecurrences = currentRecurring.filter(r => r && r !== RecurringType.NONE);
    const hasRecurrence = activeRecurrences.length > 0;

    const isJustCompleted = existingTask && 
                            existingTask.status !== TaskStatus.COMPLETED && 
                            task.status === TaskStatus.COMPLETED;

    if (isJustCompleted && hasRecurrence) {
      const nextDueDate = getNextDueDate(task.dueDate, activeRecurrences);
      
      const newTask: Task = {
        ...task,
        id: `t${Date.now()}_rec`,
        status: TaskStatus.PENDING,
        dueDate: nextDueDate,
        createdAt: Date.now(),
        acceptedAt: Date.now(), // AUTO ACCEPT RECURRING TASKS
        managerResponse: undefined, 
        proposal: '', 
        isProposalRead: false,
        recurring: activeRecurrences,
      };
      
      await MockDB.saveTaskInternal(newTask); 

      // Notify all assignees
      task.assigneeIds.forEach(async (uid) => {
          await MockDB.createNotification({
            id: `n${Date.now()}_rec_${uid}`,
            userId: uid,
            title: 'Công việc định kỳ tiếp theo',
            message: `Hệ thống đã tạo công việc cho chu kỳ mới: ${task.title}. Hạn: ${new Date(nextDueDate).toLocaleDateString('vi-VN')}`,
            isRead: false,
            createdAt: Date.now(),
            type: 'TASK_ASSIGNED',
            taskId: newTask.id
          });
      });
    }

    // Notifications logic...
    if (!existingTask) {
        const allUsers = await MockDB.getUsers();
        const creator = allUsers.find(u => u.id === task.creatorId);
        const creatorName = creator ? creator.fullName : "Lãnh đạo";

        // New Task - Notify all assignees
        task.assigneeIds.forEach(async (uid) => {
            // Internal Notification
            await MockDB.createNotification({
                id: `n${Date.now()}_${uid}`,
                userId: uid,
                title: 'Nhiệm vụ mới',
                message: `Bạn vừa được giao việc: ${task.title}`,
                isRead: false,
                createdAt: Date.now(),
                type: 'TASK_ASSIGNED',
                taskId: task.id
            });

            const userToNotify = allUsers.find(u => u.id === uid);
            if (userToNotify) {
               // EMAIL NOTIFICATION
               if (userToNotify.email) {
                  EmailService.sendNotification(userToNotify.email, task, creatorName);
               }
            }
        });
    } else {
        if (!existingTask.acceptedAt && task.acceptedAt) {
            await MockDB.createNotification({
              id: `n${Date.now()}_acc`,
              userId: task.creatorId,
              title: 'Cán bộ đã tiếp nhận',
              message: `Cán bộ đã tiếp nhận nhiệm vụ: "${task.title}"`,
              isRead: false,
              createdAt: Date.now(),
              type: 'TASK_ACCEPTED',
              taskId: task.id
            });
        }
    }

    return await MockDB.saveTaskInternal(task);
  },

  saveTaskInternal: async (task: Task): Promise<Task> => {
    const cleanTask = sanitizeTask(task);

    if (supabase) {
        const { error } = await supabase.from('tasks').upsert(cleanTask);
        if (error) {
            console.error("Lỗi lưu nhiệm vụ:", error);
            throw error;
        }
        return cleanTask;
    }

    const stored = localStorage.getItem('tasks');
    let tasks: Task[] = stored ? JSON.parse(stored) : [];
    
    const index = tasks.findIndex(t => t.id === cleanTask.id);
    if (index !== -1) {
        tasks[index] = cleanTask;
    } else {
        tasks = [cleanTask, ...tasks];
    }
    
    await delay(200);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    return cleanTask;
  },

  deleteTask: async (id: string): Promise<void> => {
    if (supabase) {
        await supabase.from('tasks').delete().eq('id', id);
        return;
    }

    const stored = localStorage.getItem('tasks');
    let tasks: Task[] = stored ? JSON.parse(stored) : [];
    const newTasks = tasks.filter(t => t.id !== id);
    
    await delay(300);
    localStorage.setItem('tasks', JSON.stringify(newTasks));
  },

  login: async (username: string, passwordAttempt: string): Promise<User | null> => {
    const users = await MockDB.getUsers();
    const user = users.find(u => u.username === username && u.password === passwordAttempt) || null;
    
    if (user) {
        // Record last login time
        const updatedUser = { ...user, lastLoginAt: Date.now() };
        // Quan trọng: chờ ghi xong xuống Google Sheet trước khi tải lại giao diện
        await MockDB.updateUser(updatedUser); 
        return updatedUser;
    }
    
    return null;
  },

  // Tải toàn bộ dữ liệu khởi động chỉ bằng MỘT lần gọi mạng.
  // Trước đây phải gọi 3 lần liên tiếp (cán bộ, nhiệm vụ, thông báo).
  bootstrap: async (userId?: string): Promise<{ users: User[]; tasks: Task[]; notifications: AppNotification[] }> => {
    if (supabase) {
      // Supabase chạy trên HTTP/2 nên 3 truy vấn song song nhanh hơn gộp tuần tự
      const [uRes, tRes, nRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('tasks').select('*'),
        userId
          ? supabase.from('notifications').select('*').eq('userId', userId)
          : Promise.resolve({ data: [], error: null } as any)
      ]);

      if (!uRes.error && uRes.data && uRes.data.length > 0) {
        const rawTasks = (tRes.data as any[]) || [];
        const tasks = processTasksForOverdue(
          rawTasks.map((t: any) => ({
            ...t,
            assigneeIds: Array.isArray(t.assigneeIds) ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []),
            isRegularDuty: !!t.isRegularDuty
          }))
        ).tasks;

        const notifications = (((nRes as any).data as AppNotification[]) || [])
          .sort((a: any, b: any) => b.createdAt - a.createdAt);

        return { users: uRes.data as User[], tasks, notifications };
      }
    }

    // Dự phòng: chế độ cục bộ
    const [users, tasks] = await Promise.all([MockDB.getUsers(), MockDB.getTasks()]);
    const notifications = userId ? await MockDB.getNotifications(userId) : [];
    return { users, tasks, notifications };
  },

  // --- ĐĂNG KÝ TÀI KHOẢN & QUÊN MẬT KHẨU (OTP QUA EMAIL) ---

  // Đăng nhập kèm thông báo lý do khi thất bại
  // Khi đã kết nối Google Sheet: việc đối chiếu mật khẩu do MÁY CHỦ thực hiện,
  // trình duyệt không bao giờ nhận được mật khẩu (kể cả dạng băm) của bất kỳ ai.
  loginEx: async (username: string, passwordAttempt: string): Promise<{ user: User | null; message: string }> => {
    if (supabase) {
      const res = await callRpc<{ user: User; token: string }>('app_login', {
        p_username: username.trim().toLowerCase(),
        p_password: passwordAttempt
      });
      if (!res.ok) return { user: null, message: res.message || 'Đăng nhập thất bại.' };
      setSessionToken((res as any).token || '');
      return { user: (res as any).user as User, message: '' };
    }

    // Chế độ cục bộ (chưa kết nối Google Sheet)
    const users = await MockDB.getUsers();
    const found = users.find(u => u.username === username);
    if (!found || found.password !== passwordAttempt) {
      return { user: null, message: 'Sai tên đăng nhập hoặc mật khẩu.' };
    }
    const updatedUser = { ...found, lastLoginAt: Date.now() };
    await MockDB.updateUser(updatedUser);
    return { user: updatedUser, message: '' };
  },

  // Giữ phiên + lấy thông tin mới nhất của chính mình (chức vụ, quyền có thể vừa được đổi)
  touchSession: async (): Promise<{ ok: boolean; user?: User; expired?: boolean }> => {
    if (!supabase) return { ok: true };
    if (!getSessionToken()) return { ok: false, expired: true };
    const res = await callRpc<{ user: User }>('app_touch', { p_token: getSessionToken() });
    if (res.ok) return { ok: true, user: (res as any).user };
    return { ok: false, expired: res.code === 'SESSION_EXPIRED' };
  },

  logout: async (): Promise<void> => {
    const token = getSessionToken();
    setSessionToken('');
    if (supabase && token) await callRpc('app_logout', { p_token: token });
  },

  hasSession: (): boolean => !supabase || !!getSessionToken(),

  // Đổi mật khẩu khi đang đăng nhập (bắt buộc nhập đúng mật khẩu hiện tại)
  changePassword: async (username: string, oldPassword: string, newPassword: string): Promise<{ ok: boolean; message: string }> => {
    if (supabase) {
      const res = await callRpc('app_change_password', {
        p_username: username, p_old: oldPassword, p_new: newPassword
      });
      if (!res.ok) return { ok: false, message: res.message || 'Không đổi được mật khẩu.' };
      // Đổi mật khẩu làm mọi phiên cũ hết hiệu lực -> đăng nhập lại ngay bằng mật khẩu mới
      const again = await callRpc<{ token: string }>('app_login', { p_username: username, p_password: newPassword });
      if (again.ok) setSessionToken((again as any).token || '');
      return { ok: true, message: 'Đổi mật khẩu thành công.' };
    }

    const users = await MockDB.getUsers();
    const found = users.find(u => u.username === username);
    if (!found || found.password !== oldPassword) {
      return { ok: false, message: 'Mật khẩu hiện tại không đúng.' };
    }
    await MockDB.updateUser({ ...found, password: newPassword, isFirstLogin: false });
    return { ok: true, message: 'Đổi mật khẩu thành công.' };
  },

  registerAccount: async (payload: {
    username: string; fullName: string; email: string; password: string; position?: string;
  }): Promise<{ ok: boolean; message: string; maskedEmail?: string; requireApproval?: boolean }> => {
    if (!supabase) {
      return { ok: false, message: 'Chức năng đăng ký cần kết nối Supabase. Liên hệ quản trị viên.' };
    }
    const { data, error } = await supabase.rpc('app_register_guarded', {
      p_username: payload.username,
      p_fullname: payload.fullName,
      p_email: payload.email,
      p_password: payload.password,
      p_position: payload.position || ''
    });
    if (error) return { ok: false, message: error.message };
    if (!data?.ok) return { ok: false, message: data?.message || 'Đăng ký thất bại.' };
    return {
      ok: true,
      message: 'Đã gửi mã xác thực tới email của bạn.',
      maskedEmail: data.maskedEmail,
      requireApproval: data.requireApproval
    };
  },

  requestOtp: async (target: string, purpose: 'REGISTER' | 'RESET'): Promise<{ ok: boolean; message: string; maskedEmail?: string }> => {
    if (!supabase) {
      return { ok: false, message: 'Chức năng này cần kết nối Supabase. Liên hệ quản trị viên.' };
    }
    const { data, error } = await supabase.rpc('app_request_otp', { p_target: target, p_purpose: purpose });
    if (error) return { ok: false, message: error.message };
    if (!data?.ok) return { ok: false, message: data?.message || 'Không gửi được mã.' };
    return { ok: true, message: 'Đã gửi mã xác thực.', maskedEmail: data.maskedEmail };
  },

  verifyOtp: async (target: string, purpose: 'REGISTER' | 'RESET', code: string): Promise<{ ok: boolean; message: string; resetToken?: string; requireApproval?: boolean }> => {
    if (!supabase) return { ok: false, message: 'Chức năng này cần kết nối Supabase.' };
    const { data, error } = await supabase.rpc('app_verify_otp', {
      p_target: target, p_purpose: purpose, p_code: code
    });
    if (error) return { ok: false, message: error.message };
    if (!data?.ok) return { ok: false, message: data?.message || 'Xác thực thất bại.' };
    return {
      ok: true,
      message: 'Xác thực thành công.',
      resetToken: data.resetToken,
      requireApproval: data.requireApproval
    };
  },

  resetPassword: async (target: string, resetToken: string, newPassword: string): Promise<{ ok: boolean; message: string }> => {
    if (!supabase) return { ok: false, message: 'Chức năng này cần kết nối Supabase.' };
    const { data, error } = await supabase.rpc('app_reset_password', {
      p_target: target, p_token: resetToken, p_new_password: newPassword
    });
    if (error) return { ok: false, message: error.message };
    return { ok: !!data?.ok, message: data?.message || 'Đặt lại mật khẩu thành công.' };
  },

  // Danh sách tài khoản tự đăng ký đang chờ duyệt
  getPendingUsers: async (): Promise<User[]> => {
    const users = await MockDB.getUsers();
    return users.filter(u => u.isApproved === false);
  },

  approveUser: async (user: User, approved: boolean): Promise<void> => {
    if (supabase) {
      const res = approved
        ? await callRpc('app_approve_user', { p_token: getSessionToken(), p_id: user.id })
        : await callRpc('app_delete_user', { p_token: getSessionToken(), p_id: user.id });
      if (!res.ok) throw new Error(res.message || 'Không thực hiện được.');
      return;
    }
    if (approved) {
      await MockDB.updateUser({ ...user, isApproved: true });
    } else {
      await MockDB.deleteUser(user.id);
    }
  },

  getNotifications: async (userId: string): Promise<AppNotification[]> => {
    if (supabase) {
        // Lọc ngay trên máy chủ để không phải tải toàn bộ bảng thông báo
        const { data, error } = await supabase.from('notifications').select('*').eq('userId', userId);
        if (!error && data) return (data as AppNotification[]).sort((a: any, b: any) => b.createdAt - a.createdAt);
        return [];
    }

    await delay(200);
    const stored = localStorage.getItem('notifications');
    let notifs: AppNotification[] = stored ? JSON.parse(stored) : MOCK_NOTIFICATIONS;
    return notifs.filter(n => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  },

  markRead: async (notifId: string): Promise<void> => {
    if (supabase) {
        await supabase.from('notifications').update({ isRead: true }).eq('id', notifId);
        return;
    }

    const stored = localStorage.getItem('notifications');
    let notifs: AppNotification[] = stored ? JSON.parse(stored) : MOCK_NOTIFICATIONS;
    const index = notifs.findIndex(n => n.id === notifId);
    if (index !== -1) {
      notifs[index].isRead = true;
      localStorage.setItem('notifications', JSON.stringify(notifs));
    }
  },

  markAllRead: async (userId: string): Promise<void> => {
    if (supabase) {
        await supabase.from('notifications').update({ isRead: true }).eq('userId', userId);
        return;
    }

    const stored = localStorage.getItem('notifications');
    let notifs: AppNotification[] = stored ? JSON.parse(stored) : MOCK_NOTIFICATIONS;
    const updated = notifs.map(n => n.userId === userId ? { ...n, isRead: true } : n);
    localStorage.setItem('notifications', JSON.stringify(updated));
  },

  createNotification: async (notif: AppNotification): Promise<void> => {
     if (supabase) {
        await supabase.from('notifications').insert(notif);
        return;
     }

     const stored = localStorage.getItem('notifications');
     let notifs: AppNotification[] = stored ? JSON.parse(stored) : MOCK_NOTIFICATIONS;
     notifs.push(notif);
     localStorage.setItem('notifications', JSON.stringify(notifs));
     
     // IMPORTANT: Trigger listeners immediately for LocalStorage mode (Simulation)
     // This allows UI feedback when testing on the same device
     notificationListeners.forEach(cb => cb(notif));
  },

  // --- UTILITIES (NEW SHARED LOGIC) ---
  getGlobalUtilities: async (): Promise<Utility[]> => {
     if (supabase) {
         const { data, error } = await supabase.from('utilities').select('*');
         if (!error && data) return data;
     }
     
     const stored = localStorage.getItem('global_utilities');
     return stored ? JSON.parse(stored) : [];
  },

  saveGlobalUtility: async (util: Utility): Promise<void> => {
      if (supabase) {
          await supabase.from('utilities').upsert(util);
          return;
      }
      
      const current = await MockDB.getGlobalUtilities();
      const updated = [...current.filter(u => u.id !== util.id), util];
      localStorage.setItem('global_utilities', JSON.stringify(updated));
  },

  deleteGlobalUtility: async (id: string): Promise<void> => {
      if (supabase) {
          await supabase.from('utilities').delete().eq('id', id);
          return;
      }

      const current = await MockDB.getGlobalUtilities();
      const updated = current.filter(u => u.id !== id);
      localStorage.setItem('global_utilities', JSON.stringify(updated));
  },

  // --- WEEKLY CALENDAR LOGIC ---
  getCalendarEvents: async (): Promise<CalendarEvent[]> => {
    if (supabase) {
        const { data, error } = await supabase.from('calendar_events').select('*');
        if (!error && data) return data;
        return [];
    }
    
    const stored = localStorage.getItem('calendar_events');
    return stored ? JSON.parse(stored) : [];
  },

  saveCalendarEvent: async (event: CalendarEvent): Promise<void> => {
    // Sanitize
    const cleanEvent = {
        ...event,
        meetingLink: event.meetingLink || null,
    };

    if (supabase) {
        await supabase.from('calendar_events').upsert(cleanEvent);
        return;
    }

    const current = await MockDB.getCalendarEvents();
    const updated = [...current.filter(e => e.id !== event.id), cleanEvent];
    localStorage.setItem('calendar_events', JSON.stringify(updated));
  },

  saveWeeklySchedule: async (events: CalendarEvent[]): Promise<void> => {
    // Batch save
    if (supabase) {
        // Upsert all. If id matches, update.
        const { error } = await supabase.from('calendar_events').upsert(events);
        if (error) console.error("Batch save error", error);
        return;
    }

    const current = await MockDB.getCalendarEvents();
    // Remove old versions of these events if they exist (based on ID)
    const newIds = new Set(events.map(e => e.id));
    const kept = current.filter(e => !newIds.has(e.id));
    
    const updated = [...kept, ...events];
    localStorage.setItem('calendar_events', JSON.stringify(updated));
  },

  deleteCalendarEvent: async (id: string): Promise<void> => {
    if (supabase) {
        await supabase.from('calendar_events').delete().eq('id', id);
        return;
    }

    const current = await MockDB.getCalendarEvents();
    const updated = current.filter(e => e.id !== id);
    localStorage.setItem('calendar_events', JSON.stringify(updated));
  },

  // --- ATTENDANCE LOGIC ---
  createAttendanceSession: async (session: AttendanceSession): Promise<void> => {
    if (supabase) {
        const res = await callRpc('app_create_session', {
            p_token: getSessionToken(),
            p_title: session.title,
            p_expires_at: session.expiresAt,
            p_expected: session.expectedUserIds
        });
        if (!res.ok) throw new Error(res.message || 'Không tạo được phiên điểm danh.');
        return;
    }
    const stored = localStorage.getItem('attendance_sessions');
    const allSessions: AttendanceSession[] = stored ? JSON.parse(stored) : [];
    allSessions.push(session);
    localStorage.setItem('attendance_sessions', JSON.stringify(allSessions));
  },

  getActiveSession: async (): Promise<AttendanceSession | null> => {
    const now = Date.now();
    if (supabase) {
        const { data, error } = await supabase.from('attendance_sessions')
            .select('*')
            .eq('isActive', true)
            .gt('expiresAt', now)
            .order('createdAt', { ascending: false })
            .limit(1)
            .single();
        if (!error && data) return data;
        return null;
    }
    const stored = localStorage.getItem('attendance_sessions');
    const allSessions: AttendanceSession[] = stored ? JSON.parse(stored) : [];
    const active = allSessions.find(s => s.isActive && s.expiresAt > now);
    return active || null;
  },

  getSessionById: async (sessionId: string): Promise<AttendanceSession | null> => {
    if (!sessionId) return null;
    if (supabase) {
        const { data, error } = await supabase.from('attendance_sessions').select('*').eq('id', sessionId).maybeSingle();
        if (error || !data) return null;
        return data as AttendanceSession;
    }
    const stored = localStorage.getItem('attendance_sessions');
    const allSessions: AttendanceSession[] = stored ? JSON.parse(stored) : [];
    return allSessions.find(s => s.id === sessionId) || null;
  },

  endSession: async (sessionId: string): Promise<void> => {
    if (supabase) {
        const res = await callRpc('app_update_session', {
            p_token: getSessionToken(), p_id: sessionId, p_expires_at: null, p_is_active: false
        });
        if (!res.ok) console.error('Không kết thúc được phiên:', res.message);
        return;
    }
    const stored = localStorage.getItem('attendance_sessions');
    const allSessions: AttendanceSession[] = stored ? JSON.parse(stored) : [];
    const index = allSessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
        allSessions[index].isActive = false;
        if (allSessions[index].status !== 'DRAFT') {
            allSessions[index].status = 'CLOSED';
            allSessions[index].endedAt = Date.now();
        }
        localStorage.setItem('attendance_sessions', JSON.stringify(allSessions));
    }
  },

  updateAttendanceSession: async (session: AttendanceSession): Promise<void> => {
    if (supabase) {
        const res = await callRpc('app_update_session', {
            p_token: getSessionToken(), p_id: session.id,
            p_expires_at: session.expiresAt, p_is_active: session.isActive
        });
        if (!res.ok) throw new Error(res.message || 'Không cập nhật được phiên điểm danh.');
        return;
    }
    const stored = localStorage.getItem('attendance_sessions');
    const allSessions: AttendanceSession[] = stored ? JSON.parse(stored) : [];
    const index = allSessions.findIndex(s => s.id === session.id);
    if (index !== -1) {
        allSessions[index] = session;
        localStorage.setItem('attendance_sessions', JSON.stringify(allSessions));
    }
  },

  checkIn: async (userId: string, deviceId: string, sessionId: string, ipAddress?: string, fingerprint?: string, qrText?: string): Promise<{ success: boolean; message: string }> => {
    if (supabase) {
        // Máy chủ tự xác định người điểm danh theo phiên đăng nhập -> không thể điểm danh hộ;
        // nội dung mã QR được máy chủ kiểm tra chữ ký + độ mới (đổi 3 giây/lần)
        const res = await callRpc<{ title: string }>('app_check_in', {
            p_token: getSessionToken(),
            p_session_id: sessionId,
            p_device_id: deviceId,
            p_ip: ipAddress || null,
            p_fingerprint: fingerprint || null,
            p_qr: qrText || null
        });
        return res.ok
            ? { success: true, message: 'Điểm danh thành công!' }
            : { success: false, message: res.message || 'Không điểm danh được.' };
    }

    const session = await MockDB.getSessionById(sessionId);
    if (!session || session.isActive === false || session.expiresAt <= Date.now()) {
        return { success: false, message: 'Phiên điểm danh không tồn tại hoặc đã kết thúc.' };
    }
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Get records for this session
    const records = await MockDB.getAttendanceRecords(sessionId);
    
    // 2. Check if this USER has already checked in for this session
    const userRecord = records.find(r => r.userId === userId);
    if (userRecord) {
        return { success: false, message: 'Bạn đã điểm danh cho hội nghị này rồi.' };
    }

    // 3. Check if this DEVICE has been used by ANOTHER user for this session
    // Strict fraud prevention: 1 Device = 1 Account (using LocalStorage ID)
    // Note: We DO NOT block strictly by fingerprint here anymore because two identical phone models 
    // (e.g., two iPhone 14s) will generate the exact same fingerprint, causing false positives.
    const fraudRecord = records.find(r => r.deviceId === deviceId && r.userId !== userId);
    
    if (fraudRecord) {
        return { success: false, message: 'Thiết bị này đã được sử dụng để điểm danh cho tài khoản khác.' };
    }

    // 4. IP Logging (Removed strict IP blocking to avoid false positives in shared Wifi environments)
    // We still store the IP address for auditing purposes.

    const newRecord: AttendanceRecord = {
        id: `${sessionId}__${userId}`,
        sessionId,
        userId,
        timestamp: Date.now(),
        date: today,
        deviceId,
        fingerprint, // Store fingerprint
        ipAddress, // Store IP
        status: 'PRESENT'
    };

    if (supabase) {
        // Try inserting with IP Address first
        const { error } = await supabase.from('attendance_records').insert(newRecord);
        
        if (error) {
            // Handle Unique Constraint Violation (Postgres code 23505)
            if (error.code === '23505') {
                return { success: false, message: 'Bạn đã điểm danh cho hội nghị này rồi (Ghi nhận từ hệ thống).' };
            }

            console.error('Check-in error:', error);
            
            // Fallback for missing columns (e.g. ipAddress or fingerprint not yet migrated)
            const { ipAddress, fingerprint, ...recordWithoutNewFields } = newRecord;
            const { error: retryError } = await supabase.from('attendance_records').insert(recordWithoutNewFields);
            
            if (retryError) {
                if (retryError.code === '23505') {
                    return { success: false, message: 'Bạn đã điểm danh cho hội nghị này rồi (Ghi nhận từ hệ thống).' };
                }
                return { success: false, message: `Lỗi hệ thống: ${retryError.message || 'Không thể lưu điểm danh'}` };
            }
        }
    } else {
        const stored = localStorage.getItem('attendance_records');
        const allRecords: AttendanceRecord[] = stored ? JSON.parse(stored) : [];
        allRecords.push(newRecord);
        localStorage.setItem('attendance_records', JSON.stringify(allRecords));
    }

    return { success: true, message: 'Điểm danh thành công!' };
  },

  // Mã QR động: người quản lý lấy khoá ký của hội nghị (kèm giờ máy chủ để bù lệch đồng hồ)
  getQrKey: async (sessionId: string): Promise<{ ok: boolean; message?: string; secret?: string; offset?: number; stepMs?: number }> => {
      if (supabase) {
          const t0 = Date.now();
          const res = await callRpc<{ secret: string; serverNow: number; stepMs: number }>('app_qr_key', {
              p_token: getSessionToken(), p_session_id: sessionId
          });
          if (!res.ok) return { ok: false, message: res.message };
          const t1 = Date.now();
          return { ok: true, secret: res.secret, stepMs: res.stepMs || 3000, offset: Number(res.serverNow) - Math.round((t0 + t1) / 2) };
      }
      return { ok: true, secret: `local-${sessionId}`, stepMs: 3000, offset: 0 };
  },

  // Khách mời: đổi mã QR vừa quét lấy "vé" có hạn để điền biểu mẫu
  getGuestTicket: async (sessionId: string, slot: number, code: string): Promise<{ ok: boolean; message?: string; ticket?: string; title?: string }> => {
      if (supabase) {
          const res = await callRpc<{ ticket: string; title: string }>('app_guest_ticket', {
              p_session_id: sessionId, p_slot: slot, p_code: code
          });
          return res.ok ? { ok: true, ticket: res.ticket, title: res.title } : { ok: false, message: res.message };
      }
      return { ok: true, ticket: 'local' };
  },

  guestCheckIn: async (guestName: string, guestUnit: string, guestPhone: string, deviceId: string, sessionId: string, ipAddress?: string, ticket?: string): Promise<{ success: boolean; message: string }> => {
      if (supabase) {
          const res = await callRpc('app_guest_check_in', {
              p_session_id: sessionId,
              p_name: guestName,
              p_unit: guestUnit,
              p_phone: guestPhone,
              p_device_id: deviceId,
              p_ip: ipAddress || null,
              p_ticket: ticket || null
          });
          return res.ok
              ? { success: true, message: 'Điểm danh khách mời thành công!' }
              : { success: false, message: res.message || 'Không điểm danh được.' };
      }
      const today = new Date().toISOString().split('T')[0];
      
      const records = await MockDB.getAttendanceRecords(sessionId);
      
      // Pseudo-userId for guests based on phone number
      const guestUserId = `guest_${guestPhone}`;
      
      const userRecord = records.find(r => r.userId === guestUserId);
      if (userRecord) {
          return { success: false, message: 'Bạn đã điểm danh cho hội nghị này rồi.' };
      }

      const fraudRecord = records.find(r => r.deviceId === deviceId && r.userId !== guestUserId);
      if (fraudRecord) {
          return { success: false, message: 'Thiết bị này đã được sử dụng để điểm danh cho tài khoản khác.' };
      }

      const newRecord: AttendanceRecord = {
          id: `${sessionId}__${guestUserId}`,
          sessionId,
          userId: guestUserId,
          guestName,
          guestUnit,
          guestPhone,
          timestamp: Date.now(),
          date: today,
          deviceId,
          fingerprint: undefined,
          ipAddress,
          status: 'PRESENT',
          // Store extra guest info in a way that can be retrieved later if needed
          // For now, we just use the pseudo-userId
      };

      if (supabase) {
          const { error } = await supabase.from('attendance_records').insert(newRecord);
          if (error) {
              if (error.code === '23505') {
                  return { success: false, message: 'Bạn đã điểm danh cho hội nghị này rồi.' };
              }
              const { ipAddress, fingerprint, ...recordWithoutNewFields } = newRecord;
              const { error: retryError } = await supabase.from('attendance_records').insert(recordWithoutNewFields);
              if (retryError) {
                  return { success: false, message: `Lỗi hệ thống: ${retryError.message}` };
              }
          }
      } else {
          const stored = localStorage.getItem('attendance_records');
          const allRecords: AttendanceRecord[] = stored ? JSON.parse(stored) : [];
          allRecords.push(newRecord);
          localStorage.setItem('attendance_records', JSON.stringify(allRecords));
      }

      return { success: true, message: 'Điểm danh khách mời thành công!' };
  },

  getAttendanceRecords: async (sessionId?: string): Promise<AttendanceRecord[]> => {
      if (supabase) {
          let query = supabase.from('attendance_records').select('*');
          if (sessionId) query = query.eq('sessionId', sessionId);
          const { data, error } = await query;
          if (!error && data) return data;
          return [];
      } else {
          const stored = localStorage.getItem('attendance_records');
          let records: AttendanceRecord[] = stored ? JSON.parse(stored) : [];
          if (sessionId) {
              records = records.filter(r => r.sessionId === sessionId);
          }
          return records;
      }
  },

  // --- HỘI NGHỊ: TẠO TRƯỚC → CHỌN THÀNH PHẦN → BẮT ĐẦU → KẾT THÚC ---

  // Danh sách hội nghị cho màn hình quản lý: mọi hội nghị chưa bắt đầu / đang điểm danh
  // + các hội nghị tạo trong 60 ngày gần nhất
  getMeetings: async (): Promise<AttendanceSession[]> => {
      const since = Date.now() - 60 * 24 * 3600 * 1000;
      let list: AttendanceSession[] = [];
      if (supabase) {
          const { data, error } = await supabase.from('attendance_sessions')
              .select('*')
              .or(`status.eq.DRAFT,status.eq.OPEN,createdAt.gte.${since}`)
              .order('createdAt', { ascending: false })
              .limit(300);
          if (error) console.error('Lỗi đọc danh sách hội nghị:', error);
          list = (data as AttendanceSession[]) || [];
      } else {
          const stored = localStorage.getItem('attendance_sessions');
          list = (stored ? JSON.parse(stored) : []) as AttendanceSession[];
          list = list.filter(s => s.status === 'DRAFT' || s.status === 'OPEN' || s.createdAt >= since)
                     .sort((a, b) => b.createdAt - a.createdAt);
      }
      return list.map(s => ({ ...s, expectedUserIds: Array.isArray(s.expectedUserIds) ? s.expectedUserIds : [] }));
  },

  saveMeeting: async (m: { id?: string; title: string; scheduledAt?: number | null; location?: string; expectedUserIds: string[] }):
      Promise<{ ok: boolean; message?: string; note?: string; session?: AttendanceSession }> => {
      if (supabase) {
          const res = await callRpc<{ session: AttendanceSession; note?: string }>('app_save_meeting', {
              p_token: getSessionToken(),
              p_id: m.id || null,
              p_title: m.title,
              p_scheduled_at: m.scheduledAt ?? null,
              p_location: m.location || '',
              p_expected: m.expectedUserIds
          });
          if (!res.ok) return { ok: false, message: res.message };
          return { ok: true, note: (res as any).note || undefined, session: (res as any).session };
      }
      // Chế độ cục bộ
      const stored = localStorage.getItem('attendance_sessions');
      const all: AttendanceSession[] = stored ? JSON.parse(stored) : [];
      if (!m.title.trim()) return { ok: false, message: 'Vui lòng nhập tên hội nghị.' };
      let s = m.id ? all.find(x => x.id === m.id) : undefined;
      if (!s) {
          s = {
              id: `sess_${Date.now()}`, title: m.title.trim(), creatorId: '', createdAt: Date.now(),
              expiresAt: 0, isActive: false, expectedUserIds: [...new Set(m.expectedUserIds)],
              status: 'DRAFT', scheduledAt: m.scheduledAt ?? null, location: m.location || null
          };
          all.push(s);
      } else {
          const st = sessionState(s);
          s.title = m.title.trim();
          s.location = m.location || null;
          if (st === 'DRAFT') { s.scheduledAt = m.scheduledAt ?? null; s.expectedUserIds = [...new Set(m.expectedUserIds)]; }
          else if (st === 'OPEN') s.expectedUserIds = [...new Set([...s.expectedUserIds, ...m.expectedUserIds])];
      }
      localStorage.setItem('attendance_sessions', JSON.stringify(all));
      return { ok: true, session: s };
  },

  startMeeting: async (id: string, autoEndMinutes: number): Promise<{ ok: boolean; message?: string; session?: AttendanceSession }> => {
      if (supabase) {
          const res = await callRpc<{ session: AttendanceSession }>('app_start_session', {
              p_token: getSessionToken(), p_id: id, p_auto_end_minutes: autoEndMinutes
          });
          return res.ok ? { ok: true, session: (res as any).session } : { ok: false, message: res.message };
      }
      const stored = localStorage.getItem('attendance_sessions');
      const all: AttendanceSession[] = stored ? JSON.parse(stored) : [];
      const s = all.find(x => x.id === id);
      if (!s) return { ok: false, message: 'Không tìm thấy hội nghị.' };
      if (!s.expectedUserIds.length) return { ok: false, message: 'Chưa chọn thành phần tham dự.' };
      s.status = 'OPEN'; s.isActive = true; s.startedAt = s.startedAt || Date.now(); s.endedAt = null;
      s.expiresAt = Date.now() + autoEndMinutes * 60000;
      localStorage.setItem('attendance_sessions', JSON.stringify(all));
      return { ok: true, session: s };
  },

  deleteMeeting: async (id: string): Promise<{ ok: boolean; message?: string }> => {
      if (supabase) {
          const res = await callRpc('app_delete_meeting', { p_token: getSessionToken(), p_id: id });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
      }
      const stored = localStorage.getItem('attendance_sessions');
      const all: AttendanceSession[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem('attendance_sessions', JSON.stringify(all.filter(s => s.id !== id || s.status !== 'DRAFT')));
      return { ok: true };
  },

  // --- SƠ ĐỒ CHỖ NGỒI & ĐỐI SÁNH ---
  getSeatLayouts: async (): Promise<SeatLayout[]> => {
      if (supabase) {
          const { data, error } = await supabase.from('seating_layouts').select('*').order('name');
          if (error) { console.warn('Chưa có bảng sơ đồ chỗ ngồi (chạy 07_so_do_cho_ngoi.sql):', error.message); return []; }
          return ((data as SeatLayout[]) || []).map(l => ({ ...l, seats: Array.isArray(l.seats) ? l.seats : [] }));
      }
      try { return JSON.parse(localStorage.getItem('seat_layouts') || '[]'); } catch { return []; }
  },

  saveSeatLayout: async (layout: SeatLayout): Promise<{ ok: boolean; message?: string; layout?: SeatLayout }> => {
      if (supabase) {
          const res = await callRpc<{ layout: SeatLayout }>('app_save_layout', { p_token: getSessionToken(), p_layout: layout });
          return res.ok ? { ok: true, layout: (res as any).layout } : { ok: false, message: res.message };
      }
      const all: SeatLayout[] = JSON.parse(localStorage.getItem('seat_layouts') || '[]');
      const l = { ...layout, id: layout.id || `lay_${Date.now()}`, updatedAt: Date.now() };
      localStorage.setItem('seat_layouts', JSON.stringify([...all.filter(x => x.id !== l.id), l]));
      return { ok: true, layout: l };
  },

  deleteSeatLayout: async (id: string): Promise<{ ok: boolean; message?: string }> => {
      if (supabase) {
          const res = await callRpc('app_delete_layout', { p_token: getSessionToken(), p_id: id });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
      }
      const all: SeatLayout[] = JSON.parse(localStorage.getItem('seat_layouts') || '[]');
      localStorage.setItem('seat_layouts', JSON.stringify(all.filter(x => x.id !== id)));
      return { ok: true };
  },

  setMeetingSeating: async (sessionId: string, layoutId: string | null, enabled: boolean): Promise<{ ok: boolean; message?: string }> => {
      if (supabase) {
          const res = await callRpc('app_set_meeting_seating', { p_token: getSessionToken(), p_session_id: sessionId, p_layout_id: layoutId, p_enabled: enabled });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
      }
      const all: AttendanceSession[] = JSON.parse(localStorage.getItem('attendance_sessions') || '[]');
      const s = all.find(x => x.id === sessionId);
      if (s) { s.seatCompare = enabled; if (layoutId) s.seatLayoutId = layoutId; }
      localStorage.setItem('attendance_sessions', JSON.stringify(all));
      return { ok: true };
  },

  getSeatFlags: async (sessionIds: string[]): Promise<SeatFlag[]> => {
      if (!sessionIds.length) return [];
      if (supabase) {
          const { data, error } = await supabase.from('attendance_seat_flags').select('*').in('sessionId', sessionIds.slice(0, 200));
          if (error) return [];
          return (data as SeatFlag[]) || [];
      }
      const all: SeatFlag[] = JSON.parse(localStorage.getItem('seat_flags') || '[]');
      return all.filter(f => sessionIds.includes(f.sessionId));
  },

  flagSeat: async (sessionId: string, userId: string, status: 'SUSPECT' | 'CONFIRMED' | null): Promise<{ ok: boolean; message?: string }> => {
      if (supabase) {
          const res = await callRpc('app_flag_seat', { p_token: getSessionToken(), p_session_id: sessionId, p_user_id: userId, p_status: status });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
      }
      const id = `${sessionId}__${userId}`;
      const all: SeatFlag[] = JSON.parse(localStorage.getItem('seat_flags') || '[]');
      const rest = all.filter(f => f.id !== id);
      if (status) rest.push({ id, sessionId, userId, status, flaggedAt: Date.now() });
      localStorage.setItem('seat_flags', JSON.stringify(rest));
      return { ok: true };
  },

  // --- LỊCH SỬ PHIÊN ĐIỂM DANH & LÝ DO VẮNG MẶT (phục vụ báo cáo) ---

  // Tất cả phiên điểm danh trong khoảng thời gian (theo thời điểm tạo phiên)
  getAttendanceSessions: async (fromMs?: number, toMs?: number): Promise<AttendanceSession[]> => {
      // Hội nghị có thể tạo trước nhiều ngày rồi mới bắt đầu -> lấy rộng theo ngày tạo,
      // sau đó lọc chính xác theo thời điểm bắt đầu điểm danh
      const createdFrom = fromMs !== undefined ? fromMs - 90 * 24 * 3600 * 1000 : undefined;
      let sessions: AttendanceSession[] = [];
      if (supabase) {
          let q = supabase.from('attendance_sessions').select('*');
          if (createdFrom !== undefined) q = q.gte('createdAt', createdFrom);
          if (toMs !== undefined) q = q.lte('createdAt', toMs);
          const { data, error } = await q.order('createdAt', { ascending: false });
          if (error) console.error('Lỗi đọc lịch sử phiên điểm danh:', error);
          sessions = (data as AttendanceSession[]) || [];
      } else {
          const stored = localStorage.getItem('attendance_sessions');
          sessions = stored ? JSON.parse(stored) : [];
      }
      return sessions
          .map(s => ({ ...s, expectedUserIds: Array.isArray(s.expectedUserIds) ? s.expectedUserIds : [] }))
          .filter(s => sessionState(s) !== 'DRAFT')
          .filter(s => {
              const t = sessionTime(s);
              return (fromMs === undefined || t >= fromMs) && (toMs === undefined || t <= toMs);
          })
          .sort((a, b) => sessionTime(b) - sessionTime(a));
  },

  // Bản ghi điểm danh của nhiều phiên cùng lúc
  getAttendanceRecordsForSessions: async (sessionIds: string[]): Promise<AttendanceRecord[]> => {
      if (sessionIds.length === 0) return [];
      if (supabase) {
          const out: AttendanceRecord[] = [];
          // Chia nhỏ để URL truy vấn không quá dài
          for (let i = 0; i < sessionIds.length; i += 100) {
              const chunk = sessionIds.slice(i, i + 100);
              const { data, error } = await supabase.from('attendance_records').select('*').in('sessionId', chunk);
              if (error) console.error('Lỗi đọc bản ghi điểm danh:', error);
              if (data) out.push(...(data as AttendanceRecord[]));
          }
          return out;
      }
      const stored = localStorage.getItem('attendance_records');
      const all: AttendanceRecord[] = stored ? JSON.parse(stored) : [];
      return all.filter(r => sessionIds.includes(r.sessionId));
  },

  getAbsences: async (sessionIds: string[]): Promise<AttendanceAbsence[]> => {
      if (sessionIds.length === 0) return [];
      if (supabase) {
          const out: AttendanceAbsence[] = [];
          for (let i = 0; i < sessionIds.length; i += 100) {
              const chunk = sessionIds.slice(i, i + 100);
              const { data, error } = await supabase.from('attendance_absences').select('*').in('sessionId', chunk);
              if (error) {
                  // Chưa chạy file 03_absence_report.sql: vẫn xem được báo cáo, chỉ thiếu lý do vắng
                  console.warn('Chưa có bảng lý do vắng mặt:', error.message);
                  return [];
              }
              if (data) out.push(...(data as AttendanceAbsence[]));
          }
          return out;
      }
      const stored = localStorage.getItem('attendance_absences');
      const all: AttendanceAbsence[] = stored ? JSON.parse(stored) : [];
      return all.filter(a => sessionIds.includes(a.sessionId));
  },

  saveAbsence: async (absence: AttendanceAbsence): Promise<{ ok: boolean; message?: string }> => {
      const clean: AttendanceAbsence = {
          ...absence,
          id: `${absence.sessionId}__${absence.userId}`,
          reason: absence.reason || '',
          updatedAt: Date.now()
      };
      if (supabase) {
          const res = await callRpc('app_save_absence', {
              p_token: getSessionToken(),
              p_session_id: clean.sessionId,
              p_user_id: clean.userId,
              p_excused: clean.excused === undefined ? null : clean.excused,
              p_reason: clean.reason || ''
          });
          return res.ok ? { ok: true } : { ok: false, message: res.message };
      }
      const stored = localStorage.getItem('attendance_absences');
      const all: AttendanceAbsence[] = stored ? JSON.parse(stored) : [];
      const next = [...all.filter(a => a.id !== clean.id), clean];
      localStorage.setItem('attendance_absences', JSON.stringify(next));
      return { ok: true };
  },

  // --- USER GROUPS ---
  getUserGroups: async (): Promise<any[]> => {
      if (supabase) {
          const { data, error } = await supabase.from('user_groups').select('*');
          if (!error && data) return data;
          return [];
      } else {
          const stored = localStorage.getItem('user_groups');
          return stored ? JSON.parse(stored) : [];
      }
  },

  createUserGroup: async (group: any): Promise<void> => {
      if (supabase) {
          const { error } = await supabase.from('user_groups').insert(group);
          if (error) console.error("Error creating user group:", error);
          return;
      }
      const stored = localStorage.getItem('user_groups');
      const allGroups = stored ? JSON.parse(stored) : [];
      allGroups.push(group);
      localStorage.setItem('user_groups', JSON.stringify(allGroups));
  },

  updateUserGroup: async (group: any): Promise<void> => {
      if (supabase) {
          const { error } = await supabase.from('user_groups').update(group).eq('id', group.id);
          if (error) console.error("Error updating user group:", error);
          return;
      }
      const stored = localStorage.getItem('user_groups');
      if (stored) {
          const allGroups = JSON.parse(stored);
          const index = allGroups.findIndex((g: any) => g.id === group.id);
          if (index !== -1) {
              allGroups[index] = group;
              localStorage.setItem('user_groups', JSON.stringify(allGroups));
          }
      }
  },

  deleteUserGroup: async (id: string): Promise<void> => {
      if (supabase) {
          const { error } = await supabase.from('user_groups').delete().eq('id', id);
          if (error) console.error("Error deleting user group:", error);
          return;
      }
      const stored = localStorage.getItem('user_groups');
      if (stored) {
          const allGroups = JSON.parse(stored).filter((g: any) => g.id !== id);
          localStorage.setItem('user_groups', JSON.stringify(allGroups));
      }
  },

  // --- GAME LOGIC ---
  saveGameScore: async (userId: string, gameId: string, score: number): Promise<void> => {
      const newScore = {
          id: `score_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          userId,
          gameId,
          score,
          playedAt: Date.now()
      };

      if (supabase) {
          const { error } = await supabase.from('game_scores').insert(newScore);
          if (error) console.error("Error saving score:", error);
          return;
      }

      const stored = localStorage.getItem('game_scores');
      const allScores = stored ? JSON.parse(stored) : [];
      allScores.push(newScore);
      localStorage.setItem('game_scores', JSON.stringify(allScores));
  },

  getGameScores: async (gameId?: string): Promise<any[]> => {
      if (supabase) {
          let query = supabase.from('game_scores').select('*');
          if (gameId) query = query.eq('gameId', gameId);
          
          const { data, error } = await query;
          if (!error && data) return data;
          return [];
      }

      const stored = localStorage.getItem('game_scores');
      const allScores = stored ? JSON.parse(stored) : [];
      if (gameId) return allScores.filter((s: any) => s.gameId === gameId);
      return allScores;
  },

  getGameProgress: async (userId: string, gameId: string): Promise<number> => {
      if (supabase) {
          const { data, error } = await supabase
              .from('game_progress')
              .select('highestLevel')
              .eq('userId', userId)
              .eq('gameId', gameId)
              .single();
          
          if (!error && data) return data.highestLevel;
          return 0;
      }

      const stored = localStorage.getItem('game_progress');
      const allProgress = stored ? JSON.parse(stored) : [];
      const progress = allProgress.find((p: any) => p.userId === userId && p.gameId === gameId);
      return progress ? progress.highestLevel : 0;
  },

  updateGameProgress: async (userId: string, gameId: string, level: number): Promise<void> => {
      if (supabase) {
          const { data: existing } = await supabase
              .from('game_progress')
              .select('id, highestLevel')
              .eq('userId', userId)
              .eq('gameId', gameId)
              .single();

          if (existing) {
              if (level > existing.highestLevel) {
                  await supabase
                      .from('game_progress')
                      .update({ highestLevel: level })
                      .eq('id', existing.id);
              }
          } else {
              await supabase
                  .from('game_progress')
                  .insert({
                      id: `prog_${Date.now()}`,
                      userId,
                      gameId,
                      highestLevel: level
                  });
          }
          return;
      }

      const stored = localStorage.getItem('game_progress');
      let allProgress = stored ? JSON.parse(stored) : [];
      const index = allProgress.findIndex((p: any) => p.userId === userId && p.gameId === gameId);

      if (index !== -1) {
          if (level > allProgress[index].highestLevel) {
              allProgress[index].highestLevel = level;
          }
      } else {
          allProgress.push({
              id: `prog_${Date.now()}`,
              userId,
              gameId,
              highestLevel: level
          });
      }
      localStorage.setItem('game_progress', JSON.stringify(allProgress));
  },

  // --- CARO ONLINE METHODS ---
  createCaroGame: async (player1Id: string): Promise<string> => {
      const gameId = `caro_${Date.now()}`;
      const newGame = {
          id: gameId,
          player1Id,
          player2Id: null,
          board: JSON.stringify(Array(15).fill(null).map(() => Array(15).fill(null))),
          turn: player1Id,
          winnerId: null,
          status: 'WAITING',
          createdAt: Date.now()
      };

      if (supabase) {
          await supabase.from('caro_games').insert(newGame);
      } else {
          const stored = localStorage.getItem('caro_games');
          const games = stored ? JSON.parse(stored) : [];
          games.push(newGame);
          localStorage.setItem('caro_games', JSON.stringify(games));
      }
      return gameId;
  },

  joinCaroGame: async (gameId: string, player2Id: string): Promise<void> => {
      if (supabase) {
          await supabase.from('caro_games').update({ player2Id, status: 'PLAYING' }).eq('id', gameId);
      } else {
          const stored = localStorage.getItem('caro_games');
          const games = stored ? JSON.parse(stored) : [];
          const index = games.findIndex((g: any) => g.id === gameId);
          if (index !== -1) {
              games[index].player2Id = player2Id;
              games[index].status = 'PLAYING';
              localStorage.setItem('caro_games', JSON.stringify(games));
          }
      }
  },

  updateCaroMove: async (gameId: string, board: any[][], nextTurn: string, winnerId: string | null): Promise<void> => {
      const status = winnerId ? 'FINISHED' : 'PLAYING';
      if (supabase) {
          await supabase.from('caro_games').update({ 
              board: JSON.stringify(board), 
              turn: nextTurn, 
              winnerId, 
              status 
          }).eq('id', gameId);
      } else {
          const stored = localStorage.getItem('caro_games');
          const games = stored ? JSON.parse(stored) : [];
          const index = games.findIndex((g: any) => g.id === gameId);
          if (index !== -1) {
              games[index].board = JSON.stringify(board);
              games[index].turn = nextTurn;
              games[index].winnerId = winnerId;
              games[index].status = status;
              localStorage.setItem('caro_games', JSON.stringify(games));
          }
      }
  },

  getAvailableCaroGames: async (): Promise<any[]> => {
      if (supabase) {
          const { data } = await supabase.from('caro_games').select('*').eq('status', 'WAITING');
          return data || [];
      }
      const stored = localStorage.getItem('caro_games');
      const games = stored ? JSON.parse(stored) : [];
      return games.filter((g: any) => g.status === 'WAITING');
  },

  getCaroGame: async (gameId: string): Promise<any> => {
      if (supabase) {
          const { data } = await supabase.from('caro_games').select('*').eq('id', gameId).single();
          return data;
      }
      const stored = localStorage.getItem('caro_games');
      const games = stored ? JSON.parse(stored) : [];
      return games.find((g: any) => g.id === gameId);
  }
};