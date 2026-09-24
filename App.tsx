import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { User, Task, UserRole, UserDepartment, TaskStatus, RecurringType, AppNotification, TaskPriority, Utility, UserPermission } from './types';
import { MockDB } from './services/mockDatabase';
import { CLOUD_CONFIG_KEY, SESSION_EXPIRED_EVENT } from './lib/supabase';
import { Button, Input, StatusBadge, PriorityBadge, RecurringBadge, Select, Avatar, CountUp, SkeletonList } from './components/UI';
import { TaskModal } from './components/TaskModal';
const UserManagementModal = lazy(() => import('./components/UserManagementModal').then(m => ({ default: m.UserManagementModal })));
import { CloudSyncModal } from './components/CloudSyncModal';
const RemindModal = lazy(() => import('./components/RemindModal').then(m => ({ default: m.RemindModal })));
const CalendarView = lazy(() => import('./components/CalendarView').then(m => ({ default: m.CalendarView })));
const MeetingManager = lazy(() => import('./components/MeetingManager').then(m => ({ default: m.MeetingManager })));
const AttendanceScanner = lazy(() => import('./components/AttendanceScanner').then(m => ({ default: m.AttendanceScanner })));
const AbsenceReport = lazy(() => import('./components/AbsenceReport').then(m => ({ default: m.AbsenceReport })));
import { GuestCheckIn } from './components/GuestCheckIn';
import { RegisterModal, ForgotPasswordModal } from './components/AuthModals';
import { LOGO_URL, ORG_PARENT, ORG_NAME } from './lib/brand';
import { InstallSheet, InstallBanner, InAppNotice, InstallPage, useInstallEnv } from './components/InstallGuide';
import { INSTALL_PATH } from './lib/install';
import {
  Home, ClipboardList, QrCode, CalendarDays, Map as MapIcon, LayoutGrid, Inbox, Users, Download,
  KeyRound, LogOut, RefreshCw, Bell, BellOff, Menu, X, ChevronRight, Settings2, Plus, FileSpreadsheet,
  ImageDown, AlertTriangle, Clock, CheckCircle2, Link2, Repeat, Pencil, MessageSquareQuote, FolderOpen, Zap
} from 'lucide-react';

const MapDuty = lazy(() => import('./components/MapDuty/MapDuty').then(module => ({ default: module.MapDuty })));

const LoadingBox: React.FC = () => <SkeletonList rows={3} className="max-w-3xl" />;


// Thông tin Supabase mặc định của đơn vị (dán vào đây để mọi máy tự kết nối,
// cán bộ không phải nhập tay). Lấy tại Project Settings → API.
const DEFAULT_SUPABASE_URL = 'https://rjbksfktqyfuyemzasfw.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_5ANnavakp9N3sTovL3eQyg_Yl12i04I';

// Khởi tạo kết nối máy chủ (dùng chung cho cả trang khách mời)
const ensureCloudConnected = () => {
  if (MockDB.isCloudEnabled()) return;
  let cfg: any = null;
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY) || localStorage.getItem('supabaseConfig');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.supabaseUrl && parsed.supabaseKey) cfg = parsed;
    }
  } catch { /* bỏ qua */ }
  if (!cfg && DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_KEY) {
    cfg = { supabaseUrl: DEFAULT_SUPABASE_URL, supabaseKey: DEFAULT_SUPABASE_KEY };
    try { localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cfg)); } catch { /* bỏ qua */ }
  }
  if (cfg) MockDB.initializeCloud(cfg);
};

// Helper for safe rendering
const renderSafeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.title || val.content || val.message || JSON.stringify(val);
  }
  return String(val);
};

// Nhãn chức vụ hiển thị
const roleLabel = (role?: UserRole | string) => ({
  [UserRole.ADMIN]: 'Quản trị viên',
  [UserRole.CHIEF]: 'Trưởng CAP',
  [UserRole.DEPUTY_CHIEF]: 'Phó Trưởng CAP',
  [UserRole.MANAGER]: 'Tổ trưởng',
  [UserRole.DEPUTY]: 'Tổ phó',
  [UserRole.OFFICER]: 'Cán bộ'
} as Record<string, string>)[role || ''] || 'Cán bộ';

// Helper to check for Leadership Permission
const isLeader = (role: UserRole) => 
  role === UserRole.MANAGER || 
  role === UserRole.DEPUTY || 
  role === UserRole.ADMIN || 
  role === UserRole.CHIEF || 
  role === UserRole.DEPUTY_CHIEF;

// Helper to check granular permissions
const hasPermission = (user: User | null, permission: UserPermission): boolean => {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true; // Admin has all permissions
  
  // Check explicit permissions
  if (user.permissions && user.permissions.includes(permission)) return true;
  
  // Role-based defaults (fallback if permissions array is empty or undefined)
  switch (permission) {
    case UserPermission.MANAGE_USERS:
      return user.role === UserRole.CHIEF;
    case UserPermission.ASSIGN_TASKS:
      return isLeader(user.role);
    case UserPermission.VIEW_STATISTICS:
      return isLeader(user.role);
    case UserPermission.MANAGE_WEEKLY_CALENDAR:
      return false; // Only Admin by default
    case UserPermission.VIEW_WEEKLY_CALENDAR:
      return false; // Only Admin by default
    case UserPermission.MANAGE_UTILITIES:
      return isLeader(user.role);
    case UserPermission.MANAGE_ATTENDANCE:
      return user.role === UserRole.CHIEF || user.role === UserRole.DEPUTY_CHIEF; // Admin, Ban chỉ huy, or explicitly permitted users
    case UserPermission.MANAGE_MAP_DUTY:
      return false; // Only Admin by default as requested
    default:
      return false;
  }
};

type ViewState = 'HOME' | 'DASHBOARD' | 'PROPOSALS' | 'CALENDAR' | 'UTILITIES' | 'ATTENDANCE' | 'MAP_DUTY';

// Updated Default Utilities - Empty as requested
const DEFAULT_UTILITIES: Utility[] = [];

// Toast Notification Component
const ToastNotification: React.FC<{ title: string; message: string; type?: string; visible: boolean; onClose: () => void }> = ({ title, message, type, visible, onClose }) => {
  if (!visible) return null;
  const isTaskAlert = type === 'TASK_ASSIGNED';
  return (
    <div role="status" onClick={onClose}
      className="fixed top-3 right-3 left-3 md:left-auto z-[130] md:w-96 bg-white rounded-xl border border-stone-200 shadow-xl p-3.5 anim-toast cursor-pointer">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isTaskAlert ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-600'}`}>
          {isTaskAlert ? <Zap className="w-[18px] h-[18px]" /> : <Bell className="w-[18px] h-[18px]" />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-stone-900">{title}</h4>
          <p className="text-[13px] mt-0.5 leading-snug text-stone-600">{message}</p>
        </div>
        <button onClick={onClose} aria-label="Đóng" className="text-stone-400 hover:text-stone-700 p-0.5"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

/** Màu khối biểu tượng của từng module (kiểu khối 3D) */
const MODULE_COLOR: Record<string, string> = {
  HOME: '#475569', DASHBOARD: '#c1121f', ATTENDANCE: '#0f766e', CALENDAR: '#1d4ed8', MAP_DUTY: '#b45309',
  UTILITIES: '#6d28d9', PROPOSALS: '#0369a1', USERS: '#374151', INSTALL: '#15803d'
};

const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  HOME: { title: 'Trang chủ', subtitle: '' },
  DASHBOARD: { title: 'Sổ giao việc', subtitle: 'Giao việc, theo dõi tiến độ và hạn xử lý' },
  PROPOSALS: { title: 'Hòm thư đề xuất', subtitle: 'Ý kiến, kiến nghị của cán bộ chiến sĩ' },
  CALENDAR: { title: 'Lịch cá nhân', subtitle: 'Lịch làm việc, lịch trực và sự kiện' },
  UTILITIES: { title: 'Tiện ích', subtitle: 'Công cụ và liên kết hỗ trợ nghiệp vụ' },
  ATTENDANCE: { title: 'Điểm danh hội nghị', subtitle: 'Tạo hội nghị, điểm danh bằng mã QR và báo cáo vắng mặt' },
  MAP_DUTY: { title: 'Sơ đồ bảo vệ', subtitle: 'Phân công và theo dõi vị trí các chốt' }
};

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [attendanceMode, setAttendanceMode] = useState<'MANAGE' | 'SCAN' | 'REPORT'>('MANAGE');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false); 
  const [showRemindModal, setShowRemindModal] = useState(false); // New State for Reminder Modal
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCloudActive, setIsCloudActive] = useState(false);
  
  // Toast State
  const [toastVisible, setToastVisible] = useState(false);
  const [toastContent, setToastContent] = useState({ title: '', message: '', type: '' });
  
  // Utilities State
  const [utilities, setUtilities] = useState<Utility[]>(DEFAULT_UTILITIES);
  const [showUtilityModal, setShowUtilityModal] = useState(false);
  const [editingUtility, setEditingUtility] = useState<Utility | null>(null);
  
  // Utility Form State
  const [utilName, setUtilName] = useState('');
  const [utilUrl, setUtilUrl] = useState('');
  const [utilIconUrl, setUtilIconUrl] = useState('');

  // Filter & Sort State
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterCreator, setFilterCreator] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<string>('NEWEST');
  const [searchQuery, setSearchQuery] = useState(''); 
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Guest Session State
  const [guestSession, setGuestSession] = useState<{ id: string, slot: number, code: string } | null>(null);

  // Calendar State
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date>(new Date());
  
  // Login State
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  // Change Pass State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification Logic
  const notifRef = useRef<HTMLDivElement>(null);
  const notificationSound = useRef<HTMLAudioElement | null>(null); // Ref for audio
  const prevNotifCountRef = useRef<number>(0);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  
  // Cài ứng dụng lên màn hình chính (Android một chạm, iPhone hướng dẫn, Zalo/Facebook chuyển trình duyệt)
  const installEnv = useInstallEnv();
  const isStandalone = installEnv.standalone;
  const [showInstall, setShowInstall] = useState(false);
  const handleInstallApp = () => setShowInstall(true);

  // LOGIC: Sidebar only visible in Task Book Module AND Calendar Module AND Utilities
  // Include UTILITIES here so it gets the standard header with Refresh button
  const isTaskView = ['DASHBOARD', 'PROPOSALS', 'CALENDAR', 'UTILITIES', 'MAP_DUTY'].includes(currentView);

  // Buộc đăng xuất (phiên hết hạn, tài khoản bị xoá/khoá)
  const forceLogout = (message?: string) => {
    const hadUser = !!localStorage.getItem('currentUser');
    MockDB.logout().catch(() => {});
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_BACKGROUND_LISTENER' }); } catch { /* bỏ qua */ }
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    if (hadUser && message) setTimeout(() => alert(message), 50);
  };

  const reloadData = async () => {
    ensureCloudConnected();
    let cloudConfig: any = null;
    try {
      const storedConfig = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (storedConfig) cloudConfig = JSON.parse(storedConfig);
    } catch { /* bỏ qua */ }

    setIsCloudActive(MockDB.isCloudEnabled());

    // --- SERVICE WORKER BACKGROUND INIT ---
    // If we have cloud config and user, send to SW for background processing
    if (cloudConfig && currentUser && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'INIT_BACKGROUND_LISTENER',
            payload: {
                supabaseUrl: cloudConfig.supabaseUrl,
                supabaseKey: cloudConfig.supabaseKey,
                userId: currentUser.id
            }
        });
    }

    // Gộp cán bộ + nhiệm vụ + thông báo vào MỘT lần gọi mạng
    const { users: fetchedUsers, tasks: fetchedTasks, notifications: notifs } =
      await MockDB.bootstrap(currentUser?.id);

    setUsers(fetchedUsers);
    setTasks(fetchedTasks);

    // Lưu bản chụp để lần mở sau hiện dữ liệu ngay, không phải chờ mạng
    try {
      localStorage.setItem('snapshot_users', JSON.stringify(fetchedUsers));
      localStorage.setItem('snapshot_tasks', JSON.stringify(fetchedTasks));
    } catch (e) { /* bộ nhớ đầy thì bỏ qua */ }

    if (currentUser) {
       setNotifications(notifs);
       return { users: fetchedUsers, tasks: fetchedTasks, notifications: notifs };
    }
    
    const globalUtilities = await MockDB.getGlobalUtilities();
    const storedLocal = localStorage.getItem('personal_utilities');
    const localUtilities = storedLocal ? JSON.parse(storedLocal) : [];
    const hiddenSystemUtils = JSON.parse(localStorage.getItem('hidden_system_utilities') || '[]');
    const activeDefaultUtilities = DEFAULT_UTILITIES.filter(u => !hiddenSystemUtils.includes(u.id));
    setUtilities([...activeDefaultUtilities, ...globalUtilities, ...localUtilities]);

    return { users: fetchedUsers, tasks: fetchedTasks, notifications: [] };
  };

  useEffect(() => {
    const initData = async () => {
      // Check for Guest Session URL
      const urlParams = new URLSearchParams(window.location.search);
      const guestSessionId = urlParams.get('guest_session');
      if (guestSessionId) {
        // Mã QR khách mời có thể mang theo cấu hình máy chủ (khi chưa đặt cấu hình mặc định)
        const cfgParam = urlParams.get('c');
        if (cfgParam && !MockDB.isCloudEnabled()) {
          try {
            const cfg = JSON.parse(decodeURIComponent(escape(atob(cfgParam))));
            if (cfg.u && cfg.k) MockDB.initializeCloud({ supabaseUrl: cfg.u, supabaseKey: cfg.k });
          } catch { /* bỏ qua cấu hình hỏng */ }
        }
        ensureCloudConnected();
        setGuestSession({ id: guestSessionId, slot: Number(urlParams.get('s')), code: urlParams.get('k') || '' });
        setIsLoading(false);
        return;
      }

      // 1. Immediate UI Unblock: Load User from LocalStorage
      // Hiện ngay dữ liệu lần trước để không phải nhìn màn hình trống
    try {
      const snapUsers = localStorage.getItem('snapshot_users');
      const snapTasks = localStorage.getItem('snapshot_tasks');
      if (snapUsers) setUsers(JSON.parse(snapUsers));
      if (snapTasks) setTasks(JSON.parse(snapTasks));
    } catch (e) { /* bỏ qua bản chụp hỏng */ }

    const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        try {
            const u = JSON.parse(savedUser);
            setCurrentUser(u); // Hiện giao diện ngay, xác minh phiên ở dưới
            setCurrentView('HOME');
            if (u.isFirstLogin) setShowChangePassModal(true);
        } catch (e) {
            console.error("Failed to parse saved user", e);
        }
      }

      // 2. Stop Loading Spinner Immediately
      setIsLoading(false);

      // 3. Load Data in Background
      ensureCloudConnected();
      if (savedUser) {
          // Xác minh phiên đăng nhập với máy chủ + cập nhật chức vụ/quyền mới nhất
          MockDB.touchSession().then(res => {
              if (res.ok && res.user) {
                  setCurrentUser(res.user);
                  localStorage.setItem('currentUser', JSON.stringify(res.user));
              } else if (!res.ok && res.expired) {
                  forceLogout('Phiên đăng nhập đã hết hạn hoặc hệ thống vừa được nâng cấp bảo mật. Vui lòng đăng nhập lại.');
              }
          }).catch(console.error);
      }
      reloadData().then(async () => {
          if (savedUser) {
             const u = JSON.parse(savedUser);
             const notifs = await MockDB.getNotifications(u.id);
             setNotifications(notifs);
             prevNotifCountRef.current = notifs.length;
          }
      }).catch(console.error);
      
      if ('Notification' in window) {
        setPermissionStatus(Notification.permission);
        if (Notification.permission === 'granted') {
            registerBackgroundSync();
        }
      }

      // Lazy Audio Init
      setTimeout(() => {
          notificationSound.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
      }, 1000);

      const unlockAudio = () => {
        if (notificationSound.current) {
            notificationSound.current.play().then(() => {
                notificationSound.current!.pause();
                notificationSound.current!.currentTime = 0;
            }).catch(() => {});
        }
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
      };
      document.addEventListener('click', unlockAudio);
      document.addEventListener('touchstart', unlockAudio);

      // Listen for messages from Service Worker (e.g. Refresh Data)
      if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', (event) => {
              if (event.data && (event.data.type === 'REFRESH_DATA' || event.data.type === 'BACKGROUND_REFRESH_COMPLETE')) {
                  console.log("Received Refresh signal from SW:", event.data.type);
                  reloadData();
              }
          });
      }
    };
    initData();

    let reloadTimer: any = null;
    const unsubscribe = MockDB.subscribe((table?: string) => {
       if (table && table.startsWith('attendance_')) return;
       if (reloadTimer) clearTimeout(reloadTimer);
       reloadTimer = setTimeout(() => { reloadData().catch(console.error); }, 1500);
    });

    const onExpired = () => forceLogout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    return () => {
      unsubscribe();
      if (reloadTimer) clearTimeout(reloadTimer);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  // --- KIỂM TRA THÔNG BÁO ĐỊNH KỲ (20 giây) ---
  // Trước đây 5 giây/lần và tải lại TOÀN BỘ dữ liệu -> nghẽn máy chủ, máy chạy chậm.
  // Nay cơ chế đồng bộ tức thời (realtime) đã lo việc cập nhật, đây chỉ là lớp dự phòng.
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
        if (document.hidden) return; // tab ẩn thì không hỏi máy chủ
        const latestNotifs = await MockDB.getNotifications(currentUser.id);
        setNotifications(latestNotifs);

        // Backup notification check if SW fails or local mode
        if (latestNotifs.length > prevNotifCountRef.current && prevNotifCountRef.current > 0) {
             const newest = latestNotifs[0]; 
             
             if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
                 // Try Service Worker first
                 if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(reg => {
                       // Note: Logic moved to SW mostly, but this is a fallback trigger
                       // Sending 'Tag' ensures we don't duplicate notifications if SW already showed it
                       reg.getNotifications({ tag: newest.id }).then(existing => {
                           if (existing.length === 0) {
                               reg.showNotification(newest.title, {
                                  body: newest.message,
                                  icon: LOGO_URL,
                                  tag: newest.id,
                                  requireInteraction: true,
                                  // @ts-ignore
                                  vibrate: [500, 200, 500],
                                  data: { url: '/', taskId: newest.taskId }
                               });
                           }
                       });
                    });
                 }
                 
                 if (notificationSound.current) {
                    notificationSound.current.currentTime = 0;
                    notificationSound.current.play().catch(() => {});
                 }
             }
        }
        
        prevNotifCountRef.current = latestNotifs.length;

    }, 20000); // 20 giây/lần

    return () => clearInterval(interval);
  }, [currentUser]);

  // --- REAL-TIME NOTIFICATION SYSTEM (EVENT BASED) ---
  useEffect(() => {
    if (!currentUser) return;

    // Listen specifically for new notification inserts (Realtime)
    const unsub = MockDB.addNotificationListener((newNotif) => {
       if (newNotif.userId === currentUser.id) {
          
          setNotifications(prev => [newNotif, ...prev]);
          prevNotifCountRef.current += 1;

          const isTaskAssignment = newNotif.type === 'TASK_ASSIGNED';

          setToastContent({ 
              title: isTaskAssignment ? 'NHIỆM VỤ MỚI!' : newNotif.title, 
              message: newNotif.message,
              type: newNotif.type
          });
          setToastVisible(true);
          setTimeout(() => setToastVisible(false), isTaskAssignment ? 8000 : 5000); 

          if (notificationSound.current) {
             notificationSound.current.currentTime = 0;
             notificationSound.current.volume = 1.0;
             notificationSound.current.play().catch(e => console.log('Autoplay prevented', e));
          }

          if (navigator.vibrate) {
             // Distinctive vibration pattern for New Task vs General Notification
             if (isTaskAssignment) {
                 // Strong, Long pattern: Buzz... wait... Buzz... wait... Buzz
                 navigator.vibrate([500, 100, 500, 100, 1000]); 
             } else {
                 // Simple beep
                 navigator.vibrate([200, 100, 200]); 
             }
          }
       }
    });

    return () => unsub();
  }, [currentUser]);

  // --- HEARTBEAT EFFECT (REAL-TIME STATUS) ---
  useEffect(() => {
    if (!currentUser) return;

    const heartbeat = setInterval(async () => {
        if (document.hidden) return;
        const res = await MockDB.touchSession();
        if (res.ok && res.user) {
            setCurrentUser(res.user);
            localStorage.setItem('currentUser', JSON.stringify(res.user));
        }
    }, 4 * 60 * 1000); // 4 phút

    return () => clearInterval(heartbeat);
  }, [currentUser?.id]); 

  // Legacy local effect for notifications (keep as fallback)
  useEffect(() => {
    // Only update ref, logic moved to polling & listener
    // prevNotifCountRef.current = notifications.length; 
  }, [notifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifRef]);

  async function registerBackgroundSync() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        
        // Register for one-off sync
        if ('sync' in registration) {
          try {
            await (registration as any).sync.register('sync-data');
            console.log('Background sync registered');
          } catch (err) {
            console.log('Background sync registration failed:', err);
          }
        }

        // Register for periodic sync
        if ('periodicSync' in registration) {
          try {
            const status = await navigator.permissions.query({
              name: 'periodic-background-sync' as any,
            });
            if (status.state === 'granted') {
              await (registration as any).periodicSync.register('app-refresh', {
                minInterval: 15 * 60 * 1000, // 15 minutes
              });
              console.log('Periodic background sync registered');
            } else {
              console.log('Periodic background sync permission not granted');
            }
          } catch (err) {
            console.log('Periodic background sync registration failed:', err);
          }
        }
      } catch (err) {
        console.error('Service worker not ready for sync registration:', err);
      }
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        alert("Trình duyệt của bạn không hỗ trợ thông báo.");
        return;
    }
    
    try {
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);
        if (permission === 'granted') {
            if (notificationSound.current) notificationSound.current.play().catch(() => {});
            
            // Register background sync
            await registerBackgroundSync();

            // Try to use Service Worker registration for the "Welcome" notification
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification("Hệ thống Công An Phường", {
                        body: "Đã bật thông báo thành công! Tính năng chạy ẩn đã kích hoạt.",
                        icon: LOGO_URL,
                        ...({ vibrate: [200, 100, 200] } as any)
                    });
                });
            } else {
                new Notification("Hệ thống Công An Phường", {
                    body: "Đã bật thông báo thành công! Bạn sẽ nhận được tin khi có công việc mới.",
                    icon: LOGO_URL
                });
            }
        }
    } catch (e) {
        console.error("Permission request error", e);
    }
  };
  
  const handleTestNotification = () => {
     if (permissionStatus === 'granted') {
         if (notificationSound.current) notificationSound.current.play().catch(() => {});
         if (navigator.vibrate) navigator.vibrate([500, 100, 500, 100, 1000]);
         
         if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("Test Thông báo", { 
                    body: "Rung và chuông đang hoạt động!",
                    icon: LOGO_URL,
                    ...({ vibrate: [500, 100, 500, 100, 1000] } as any)
                });
            });
         } else {
            new window.Notification("Test Thông báo", { body: "Hệ thống hoạt động bình thường!", icon: LOGO_URL });
         }
     } else {
         alert("Vui lòng cấp quyền thông báo trước.");
     }
  };

  const formatDateForInput = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  // --- Utilities Logic ---
  const openUtilityModal = (utility?: Utility) => {
    if (utility) {
      setEditingUtility(utility);
      setUtilName(utility.name);
      setUtilUrl(utility.url);
      setUtilIconUrl(utility.icon || '');
    } else {
      setEditingUtility(null);
      setUtilName('');
      setUtilUrl('');
      setUtilIconUrl('');
    }
    setShowUtilityModal(true);
  };

  const handleSaveUtility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utilName || !utilUrl || !currentUser) return;

    let finalUrl = utilUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
    }

    let finalIcon = utilIconUrl;
    if (!finalIcon) {
       try {
           const domain = new URL(finalUrl).hostname;
           finalIcon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
       } catch (e) {
           finalIcon = "https://cdn-icons-png.flaticon.com/512/1006/1006771.png";
       }
    }

    const scope = currentUser.role === UserRole.ADMIN ? 'SHARED' : 'PERSONAL';

    const newUtil: Utility = {
       id: editingUtility ? editingUtility.id : `${scope.toLowerCase()}_${Date.now()}`,
       name: utilName,
       url: finalUrl,
       icon: finalIcon,
       scope: editingUtility?.scope === 'SYSTEM' ? 'SYSTEM' : scope, 
       creatorId: currentUser.id
    };
    
    if (editingUtility && editingUtility.scope === 'SYSTEM') {
        alert("Không thể chỉnh sửa trực tiếp tiện ích hệ thống. Vui lòng thêm mới.");
        return;
    }

    if (currentUser.role === UserRole.ADMIN) {
        await MockDB.saveGlobalUtility(newUtil);
    } else {
        const storedLocal = localStorage.getItem('personal_utilities');
        let localUtilities: Utility[] = storedLocal ? JSON.parse(storedLocal) : [];
        
        if (editingUtility) {
            localUtilities = localUtilities.map(u => u.id === editingUtility.id ? newUtil : u);
        } else {
            localUtilities.push(newUtil);
        }
        localStorage.setItem('personal_utilities', JSON.stringify(localUtilities));
    }

    await reloadData();

    setUtilName('');
    setUtilUrl('');
    setUtilIconUrl('');
    setEditingUtility(null);
    setShowUtilityModal(false);
  };

  const handleDeleteUtility = async (e: React.MouseEvent, utility: Utility) => {
    e.stopPropagation();
    const isUserLeader = isLeader(currentUser?.role || UserRole.OFFICER);

    if (utility.scope === 'SYSTEM') {
        if (!isUserLeader) {
            alert("Bạn không có quyền xóa tiện ích hệ thống.");
            return;
        }
    }
    
    if (utility.scope === 'SHARED' && !isUserLeader) {
        alert("Chỉ lãnh đạo mới có quyền xóa tiện ích chung.");
        return;
    }

    if (window.confirm('Bạn có chắc muốn xóa tiện ích này?')) {
        if (utility.scope === 'SYSTEM') {
            const hidden = JSON.parse(localStorage.getItem('hidden_system_utilities') || '[]');
            hidden.push(utility.id);
            localStorage.setItem('hidden_system_utilities', JSON.stringify(hidden));
        } else if (utility.scope === 'SHARED') {
            await MockDB.deleteGlobalUtility(utility.id);
        } else {
            const storedLocal = localStorage.getItem('personal_utilities');
            let localUtilities: Utility[] = storedLocal ? JSON.parse(storedLocal) : [];
            localUtilities = localUtilities.filter(u => u.id !== utility.id);
            localStorage.setItem('personal_utilities', JSON.stringify(localUtilities));
        }
        await reloadData();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Xác thực trước, tải dữ liệu sau -> vào được hệ thống nhanh hơn nhiều
    const { user, message } = await MockDB.loginEx(usernameInput, passwordInput);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      setCurrentView('HOME');
      // Tải dữ liệu nền, không chặn màn hình
      reloadData().catch(console.error);
      MockDB.getNotifications(user.id).then(setNotifications).catch(console.error);
      if (user.isFirstLogin) {
        setShowChangePassModal(true);
      }
      
      // Request permission immediately on login if possible
      if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
      }
    } else {
      alert(message || 'Đăng nhập thất bại. Kiểm tra lại thông tin.');
    }
    setIsLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('Mật khẩu xác nhận không khớp');
      return;
    }
    if (newPassword.length < 6) {
      alert('Mật khẩu phải từ 6 ký tự trở lên');
      return;
    }

    if (currentUser) {
      if (!oldPassword) {
        alert('Vui lòng nhập mật khẩu hiện tại');
        return;
      }
      const result = await MockDB.changePassword(currentUser.username, oldPassword, newPassword);
      if (!result.ok) {
        alert(result.message);
        return;
      }
      const updatedUser = { ...currentUser, isFirstLogin: false };
      setCurrentUser(updatedUser);
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      setShowChangePassModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Đổi mật khẩu thành công!');
    }
  };

  const handleLogout = () => {
    MockDB.logout().catch(console.error);
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_BACKGROUND_LISTENER' }); } catch { /* bỏ qua */ }
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    setUsernameInput('');
    setPasswordInput('');
  };

  const handleSaveTask = async (task: Task) => {
    setIsLoading(true);
    await MockDB.saveTask(task);
    await reloadData();
    setShowTaskModal(false);
    setEditingTask(null);
    setIsLoading(false);
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa công việc này? Hành động này không thể hoàn tác.')) return;
    setIsLoading(true);
    setTasks(prev => prev.filter(t => t.id !== id));
    setShowTaskModal(false);
    setEditingTask(null);
    await MockDB.deleteTask(id);
    await reloadData();
    setIsLoading(false);
  };

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    await MockDB.markAllRead(currentUser.id);
    if (!isCloudActive) setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!isCloudActive) setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
    MockDB.markRead(notification.id);

    if (notification.taskId) {
      const task = tasks.find(t => t.id === notification.taskId);
      if (task) {
         setEditingTask(task);
         setShowTaskModal(true);
         setShowNotifPanel(false); 
         setCurrentView('DASHBOARD');
         
         if (currentUser && isLeader(currentUser.role) && task.proposal) {
            handleViewProposal(task);
         }
      } else {
         alert('Công việc này có thể đã bị xóa.');
      }
    }
  };

  const openNewTaskModal = () => { setEditingTask(null); setShowTaskModal(true); };
  
  const openEditTaskModal = (task: Task) => { 
    setEditingTask(task); 
    setShowTaskModal(true);
    if (currentUser && isLeader(currentUser.role) && task.proposal && !task.isProposalRead) {
       handleViewProposal(task);
    }
  };

  const handleViewProposal = async (task: Task) => {
     const updatedTask = { ...task, isProposalRead: true };
     setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
     await MockDB.saveTask(updatedTask);
  };

  const handleRefreshData = async () => {
    setIsLoading(true);
    await reloadData();
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
  };

  // --- Statistics Logic ---
  const officerStats = useMemo(() => {
    if (!users.length || !tasks.length) return [];
    const officers = users.filter(u => u.role === UserRole.OFFICER);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return officers.map(officer => {
      const officerTasks = tasks.filter(t => t.assigneeIds.includes(officer.id));
      const total = officerTasks.length;
      const completed = officerTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      const pending = officerTasks.filter(t => t.status === TaskStatus.PENDING).length;
      const inProgress = officerTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
      const accepted = officerTasks.filter(t => !!t.acceptedAt).length; 
      
      const overdue = officerTasks.filter(t => {
         if (t.isRegularDuty) return false;
         const dueDate = new Date(t.dueDate);
         dueDate.setHours(0, 0, 0, 0);
         return t.status === TaskStatus.OVERDUE || 
               (dueDate < startOfToday && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED);
      }).length;
      
      const todo = pending + inProgress;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { user: officer, total, completed, todo, overdue, accepted, completionRate };
    }).sort((a, b) => b.todo - a.todo);
  }, [users, tasks]);

  const absentOfficers = useMemo(() => {
    if (!users.length) return [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startTimestamp = todayStart.getTime();

    return users.filter(u => 
        u.role === UserRole.OFFICER && 
        (!u.lastLoginAt || u.lastLoginAt < startTimestamp)
    );
  }, [users]);

  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];
    let result = tasks;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const canSeeAll = currentUser.role === UserRole.ADMIN || 
                     currentUser.role === UserRole.CHIEF || 
                     (currentUser.role === UserRole.DEPUTY_CHIEF && currentUser.department === UserDepartment.PHU_TRACH_CHUNG);

    if (currentUser.role === UserRole.OFFICER) {
      result = result.filter(t => t.assigneeIds.includes(currentUser.id));
    } else if (!canSeeAll) {
      // Manager, Deputy, or Deputy Chief with specific department: Only see tasks related to their department
      const departmentUserIds = users
          .filter(u => u.department === currentUser.department)
          .map(u => u.id);
          
      result = result.filter(t => {
          const isCreator = t.creatorId === currentUser.id;
          const isAssignee = t.assigneeIds.includes(currentUser.id);
          const hasDepartmentAssignee = t.assigneeIds.some(id => departmentUserIds.includes(id));
          
          return isCreator || isAssignee || hasDepartmentAssignee;
      });
    } else {
      // Admin, Chief, or Deputy Chief (General) see all
      if (filterAssignee !== 'ALL') {
        result = result.filter(t => t.assigneeIds.includes(filterAssignee));
      }
    }
    
    if (filterCreator !== 'ALL') {
      result = result.filter(t => t.creatorId === filterCreator);
    }
    
    if (filterStatus === 'DUE_SOON') {
       const threeDaysFromNow = new Date(startOfToday);
       threeDaysFromNow.setDate(startOfToday.getDate() + 3);
       result = result.filter(t => {
         if (t.isRegularDuty) return false;
         const dueDate = new Date(t.dueDate);
         dueDate.setHours(0, 0, 0, 0);
         const isFutureOrToday = dueDate >= startOfToday;
         const isClose = dueDate <= threeDaysFromNow;
         return isFutureOrToday && isClose && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED && t.status !== TaskStatus.OVERDUE;
       });
    } else if (filterStatus === 'OVERDUE_FILTER') {
       result = result.filter(t => {
         if (t.isRegularDuty) return false;
         if (t.status === TaskStatus.OVERDUE) return true;
         const dueDate = new Date(t.dueDate);
         dueDate.setHours(0, 0, 0, 0);
         return (dueDate < startOfToday && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED);
       });
    } else if (filterStatus === 'RECURRING_ATTENTION') {
       result = result.filter(t => {
          const isRecurring = Array.isArray(t.recurring) 
             ? t.recurring.length > 0 && !t.recurring.includes(RecurringType.NONE)
             : t.recurring && t.recurring !== RecurringType.NONE;
          return isRecurring && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED;
       });
    } else if (filterStatus === 'ACCEPTED') {
       result = result.filter(t => !!t.acceptedAt);
    } else if (filterStatus === 'NOT_ACCEPTED') {
       result = result.filter(t => !t.acceptedAt);
    } else if (filterStatus !== 'ALL') {
       result = result.filter(t => t.status === filterStatus);
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(t => 
        renderSafeString(t.title).toLowerCase().includes(lowerQuery) || 
        renderSafeString(t.description).toLowerCase().includes(lowerQuery) ||
        (t.dispatchNumber && t.dispatchNumber.toLowerCase().includes(lowerQuery)) ||
        (t.issuingAuthority && t.issuingAuthority.toLowerCase().includes(lowerQuery))
      );
    }

    result.sort((a, b) => {
        switch (sortOption) {
            case 'NEWEST': return b.createdAt - a.createdAt;
            case 'OLDEST': return a.createdAt - b.createdAt;
            case 'DEADLINE_NEAR': return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            case 'DEADLINE_FAR': return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
            case 'ASSIGNEE_AZ': {
                const nameA = users.find(u => u.id === a.assigneeIds[0])?.fullName || '';
                const nameB = users.find(u => u.id === b.assigneeIds[0])?.fullName || '';
                return nameA.localeCompare(nameB);
            }
            case 'CREATOR_AZ': {
                const nameA = users.find(u => u.id === a.creatorId)?.fullName || '';
                const nameB = users.find(u => u.id === b.creatorId)?.fullName || '';
                return nameA.localeCompare(nameB);
            }
            default: return b.createdAt - a.createdAt;
        }
    });
    return result;
  }, [tasks, currentUser, filterStatus, filterAssignee, searchQuery, sortOption, users]);

  const calendarTasks = useMemo(() => {
    return filteredTasks;
  }, [filteredTasks]);

  const proposalTasks = useMemo(() => {
    return tasks.filter(t => t.proposal && t.proposal.trim() !== '' && !t.isProposalRead);
  }, [tasks]);

  const allProposalsHistory = useMemo(() => {
     return tasks.filter(t => t.proposal && t.proposal.trim() !== '');
  }, [tasks]);

  const stats = useMemo(() => {
    const base = filteredTasks;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(startOfToday);
    threeDaysFromNow.setDate(startOfToday.getDate() + 3);

    return {
      total: base.length,
      pending: base.filter(t => t.status === TaskStatus.PENDING).length,
      inProgress: base.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      completed: base.filter(t => t.status === TaskStatus.COMPLETED).length,
      accepted: base.filter(t => !!t.acceptedAt).length, 
      notAccepted: base.filter(t => !t.acceptedAt).length,
      overdue: base.filter(t => {
         if (t.isRegularDuty) return false;
         const dueDate = new Date(t.dueDate);
         dueDate.setHours(0, 0, 0, 0);
         return t.status === TaskStatus.OVERDUE || (dueDate < startOfToday && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED);
      }).length,
      dueSoon: base.filter(t => {
         if (t.isRegularDuty) return false;
         const dueDate = new Date(t.dueDate);
         dueDate.setHours(0, 0, 0, 0);
         return dueDate >= startOfToday && dueDate <= threeDaysFromNow && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED && t.status !== TaskStatus.OVERDUE;
      }).length
    };
  }, [tasks, currentUser]);

  const recurringAlerts = useMemo(() => {
     if (currentUser?.role === UserRole.OFFICER) return [];
     return tasks.filter(t => {
        const isRecurring = Array.isArray(t.recurring) 
             ? t.recurring.length > 0 && !t.recurring.includes(RecurringType.NONE)
             : t.recurring && t.recurring !== RecurringType.NONE;
        return isRecurring && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED;
     });
  }, [tasks, currentUser]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  
  const officerOptions = useMemo(() => {
     if (!currentUser) return [];
     const canSeeAll = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CHIEF;
     
     let officers = users.filter(u => u.role === UserRole.OFFICER);
     
     if (!canSeeAll && currentUser.role !== UserRole.OFFICER) {
        officers = officers.filter(u => u.department === currentUser.department);
     }
     
     return [
        { value: 'ALL', label: 'Tất cả cán bộ' },
        ...officers.map(u => ({ value: u.id, label: u.fullName }))
     ];
  }, [users, currentUser]);

  const leaderOptions = useMemo(() => {
     if (!currentUser) return [];
     const canSeeAll = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CHIEF;
     
     let leaders = users.filter(u => u.role === UserRole.MANAGER || u.role === UserRole.DEPUTY);
     
     if (!canSeeAll && currentUser.role !== UserRole.OFFICER) {
        leaders = leaders.filter(u => u.department === currentUser.department);
     }

     return [
        { value: 'ALL', label: 'Tất cả chỉ huy' },
        ...leaders.map(u => ({ value: u.id, label: u.fullName }))
     ];
  }, [users, currentUser]);
  
  const sortOptions = [
     { value: 'NEWEST', label: 'Mới nhất' },
     { value: 'OLDEST', label: 'Cũ nhất' },
     { value: 'DEADLINE_NEAR', label: 'Hạn chót: Gần - Xa' },
     { value: 'DEADLINE_FAR', label: 'Hạn chót: Xa - Gần' },
     { value: 'ASSIGNEE_AZ', label: 'Cán bộ (A-Z)' },
     { value: 'CREATOR_AZ', label: 'Người giao (A-Z)' },
  ];

  // --- VIEW RENDERERS ---
  const renderPlaceholder = (title: string, icon: string) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8 animate-fade-in-up">
      <div className="w-32 h-32 bg-stone-100/50 rounded-full flex items-center justify-center text-7xl mb-6 grayscale opacity-60">
        {icon}
      </div>
      <h2 className="text-2xl md:text-3xl font-bold text-stone-400">{title}</h2>
      <p className="text-stone-400 mt-3 font-medium text-lg">Chức năng đang được phát triển.</p>
      <Button variant="secondary" className="mt-8 px-8" onClick={() => setCurrentView('HOME')}>Quay lại Trang chủ</Button>
    </div>
  );

  const renderUtilities = () => (
    <div className="pb-20 animate-fade-in-up">
       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4">
          {/* Default & Custom Utilities */}
          {utilities.map(util => {
             const isUserLeader = isLeader(currentUser?.role || UserRole.OFFICER);
             const canDelete = 
                (util.scope === 'PERSONAL') || 
                (isUserLeader && (util.scope === 'SHARED' || util.scope === 'SYSTEM'));

             const canEdit = util.scope !== 'SYSTEM' && (
                (util.scope === 'PERSONAL') || (isUserLeader && util.scope === 'SHARED')
             );

             return (
             <div 
               key={util.id} 
               onClick={() => window.open(util.url, '_blank')}
               className="bg-white rounded-xl p-4 border border-stone-200 cursor-pointer card-3d group relative"
             >
                {util.scope === 'SHARED' && <span className="absolute top-2.5 left-2.5 text-[10px] font-medium bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">Chung</span>}
                {util.scope === 'PERSONAL' && <span className="absolute top-2.5 left-2.5 text-[10px] font-medium bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">Cá nhân</span>}
                {util.scope === 'SYSTEM' && <span className="absolute top-2.5 left-2.5 text-[10px] font-medium bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">Hệ thống</span>}

                {canDelete && (
                   <button 
                     onClick={(e) => handleDeleteUtility(e, util)}
                     className="absolute top-2 right-2 text-stone-300 hover:text-red-600 transition-colors z-10 p-1 hover:bg-red-50 rounded-full"
                     title="Xóa"
                   >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                   </button>
                )}
                
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openUtilityModal(util); }}
                    className={`absolute top-2 right-9 text-stone-300 hover:text-blue-600 transition-colors z-10 p-1 hover:bg-blue-50 rounded-full`}
                    title="Chỉnh sửa"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                  </button>
                )}

                <div className="flex flex-col items-center text-center h-full pt-4">
                   <div className="w-12 h-12 mb-3 rounded-lg bg-stone-50 flex items-center justify-center overflow-hidden border border-stone-200 p-1.5">
                      {util.icon ? (
                         <img src={util.icon} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                         <Link2 className="w-5 h-5 text-stone-500" />
                      )}
                   </div>
                   <h3 className="text-sm font-semibold text-stone-900 line-clamp-2 px-1">{util.name}</h3>
                   <p className="text-[11px] text-stone-400 mt-1 truncate w-full px-2">{new URL(util.url).hostname}</p>
                </div>
             </div>
             );
          })}

          <div onClick={() => openUtilityModal()} className="rounded-xl p-4 border border-dashed border-stone-300 cursor-pointer hover:bg-white hover:border-stone-400 transition-colors flex flex-col items-center justify-center text-stone-500 min-h-[140px] group">
             <Plus className="w-6 h-6 mb-2" />
             <span className="text-sm font-medium">Thêm tiện ích</span>
          </div>
       </div>
    </div>
  );

  const renderHome = () => {
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const openTask = (f: string) => { goTo('DASHBOARD'); setFilterStatus(f); };
    const summary = [
      { label: 'Đang xử lý', value: stats.pending + stats.inProgress, icon: Clock, tone: 'text-stone-900', onClick: () => openTask(TaskStatus.IN_PROGRESS) },
      { label: 'Sắp đến hạn', value: stats.dueSoon, icon: CalendarDays, tone: stats.dueSoon ? 'text-amber-700' : 'text-stone-900', onClick: () => openTask('DUE_SOON') },
      { label: 'Quá hạn', value: stats.overdue, icon: AlertTriangle, tone: stats.overdue ? 'text-red-700' : 'text-stone-900', onClick: () => openTask('OVERDUE_FILTER') },
      { label: 'Hoàn thành', value: stats.completed, icon: CheckCircle2, tone: 'text-stone-900', onClick: () => openTask(TaskStatus.COMPLETED) }
    ];
    const modules: { label: string; short?: string; desc: string; icon: React.ElementType; onClick: () => void; show?: boolean; c: string }[] = [
      { c: MODULE_COLOR.DASHBOARD, label: 'Sổ giao việc', desc: 'Giao việc, theo dõi tiến độ và hạn xử lý', icon: ClipboardList, onClick: () => goTo('DASHBOARD') },
      { c: MODULE_COLOR.ATTENDANCE, short: 'Điểm danh', label: 'Điểm danh hội nghị', desc: 'Quét mã QR, tạo hội nghị, báo cáo vắng mặt', icon: QrCode, onClick: () => goTo('ATTENDANCE') },
      { c: MODULE_COLOR.CALENDAR, label: 'Lịch cá nhân', desc: 'Lịch trực, lịch họp và sự kiện quan trọng', icon: CalendarDays, onClick: () => goTo('CALENDAR') },
      { c: MODULE_COLOR.MAP_DUTY, label: 'Sơ đồ bảo vệ', desc: 'Phân công, theo dõi vị trí các chốt trên bản đồ', icon: MapIcon, onClick: () => goTo('MAP_DUTY') },
      { c: MODULE_COLOR.UTILITIES, label: 'Tiện ích', desc: 'Tra cứu văn bản, danh bạ và công cụ hỗ trợ', icon: LayoutGrid, onClick: () => goTo('UTILITIES') },
      { c: MODULE_COLOR.USERS, label: 'Quản lý cán bộ', desc: 'Danh sách, chức vụ, phân quyền tài khoản', icon: Users, onClick: () => setShowUserModal(true), show: isLeader(currentUser?.role || UserRole.OFFICER) }
    ];
    return (
      <div>
        <InstallBanner onOpen={() => setShowInstall(true)} />
        <div className="mb-5 md:mb-7">
          <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight">{greet}, {currentUser?.fullName}</h2>
          <p className="text-sm text-stone-500 mt-1 first-letter:uppercase">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        <section className="stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-6 md:mb-9">
          {summary.map(({ label, value, icon: Icon, tone, onClick }) => (
            <button key={label} onClick={onClick} className="card-3d text-left bg-white border border-stone-200 rounded-xl px-4 py-3.5 md:px-5 md:py-4">
              <div className="flex items-center justify-between text-stone-500">
                <span className="text-[13px] font-medium">{label}</span><Icon className="w-4 h-4" />
              </div>
              <div className={`mt-1.5 text-[22px] md:text-[28px] font-semibold tabular leading-none ${tone}`}><CountUp value={value} /></div>
            </button>
          ))}
        </section>

        <h3 className="text-sm font-semibold text-stone-500 mb-3">Chức năng</h3>
        <section className="stagger delay-1 grid grid-cols-3 md:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4">
          {modules.filter(m => m.show !== false).map(({ label, short, desc, icon: Icon, onClick, c }) => (
            <button key={label} onClick={onClick}
              className="card-3d group bg-white border border-stone-200 rounded-2xl px-1.5 pt-4 pb-3.5 md:p-5 flex flex-col md:flex-row items-center md:items-center gap-2.5 md:gap-4 text-center md:text-left">
              <span className="icon-3d w-12 h-12 md:w-12 md:h-12 rounded-[14px] flex items-center justify-center shrink-0" style={{ ['--c' as any]: c }}>
                <Icon className="w-6 h-6" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 md:flex-1">
                <span className="block text-[12.5px] md:text-[15px] font-semibold text-stone-900 leading-tight"><span className="md:hidden">{short || label}</span><span className="hidden md:inline">{label}</span></span>
                <span className="hidden md:block text-[13px] text-stone-500 mt-1 leading-snug">{desc}</span>
              </span>
              <ChevronRight className="hidden md:block w-4 h-4 text-stone-300 group-hover:text-stone-500 shrink-0" />
            </button>
          ))}
        </section>
      </div>
    );
  };

  // Trang công khai hướng dẫn cài đặt (in mã QR / gửi link)
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === INSTALL_PATH) {
    return <InstallPage />;
  }

  if (guestSession) {
    return (
      <GuestCheckIn 
        sessionId={guestSession.id} 
        slot={guestSession.slot}
        code={guestSession.code}
      />
    );
  }

  if (showChangePassModal) {
    return (
      <div className="fixed inset-0 z-[100] bg-stone-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl border border-stone-200 p-6 md:p-7 max-w-md w-full relative">
           {!currentUser?.isFirstLogin && (
              <button onClick={() => setShowChangePassModal(false)} aria-label="Đóng" className="absolute top-3 right-3 p-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
           )}
           <div className="mb-5">
             <div className="w-10 h-10 mb-4 bg-stone-100 text-stone-700 rounded-lg flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
             <h2 className="text-lg font-semibold text-stone-900">Cập nhật mật khẩu</h2>
             <p className="text-stone-500 text-sm mt-1">{currentUser?.isFirstLogin ? 'Đây là lần đăng nhập đầu tiên. Vui lòng đặt mật khẩu riêng của đồng chí.' : 'Đặt mật khẩu mới để bảo vệ tài khoản.'}</p>
           </div>
           <form onSubmit={handleChangePassword} className="space-y-4">
             <Input type="password" label="Mật khẩu hiện tại" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required placeholder="Nhập mật khẩu đang dùng" />
             <Input type="password" label="Mật khẩu mới" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Ít nhất 6 ký tự" />
             <Input type="password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Nhập lại mật khẩu" />
             <Button type="submit" size="lg" className="w-full mt-2">Xác nhận đổi</Button>
           </form>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col">
        <InAppNotice onOpen={() => setShowInstall(true)} />
        <div className="flex justify-end p-3 md:p-4">
           <button onClick={() => setShowSyncModal(true)}
             className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
             {isCloudActive ? (<><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Đã kết nối</>) : (<><Settings2 className="w-3.5 h-3.5" />Cấu hình dữ liệu</>)}
           </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="w-full max-w-[380px]">
            <div className="text-center mb-7">
              <img src={LOGO_URL} alt="" className="w-14 h-14 mx-auto mb-4 object-contain" />
              <h1 className="text-xl font-semibold text-stone-900 tracking-tight">{ORG_NAME}</h1>
              <p className="text-sm text-stone-500 mt-1">{ORG_PARENT} · Hệ thống quản lý công việc</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <Input label="Tên đăng nhập" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Nhập tên đăng nhập..." autoComplete="username" autoCapitalize="none" />
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[13px] font-medium text-stone-700">Mật khẩu</label>
                    <button type="button" onClick={() => setShowForgotModal(true)} className="text-xs font-medium text-brand-700 hover:underline">Quên mật khẩu?</button>
                  </div>
                  <Input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Nhập mật khẩu..." autoComplete="current-password" />
                </div>
                <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>Đăng nhập</Button>
              </form>
            </div>
            <p className="text-center text-sm text-stone-500 mt-5">
              Chưa có tài khoản?{' '}
              <button type="button" onClick={() => setShowRegisterModal(true)} className="text-brand-700 font-semibold hover:underline">Đăng ký</button>
            </p>
            {!isStandalone && (
              <p className="text-center mt-3">
                <button type="button" onClick={() => setShowInstall(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900" data-testid="login-install">
                  <Download className="w-4 h-4" />Cài ứng dụng lên {installEnv.platform === 'desktop' ? 'máy tính' : 'điện thoại'}
                </button>
              </p>
            )}
          </div>
        </div>
        <CloudSyncModal isOpen={showSyncModal} onClose={() => setShowSyncModal(false)} onConfigSaved={reloadData} />
        <RegisterModal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)} />
        <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
        <InstallSheet open={showInstall} onClose={() => setShowInstall(false)} />
      </div>
    );
  }

  // ---------------- KHUNG ỨNG DỤNG ----------------
  const goTo = (v: ViewState) => {
    if (v === 'DASHBOARD') { setFilterStatus('ALL'); setFilterAssignee('ALL'); setFilterCreator('ALL'); setSortOption('NEWEST'); }
    setCurrentView(v);
    setIsMobileMenuOpen(false);
    setShowNotifPanel(false);
  };

  const NAV_ITEMS: { v: ViewState; label: string; icon: React.ElementType; show?: boolean; badge?: number }[] = [
    { v: 'HOME', label: 'Trang chủ', icon: Home },
    { v: 'DASHBOARD', label: 'Sổ giao việc', icon: ClipboardList, badge: stats.overdue || undefined },
    { v: 'ATTENDANCE', label: 'Điểm danh hội nghị', icon: QrCode },
    { v: 'CALENDAR', label: 'Lịch cá nhân', icon: CalendarDays },
    { v: 'MAP_DUTY', label: 'Sơ đồ bảo vệ', icon: MapIcon },
    { v: 'UTILITIES', label: 'Tiện ích', icon: LayoutGrid },
    { v: 'PROPOSALS', label: 'Hòm thư đề xuất', icon: Inbox, show: isLeader(currentUser.role), badge: proposalTasks.length || undefined }
  ];

  const navBtn = (active: boolean) =>
    `group w-full flex items-center gap-3 h-11 md:h-10 px-2 rounded-xl text-sm transition-colors ${active ? 'nav-on bg-white text-stone-900 font-semibold' : 'text-stone-700 hover:bg-stone-100/70 hover:text-stone-900'}`;
  const NavIcon: React.FC<{ icon: React.ElementType; c: string }> = ({ icon: Icon, c }) => (
    <span className="icon-3d sm w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ ['--c' as any]: c }}>
      <Icon className="w-4 h-4" strokeWidth={2} />
    </span>
  );

  const TASK_FILTERS: { st: TaskStatus; label: string; dot: string }[] = [
    { st: TaskStatus.PENDING, label: 'Chờ xử lý', dot: 'bg-stone-400' },
    { st: TaskStatus.IN_PROGRESS, label: 'Đang thực hiện', dot: 'bg-amber-500' },
    { st: TaskStatus.COMPLETED, label: 'Hoàn thành', dot: 'bg-emerald-600' },
    { st: TaskStatus.OVERDUE, label: 'Quá hạn', dot: 'bg-red-600' }
  ];

  const meta = VIEW_META[currentView] || VIEW_META.HOME;

  return (
    <div className="min-h-screen bg-orange-50 flex text-stone-900">

      <ToastNotification
         title={toastContent.title}
         message={toastContent.message}
         type={toastContent.type}
         visible={toastVisible}
         onClose={() => setToastVisible(false)}
      />

      {/* Gợi ý bật thông báo (điện thoại) */}
      {permissionStatus === 'default' && currentUser && (
        <div className="md:hidden fixed left-3 right-3 z-[60] bg-white border border-stone-200 rounded-xl shadow-lg p-3.5"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center shrink-0"><Bell className="w-[18px] h-[18px]" /></div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-stone-900">Bật thông báo</h4>
              <p className="text-[13px] text-stone-500 mt-0.5">Nhận ngay khi được giao việc, kể cả khi đã tắt ứng dụng.</p>
              <div className="mt-2.5 flex gap-2">
                <button onClick={requestNotificationPermission} className="h-8 px-3 bg-brand-700 text-white text-xs font-semibold rounded-lg">Bật thông báo</button>
                <button onClick={() => setPermissionStatus('denied')} className="h-8 px-3 text-stone-600 text-xs font-semibold rounded-lg hover:bg-stone-100">Để sau</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <InstallSheet open={showInstall} onClose={() => setShowInstall(false)} />

      {isMobileMenuOpen && (<div className="fixed inset-0 z-40 bg-stone-900/40 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

      {/* ============ THANH ĐIỀU HƯỚNG BÊN ============ */}
      <aside className={`fixed md:sticky top-0 left-0 z-50 h-screen w-[280px] md:w-64 shrink-0 bg-white border-r border-stone-200 flex flex-col transition-transform duration-200 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="h-16 px-4 flex items-center gap-3 border-b border-stone-200 shrink-0">
          <img src={LOGO_URL} alt="" className="w-8 h-8 object-contain" />
          <div className="min-w-0 leading-tight">
            <div className="text-[11px] text-stone-500 truncate">{ORG_PARENT}</div>
            <div className="text-sm font-semibold text-stone-900 truncate">CAP Nam Đông Hà</div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} aria-label="Đóng menu" className="md:hidden ml-auto p-1.5 -mr-1 rounded-lg text-stone-500 hover:bg-stone-100"><X className="w-5 h-5" /></button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.filter(i => i.show !== false).map(({ v, label, icon: Icon, badge }) => {
            const active = currentView === v;
            return (
              <button key={v} onClick={() => goTo(v)} className={navBtn(active)} aria-current={active ? 'page' : undefined}>
                <NavIcon icon={Icon} c={MODULE_COLOR[v]} />
                <span className="truncate">{label}</span>
                {badge ? <span className={`ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center tabular ${v === 'DASHBOARD' ? 'bg-red-50 text-red-700' : 'bg-stone-200 text-stone-700'}`}>{badge}</span> : null}
              </button>
            );
          })}

          {currentView === 'DASHBOARD' && (
            <>
              <div className="px-3 pt-5 pb-1.5 text-[11px] font-medium text-stone-400">Lọc theo trạng thái</div>
              {TASK_FILTERS.map(({ st, label, dot }) => {
                const active = filterStatus === st;
                return (
                  <button key={st} onClick={() => { setFilterStatus(active ? 'ALL' : st); setIsMobileMenuOpen(false); }} className={navBtn(active)}>
                    <span className="w-7 flex justify-center"><span className={`w-2.5 h-2.5 rounded-full ${dot} shadow-[inset_0_1px_1px_rgba(255,255,255,.5),0_1px_2px_rgba(0,0,0,.2)]`}></span></span>{label}
                  </button>
                );
              })}
            </>
          )}

          {isLeader(currentUser.role) && (
            <>
              <div className="px-3 pt-5 pb-1.5 text-[11px] font-medium text-stone-400">Hệ thống</div>
              <button onClick={() => { setShowUserModal(true); setIsMobileMenuOpen(false); }} className={navBtn(false)}>
                <NavIcon icon={Users} c={MODULE_COLOR.USERS} />Quản lý cán bộ
              </button>
            </>
          )}

          {!isStandalone && (
            <button onClick={() => { handleInstallApp(); setIsMobileMenuOpen(false); }} className={navBtn(false) + ' mt-1'}>
              <NavIcon icon={Download} c={MODULE_COLOR.INSTALL} />Cài đặt ứng dụng
            </button>
          )}
        </nav>

        <div className="p-3 border-t border-stone-200 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3 px-1">
            <Avatar name={currentUser.fullName} size={34} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-semibold text-stone-900 truncate">{currentUser.fullName}</p>
              <p className="text-xs text-stone-500 truncate">{currentUser.position || roleLabel(currentUser.role)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            <button onClick={() => { setShowChangePassModal(true); setIsMobileMenuOpen(false); }} className="h-8 rounded-md text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 inline-flex items-center justify-center gap-1.5"><KeyRound className="w-3.5 h-3.5" />Đổi mật khẩu</button>
            <button onClick={handleLogout} className="h-8 rounded-md text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-brand-700 inline-flex items-center justify-center gap-1.5"><LogOut className="w-3.5 h-3.5" />Đăng xuất</button>
          </div>
        </div>
      </aside>

      {/* ============ NỘI DUNG ============ */}
      <main className="flex-1 min-w-0 h-screen overflow-y-auto relative">
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 backdrop-blur border-b border-stone-200 flex items-center gap-2 md:gap-3 px-3 md:px-8">
          <img src={LOGO_URL} alt="" className="md:hidden w-7 h-7 object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] md:text-lg font-semibold text-stone-900 truncate leading-tight">{meta.title}</h1>
            {meta.subtitle && <p className="hidden md:block text-xs text-stone-500 truncate">{meta.subtitle}</p>}
          </div>
          <button onClick={handleRefreshData} title="Làm mới" aria-label="Làm mới dữ liệu" className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900">
            <RefreshCw className={`w-[18px] h-[18px] ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative" ref={notifRef}>
            <button onClick={() => setShowNotifPanel(!showNotifPanel)} aria-label="Thông báo" className="relative p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900">
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-brand-700 text-white text-[10px] font-semibold flex items-center justify-center tabular">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {showNotifPanel && (
              <div className="fixed md:absolute left-3 right-3 md:left-auto md:right-0 top-14 md:top-12 md:w-[380px] bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden z-50 animate-fade-in-up">
                <div className="px-4 h-12 border-b border-stone-200 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-stone-900">Thông báo</h3>
                  <button onClick={handleMarkAllRead} className="text-xs font-medium text-stone-500 hover:text-stone-900">Đánh dấu đã đọc</button>
                </div>
                <div className="max-h-[60vh] md:max-h-[420px] overflow-y-auto">
                  {permissionStatus === 'default' && (
                    <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-3">
                      <p className="text-xs text-stone-600">Nhận thông báo ngay trên thiết bị?</p>
                      <button onClick={requestNotificationPermission} className="h-7 px-2.5 bg-brand-700 text-white text-xs font-semibold rounded-md shrink-0">Bật</button>
                    </div>
                  )}
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center text-stone-400">
                      <BellOff className="w-6 h-6 mb-2" /><p className="text-sm">Không có thông báo mới</p>
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} onClick={() => handleNotificationClick(n)} className={`px-4 py-3 border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${!n.isRead ? 'bg-brand-50/40' : ''}`}>
                      <div className="flex gap-3">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!n.isRead ? 'bg-brand-700' : 'bg-transparent'}`}></span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-stone-900">{renderSafeString(n.title)}</p>
                          <p className="text-[13px] text-stone-600 leading-snug mt-0.5">{renderSafeString(n.message)}</p>
                          <span className="text-[11px] text-stone-400 mt-1 block tabular">{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2 flex justify-end">
                    <button onClick={handleTestNotification} className="text-[11px] text-stone-400 hover:text-stone-700">Thử chuông thông báo</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <div key={currentView} className={`view-enter mx-auto max-w-[1400px] px-3 md:px-8 pt-4 md:pt-6 ${currentView === 'MAP_DUTY' ? 'pb-24 md:pb-6' : 'pb-28 md:pb-12'}`}>

        {currentView === 'DASHBOARD' && (
          <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
            {isLeader(currentUser.role) && (
              <>
                <Button variant="secondary" onClick={() => setShowRemindModal(true)} icon={<ImageDown className="w-4 h-4" />} title="Xuất ảnh nhắc việc">Xuất nhắc việc</Button>
                <Button variant="secondary" onClick={async () => { const { ExcelService } = await import('./services/excelService'); ExcelService.exportTasks(tasks, users); }} icon={<FileSpreadsheet className="w-4 h-4" />} title="Xuất tất cả công việc ra Excel">Xuất Excel</Button>
              </>
            )}
            <Button onClick={openNewTaskModal} icon={<Plus className="w-4 h-4" />}>{isLeader(currentUser.role) ? 'Giao việc mới' : 'Thêm việc cá nhân'}</Button>
          </div>
        )}

        {currentView === 'HOME' ? (
           renderHome()
        ) : currentView === 'CALENDAR' ? (
           <Suspense fallback={<LoadingBox />}><CalendarView 
              tasks={calendarTasks} 
              onEditTask={openEditTaskModal} 
              onBack={() => setCurrentView('HOME')} 
              onDateSelect={setCalendarSelectedDate} 
           /></Suspense>
        ) : currentView === 'UTILITIES' ? (
           renderUtilities()
        ) : currentView === 'PROPOSALS' ? (
           <div className="pb-20">
              {allProposalsHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-stone-300">
                  <Inbox className="w-8 h-8 text-stone-300 mb-3" />
                  <p className="text-stone-500 font-medium">Chưa có đề xuất nào từ cán bộ.</p>
                </div>
              ) : (
                <div className="stagger grid grid-cols-1 gap-4">
                   {allProposalsHistory.map(task => {
                     // For proposals, we just show one assignee (creator usually) or first one
                     const assignee = users.find(u => u.id === task.assigneeIds[0]);
                     const isRead = task.isProposalRead;
                     return (
                       <div key={task.id} onClick={() => openEditTaskModal(task)} className={`p-4 md:p-5 rounded-xl border cursor-pointer card-3d group relative overflow-hidden bg-white ${isRead ? 'border-stone-200' : 'border-stone-300'}`}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${isRead ? 'bg-transparent' : 'bg-brand-700'}`}></div>
                          <div className="flex flex-col md:flex-row gap-6">
                             <div className="flex items-start gap-4 md:w-1/4 min-w-[200px] border-b md:border-b-0 md:border-r border-stone-100 pb-4 md:pb-0">
                                <Avatar name={assignee?.fullName} size={40} />
                                <div><p className="text-sm font-bold text-stone-800">{assignee?.fullName}</p><span className={`text-[11px] font-medium px-2 py-0.5 rounded-md mt-1 inline-block ${isRead ? 'text-stone-500 bg-stone-100' : 'text-brand-700 bg-brand-50'}`}>{isRead ? 'Đã xem' : 'Đề xuất mới'}</span></div>
                             </div>
                             <div className="flex-1">
                                <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50 mb-3 relative"><MessageSquareQuote className="absolute top-3.5 left-3.5 w-4 h-4 text-stone-400" /><p className="text-stone-800 text-sm pl-6">"{renderSafeString(task.proposal)}"</p></div>
                                <div className="flex items-center gap-2 text-xs text-stone-400"><span>Thuộc nhiệm vụ:</span><span className="font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded max-w-[300px] truncate">{renderSafeString(task.title)}</span></div>
                                {task.managerResponse && (<div className="mt-2 text-xs flex items-center gap-2"><span>Phản hồi:</span><span className={`font-bold ${task.managerResponse.type === 'AGREE' ? 'text-green-600' : (task.managerResponse.type === 'REJECT' ? 'text-red-600' : 'text-stone-600')}`}>{task.managerResponse.type === 'AGREE' ? 'Đồng ý' : (task.managerResponse.type === 'REJECT' ? 'Từ chối' : 'Chỉ đạo khác')}</span></div>)}
                             </div>
                             <div className="hidden md:flex items-center justify-end"><ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-stone-600" /></div>
                          </div>
                       </div>
                     );
                   })}
                </div>
              )}
           </div>
        ) : currentView === 'ATTENDANCE' ? (
           <div>
              {hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && (
                <div className="mb-4 md:mb-6 grid grid-cols-3 md:inline-grid bg-stone-200/60 p-1 rounded-lg w-full md:w-auto" role="tablist">
                  {([['MANAGE', 'Hội nghị'], ['SCAN', 'Quét mã'], ['REPORT', 'Báo cáo vắng']] as const).map(([m, label]) => (
                    <button key={m} role="tab" aria-selected={attendanceMode === m} onClick={() => setAttendanceMode(m)}
                      className={`h-9 md:px-5 text-sm rounded-md transition-colors whitespace-nowrap ${attendanceMode === m ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div key={attendanceMode} className="view-enter">
              {hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && attendanceMode === 'REPORT' ? (
                  <Suspense fallback={<LoadingBox />}><AbsenceReport currentUser={currentUser} canEdit={hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE)} /></Suspense>
              ) : hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && attendanceMode === 'MANAGE' ? (
                  <Suspense fallback={<LoadingBox />}><MeetingManager currentUser={currentUser} /></Suspense>
              ) : (
                  <Suspense fallback={<LoadingBox />}><AttendanceScanner currentUser={currentUser} onSuccess={() => setCurrentView('HOME')} /></Suspense>
              )}
              </div>
           </div>
        ) : currentView === 'MAP_DUTY' ? (
            <Suspense fallback={<LoadingBox />}><MapDuty currentUser={currentUser!} users={users} isLeader={hasPermission(currentUser, UserPermission.MANAGE_MAP_DUTY)} /></Suspense>
        ) : (
           <>
              {recurringAlerts.length > 0 && (
                <div onClick={() => setFilterStatus('RECURRING_ATTENTION')} className={`mb-4 bg-white border px-4 py-3 rounded-xl flex items-center gap-3 card-3d cursor-pointer ${filterStatus === 'RECURRING_ATTENTION' ? 'border-amber-400' : 'border-stone-200'}`}>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Repeat className="w-4 h-4" /></div>
                  <div><h4 className="font-semibold text-stone-900 text-sm">Nhiệm vụ định kỳ</h4><p className="text-stone-500 text-xs mt-0.5">Có <strong>{recurringAlerts.length}</strong> công việc lặp lại cần chú ý.</p></div>
                </div>
              )}

              <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3 mb-6">
                <div onClick={() => setFilterStatus('ALL')} className={`col-span-4 lg:col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer ${filterStatus === 'ALL' ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1">Tổng việc</p><p className="text-xl md:text-2xl font-semibold tabular text-stone-900">{stats.total}</p></div>
                 <div onClick={() => setFilterStatus('ACCEPTED')} className={`col-span-2 lg:col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer ${filterStatus === 'ACCEPTED' ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1">Đã nhận</p><p className="text-xl md:text-2xl font-semibold tabular text-stone-900">{stats.accepted}</p></div>
                <div onClick={() => setFilterStatus('NOT_ACCEPTED')} className={`col-span-2 lg:col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer ${filterStatus === 'NOT_ACCEPTED' ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1">Chưa nhận</p><p className="text-xl md:text-2xl font-semibold tabular text-stone-900">{stats.notAccepted}</p></div>
                <div onClick={() => setFilterStatus(TaskStatus.IN_PROGRESS)} className={`col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer text-center lg:text-left ${filterStatus === TaskStatus.IN_PROGRESS ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1 truncate">Đang làm</p><p className="text-xl md:text-2xl font-semibold tabular text-stone-900">{stats.inProgress}</p></div>
                <div onClick={() => setFilterStatus(TaskStatus.COMPLETED)} className={`col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer text-center lg:text-left ${filterStatus === TaskStatus.COMPLETED ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1 truncate">Xong</p><p className="text-xl md:text-2xl font-semibold tabular text-stone-900">{stats.completed}</p></div>
                <div onClick={() => setFilterStatus('DUE_SOON')} className={`col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer text-center lg:text-left ${filterStatus === 'DUE_SOON' ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1 truncate">Sắp hạn</p><p className="text-xl md:text-2xl font-semibold tabular text-amber-700">{stats.dueSoon}</p></div>
                <div onClick={() => setFilterStatus('OVERDUE_FILTER')} className={`col-span-1 bg-white px-3 py-2.5 md:px-4 md:py-3 rounded-xl border card-3d cursor-pointer text-center lg:text-left ${filterStatus === 'OVERDUE_FILTER' ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}><p className="text-stone-500 text-xs font-medium mb-1 truncate">Quá hạn</p><p className="text-xl md:text-2xl font-semibold tabular text-red-700">{stats.overdue}</p></div>
              </div>

              <div className="flex flex-col xl:flex-row justify-between items-end xl:items-center mb-5 gap-3">
                  <div className="flex items-center gap-2 flex-1 w-full xl:w-auto">
                     <h3 className="text-base md:text-lg font-semibold text-stone-900 whitespace-nowrap">
                        {filterAssignee !== 'ALL' ? 'Công việc của:' : (
                          filterStatus === 'DUE_SOON' ? 'Danh sách sắp đến hạn' :
                          filterStatus === 'OVERDUE_FILTER' ? 'Danh sách quá hạn' :
                          filterStatus === 'ACCEPTED' ? 'Nhiệm vụ đã tiếp nhận' :
                          filterStatus === 'NOT_ACCEPTED' ? 'Nhiệm vụ chưa tiếp nhận' :
                          filterStatus === 'RECURRING_ATTENTION' ? 'Nhiệm vụ định kỳ cần chú ý' :
                          filterStatus !== 'ALL' ? `Danh sách ${filterStatus === TaskStatus.PENDING ? 'chờ xử lý' : filterStatus === TaskStatus.IN_PROGRESS ? 'đang thực hiện' : 'hoàn thành'}` : 
                          'Toàn bộ nhiệm vụ'
                        )}
                     </h3>
                     {filterAssignee !== 'ALL' && (<span className="bg-stone-100 text-stone-800 px-2.5 py-1 rounded-md text-xs truncate max-w-[160px]">{users.find(u => u.id === filterAssignee)?.fullName}</span>)}
                     {filterCreator !== 'ALL' && (<span className="bg-stone-100 text-stone-800 px-2.5 py-1 rounded-md text-xs truncate max-w-[160px]">Giao bởi: {users.find(u => u.id === filterCreator)?.fullName}</span>)}
                     {(filterAssignee !== 'ALL' || filterStatus !== 'ALL' || filterCreator !== 'ALL') && (<button onClick={() => { setFilterAssignee('ALL'); setFilterStatus('ALL'); setFilterCreator('ALL'); }} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 ml-2 font-medium"><X className="w-3.5 h-3.5" />Xóa bộ lọc</button>)}
                  </div>
                  
                  <div className="w-full xl:w-auto flex flex-col sm:flex-row gap-3">
                    {isLeader(currentUser.role) && (
                        <div className="w-full sm:w-48"><Select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} options={officerOptions}  /></div>
                    )}
                    <div className="w-full sm:w-48"><Select value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)} options={leaderOptions}  /></div>
                    <div className="w-full sm:w-44"><Select value={sortOption} onChange={(e) => setSortOption(e.target.value)} options={sortOptions}  /></div>
                    <div className="w-full sm:w-60"><Input type="search" placeholder="Tìm kiếm công việc..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}  /></div>
                  </div>
              </div>

              <div className="space-y-4 pb-20">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed border-stone-300">
                    <FolderOpen className="w-8 h-8 text-stone-300 mb-3" />
                    <p className="text-stone-500 font-medium">{searchQuery ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có nhiệm vụ nào.'}</p>
                  </div>
                ) : (
                  <div className="stagger grid gap-2.5 md:gap-3">
                    {filteredTasks.map(task => {
                      const assigneeIds = task.assigneeIds || [];
                      const assignees = users.filter(u => assigneeIds.includes(u.id));
                      
                      const dueDate = new Date(task.dueDate);
                      dueDate.setHours(0, 0, 0, 0);
                      const startOfToday = new Date();
                      startOfToday.setHours(0, 0, 0, 0);
                      const threeDaysFromNow = new Date(startOfToday);
                      threeDaysFromNow.setDate(startOfToday.getDate() + 3);

                      const isOverdue = !task.isRegularDuty && (task.status === TaskStatus.OVERDUE || (dueDate < startOfToday && task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED));
                      const isDueSoon = !task.isRegularDuty && dueDate >= startOfToday && dueDate <= threeDaysFromNow && task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED && task.status !== TaskStatus.OVERDUE;

                      return (
                        <div key={task.id} onClick={() => openEditTaskModal(task)} className={`group relative bg-white rounded-xl p-4 md:p-5 border cursor-pointer card-3d overflow-hidden ${isOverdue ? 'border-red-200' : 'border-stone-200'}`}>
                           {/* Highlight Bar */}
                           <div className={`absolute left-0 top-0 bottom-0 w-1 ${task.status === TaskStatus.COMPLETED ? 'bg-green-500' : task.status === TaskStatus.IN_PROGRESS ? 'bg-amber-500' : task.status === TaskStatus.OVERDUE ? 'bg-red-600' : 'bg-stone-300'}`}></div>
                           
                           <div className="pl-2">
                              <div className="flex justify-between items-start mb-2">
                                 <div className="flex gap-2 items-center flex-wrap">
                                    <PriorityBadge priority={task.priority} />
                                    {task.isRegularDuty && <span className="text-[11px] font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded-md">Thường xuyên</span>}
                                    {isDueSoon && <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md ring-1 ring-inset ring-amber-200">Sắp hạn</span>}
                                    {!!task.acceptedAt && <span className="text-[11px] font-medium text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded-md ring-1 ring-inset ring-sky-200">Đã nhận</span>}
                                    <RecurringBadge type={task.recurring} />
                                 </div>
                                 <StatusBadge status={task.status} />
                              </div>

                              <h3 className={`text-[15px] md:text-base font-semibold text-stone-900 mb-1 leading-snug ${task.status === TaskStatus.COMPLETED ? 'line-through text-stone-500' : ''}`}>
                                 {renderSafeString(task.title)}
                              </h3>
                              
                              <p className="text-xs md:text-sm text-stone-500 line-clamp-2 mb-3 leading-relaxed">
                                 {renderSafeString(task.description)}
                              </p>

                              {/* Show Creator Name */}
                              <div className="mb-3 flex items-center gap-1">
                                <span className="text-xs text-stone-400">Người giao:</span>
                                <span className="text-xs font-medium text-stone-700">{users.find(u => u.id === task.creatorId)?.fullName || 'N/A'}</span>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                                 <div className="flex -space-x-2">
                                    {assignees.map((u, i) => (
                                       <span key={u.id} style={{ zIndex: 10 - i }} className="inline-flex rounded-full ring-2 ring-white"><Avatar name={u.fullName} size={24} /></span>
                                    ))}
                                    {assignees.length === 0 && <span className="text-xs text-stone-400 italic">Chưa giao</span>}
                                 </div>
                                 <div className="text-right">
                                    <p className={`text-xs font-medium tabular ${isOverdue ? 'text-red-700' : 'text-stone-700'}`}>
                                       {task.isRegularDuty ? 'Thường xuyên' : new Date(task.dueDate).toLocaleDateString('vi-VN')}
                                    </p>
                                    <p className="text-[11px] text-stone-400">Hạn xử lý</p>
                                 </div>
                              </div>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
           </>
        )}
        </div>
      </main>

      {/* ============ THANH TAB DƯỚI (điện thoại) ============ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 grid grid-cols-5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Điều hướng chính">
        {([
          { v: 'HOME', label: 'Trang chủ', icon: Home },
          { v: 'DASHBOARD', label: 'Công việc', icon: ClipboardList },
          { v: 'ATTENDANCE', label: 'Điểm danh', icon: QrCode },
          { v: 'CALENDAR', label: 'Lịch', icon: CalendarDays }
        ] as { v: ViewState; label: string; icon: React.ElementType }[]).map(({ v, label, icon: Icon }) => {
          const active = currentView === v;
          return (
            <button key={v} onClick={() => goTo(v)} aria-current={active ? 'page' : undefined}
              className={`h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-brand-700 font-semibold' : 'text-stone-500'}`}>
              <span className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? 'nav-on bg-white' : ''}`}>
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {v === 'DASHBOARD' && stats.overdue > 0 && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white"></span>}
              </span>
              {label}
            </button>
          );
        })}
        <button onClick={() => setIsMobileMenuOpen(true)} className={`h-16 flex flex-col items-center justify-center gap-1 text-[11px] ${['MAP_DUTY', 'UTILITIES', 'PROPOSALS'].includes(currentView) ? 'text-brand-700 font-semibold' : 'text-stone-500'}`}>
          <Menu className="w-[22px] h-[22px]" strokeWidth={1.8} />Thêm
        </button>
      </nav>

      {/* Modals */}
      <TaskModal 
        isOpen={showTaskModal} 
        onClose={() => setShowTaskModal(false)} 
        onSave={handleSaveTask} 
        onDelete={handleDeleteTask}
        initialTask={editingTask} 
        users={users} 
        currentUser={currentUser} 
      />

      {showUserModal && <Suspense fallback={null}><UserManagementModal 
        isOpen={showUserModal} 
        onClose={() => setShowUserModal(false)} 
        users={users} 
        onUsersUpdated={handleRefreshData}
        officerStats={officerStats}
        absentOfficers={absentOfficers}
        currentUser={currentUser}
      /></Suspense>}

      <CloudSyncModal 
         isOpen={showSyncModal}
         onClose={() => setShowSyncModal(false)}
         onConfigSaved={handleRefreshData}
      />

      {showRemindModal && <Suspense fallback={null}><RemindModal 
         isOpen={showRemindModal}
         onClose={() => setShowRemindModal(false)}
         tasks={tasks}
         users={users}
         targetUser={currentUser.role === UserRole.OFFICER ? currentUser : undefined}
      /></Suspense>}
      
      {/* Utility Modal (Inline) */}
      {showUtilityModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/50 p-4">
           <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-stone-200 overflow-hidden">
              <div className="px-5 h-14 border-b border-stone-200 flex justify-between items-center">
                 <h3 className="font-semibold text-stone-900">{editingUtility ? 'Cập nhật tiện ích' : 'Thêm tiện ích mới'}</h3>
                 <button onClick={() => setShowUtilityModal(false)} aria-label="Đóng" className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSaveUtility} className="p-5 space-y-4">
                 <Input label="Tên tiện ích" value={utilName} onChange={e => setUtilName(e.target.value)} placeholder="VD: Cổng Dịch vụ công" required />
                 <Input label="Đường dẫn (URL)" value={utilUrl} onChange={e => setUtilUrl(e.target.value)} placeholder="https://..." required />
                 <Input label="Icon URL (Tùy chọn)" value={utilIconUrl} onChange={e => setUtilIconUrl(e.target.value)} placeholder="Link ảnh icon..." />
                 <div className="flex justify-end gap-2 mt-4">
                    <Button type="button" variant="secondary" onClick={() => setShowUtilityModal(false)}>Hủy</Button>
                    <Button type="submit">Lưu</Button>
                 </div>
              </form>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;