import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { User, Task, UserRole, UserDepartment, TaskStatus, RecurringType, AppNotification, TaskPriority, Utility, UserPermission } from './types';
import { MockDB } from './services/mockDatabase';
import { CLOUD_CONFIG_KEY, SESSION_EXPIRED_EVENT } from './lib/supabase';
import { Button, Input, StatusBadge, PriorityBadge, RecurringBadge, Select } from './components/UI';
import { TaskModal } from './components/TaskModal';
const UserManagementModal = lazy(() => import('./components/UserManagementModal').then(m => ({ default: m.UserManagementModal })));
import { CloudSyncModal } from './components/CloudSyncModal';
const RemindModal = lazy(() => import('./components/RemindModal').then(m => ({ default: m.RemindModal })));
const CalendarView = lazy(() => import('./components/CalendarView').then(m => ({ default: m.CalendarView })));
const WeeklyCalendar = lazy(() => import('./components/WeeklyCalendar').then(m => ({ default: m.WeeklyCalendar })));
const AttendanceManager = lazy(() => import('./components/AttendanceManager').then(m => ({ default: m.AttendanceManager })));
const AttendanceScanner = lazy(() => import('./components/AttendanceScanner').then(m => ({ default: m.AttendanceScanner })));
const AbsenceReport = lazy(() => import('./components/AbsenceReport').then(m => ({ default: m.AbsenceReport })));
import { GuestCheckIn } from './components/GuestCheckIn';
import { RegisterModal, ForgotPasswordModal } from './components/AuthModals';
const GamesHub = lazy(() => import('./components/Games/GamesHub').then(m => ({ default: m.GamesHub })));

const MapDuty = lazy(() => import('./components/MapDuty/MapDuty').then(module => ({ default: module.MapDuty })));

// Logo Công An (Standard Police Badge URL)
const LoadingBox: React.FC = () => (
  <div className="flex items-center justify-center py-16 text-stone-400 text-sm font-medium">
    <span className="w-5 h-5 border-2 border-stone-300 border-t-red-700 rounded-full animate-spin mr-3"></span>
    Đang tải...
  </div>
);

const LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMAT1EEiTjShLjCbC_DbVGPRAXHcbA_IZNww&s";

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

type ViewState = 'HOME' | 'DASHBOARD' | 'PROPOSALS' | 'CALENDAR' | 'UTILITIES' | 'WEEKLY_SCHEDULE' | 'ATTENDANCE' | 'GAMES' | 'MAP_DUTY';

// Updated Default Utilities - Empty as requested
const DEFAULT_UTILITIES: Utility[] = [];

// Toast Notification Component
const ToastNotification: React.FC<{ title: string; message: string; type?: string; visible: boolean; onClose: () => void }> = ({ title, message, type, visible, onClose }) => {
  if (!visible) return null;
  
  const isTaskAlert = type === 'TASK_ASSIGNED';
  const bgColor = isTaskAlert ? 'bg-red-900 border-l-4 border-yellow-400' : 'bg-white border-l-4 border-red-600';
  const textColor = isTaskAlert ? 'text-white' : 'text-gray-900';
  const subTextColor = isTaskAlert ? 'text-red-100' : 'text-gray-600';

  return (
    <div className={`fixed top-4 right-4 z-[110] rounded-xl shadow-2xl p-4 max-w-sm animate-slide-in-left cursor-pointer transition-all duration-300 transform hover:scale-105 ${bgColor}`} onClick={onClose}>
       <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full animate-bounce ${isTaskAlert ? 'bg-yellow-400 text-red-900' : 'bg-red-100 text-red-600'}`}>
             {isTaskAlert ? (
                <span className="text-xl">⚡</span>
             ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
             )}
          </div>
          <div className="flex-1">
             <h4 className={`font-bold text-sm uppercase ${textColor}`}>{title}</h4>
             <p className={`text-xs mt-1 leading-snug ${subTextColor}`}>{message}</p>
          </div>
          <button onClick={onClose} className={`${isTaskAlert ? 'text-red-200 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>✕</button>
       </div>
    </div>
  );
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
  const [guestSession, setGuestSession] = useState<{ id: string, timestamp: number } | null>(null);

  // Calendar State
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date>(new Date());
  
  // Login State
  const [usernameInput, setUsernameInput] = useState('ldthang');
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
  
  // iOS & Android Detection State
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstallPrompt(false);
      }
    } else if (isIOS) {
      setShowInstallPrompt(true);
    }
  };

  // LOGIC: Sidebar only visible in Task Book Module AND Calendar Module AND Utilities
  // Include UTILITIES here so it gets the standard header with Refresh button
  const isTaskView = ['DASHBOARD', 'PROPOSALS', 'CALENDAR', 'UTILITIES', 'WEEKLY_SCHEDULE', 'GAMES', 'MAP_DUTY'].includes(currentView);

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
      const timestamp = urlParams.get('t');
      
      if (guestSessionId && timestamp) {
        // Mã QR khách mời có thể mang theo cấu hình máy chủ (khi chưa đặt cấu hình mặc định)
        const cfgParam = urlParams.get('c');
        if (cfgParam && !MockDB.isCloudEnabled()) {
          try {
            const cfg = JSON.parse(decodeURIComponent(escape(atob(cfgParam))));
            if (cfg.u && cfg.k) MockDB.initializeCloud({ supabaseUrl: cfg.u, supabaseKey: cfg.k });
          } catch { /* bỏ qua cấu hình hỏng */ }
        }
        ensureCloudConnected();
        setGuestSession({ id: guestSessionId, timestamp: parseInt(timestamp, 10) });
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

      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
      // @ts-ignore
      const isInStandaloneMode = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      setIsIOS(isIosDevice);
      setIsStandalone(isInStandaloneMode);
      
      // Handle Android/Chrome install prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        if (!isInStandaloneMode) {
          setShowInstallPrompt(true);
        }
      });

      if (!isInStandaloneMode) {
        // Show prompt for iOS or if we already have a deferred prompt
        if (isIosDevice) {
          setShowInstallPrompt(true);
        }
      }
      
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
      <h2 className="text-2xl md:text-3xl font-bold text-stone-400 uppercase tracking-widest">{title}</h2>
      <p className="text-stone-400 mt-3 font-medium text-lg">Chức năng đang được phát triển.</p>
      <Button variant="secondary" className="mt-8 px-8" onClick={() => setCurrentView('HOME')}>Quay lại Trang chủ</Button>
    </div>
  );

  const renderUtilities = () => (
    <div className="pb-20 animate-fade-in-up">
       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
               className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer hover:shadow-md hover:border-purple-200 transition-all card-3d group relative ${util.scope === 'SHARED' ? 'border-purple-200 ring-1 ring-purple-50' : 'border-stone-100'}`}
             >
                {util.scope === 'SHARED' && <span className="absolute top-2 left-2 text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">CHUNG</span>}
                {util.scope === 'PERSONAL' && <span className="absolute top-2 left-2 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">CÁ NHÂN</span>}
                {util.scope === 'SYSTEM' && <span className="absolute top-2 left-2 text-[9px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded border border-stone-200">HỆ THỐNG</span>}

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
                   <div className="w-14 h-14 mb-3 rounded-full bg-white flex items-center justify-center overflow-hidden border border-stone-100 shadow-sm p-1.5 hover:scale-110 transition-transform duration-300">
                      {util.icon ? (
                         <img src={util.icon} alt="" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/1006/1006771.png"; }} />
                      ) : (
                         <span className="text-2xl">🔗</span>
                      )}
                   </div>
                   <h3 className="text-sm font-bold text-stone-800 line-clamp-2 group-hover:text-purple-700 transition-colors px-1">{util.name}</h3>
                   <p className="text-[10px] text-stone-400 mt-1 truncate w-full px-2 opacity-60 group-hover:opacity-100 transition-opacity">{new URL(util.url).hostname}</p>
                </div>
             </div>
             );
          })}

          <div onClick={() => openUtilityModal()} className="bg-purple-50/50 rounded-2xl p-4 border border-dashed border-purple-300 cursor-pointer hover:bg-purple-100 transition-all flex flex-col items-center justify-center text-purple-600 min-h-[140px] group">
             <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-2 group-hover:bg-purple-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
             </div>
             <span className="text-xs font-bold uppercase tracking-wide">Thêm tiện ích</span>
          </div>
       </div>
    </div>
  );

  const renderHome = () => (
    <div className="max-w-7xl mx-auto pt-2 md:pt-8 animate-fade-in-up pb-20">
      <div className="mb-6 md:mb-12">
        <h1 className="text-xl md:text-4xl font-extrabold text-red-900 uppercase tracking-tight mb-1 md:mb-2">
          Xin chào, {currentUser?.fullName}
        </h1>
        <p className="text-stone-500 font-bold text-xs md:text-lg">
          Hôm nay là {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Chúc đồng chí một ngày làm việc hiệu quả!
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6">
        <div onClick={() => setCurrentView('WEEKLY_SCHEDULE')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-yellow-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-yellow-100 text-yellow-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            📆
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Lịch Công Tác Tuần</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Xem và quản lý lịch công tác, hội họp trong tuần của đơn vị.
          </p>
        </div>

        <div onClick={() => setCurrentView('CALENDAR')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            📅
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Lịch Cá Nhân</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Theo dõi lịch trực ban, lịch họp và các sự kiện quan trọng.
          </p>
        </div>

        <div onClick={() => setCurrentView('DASHBOARD')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden ring-2 ring-red-50 h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-red-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            📋
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">SỐ NHIỆM VỤ</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Quản lý, phân công và báo cáo tiến độ công việc hàng ngày.
          </p>
          {(stats.pending + stats.inProgress) > 0 && (
             <div className="mt-3 md:mt-6 inline-flex items-center px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-red-100 text-red-700 text-[9px] md:text-xs font-bold relative z-10 shadow-sm border border-red-200">
               {stats.pending + stats.inProgress} việc đang xử lý
             </div>
          )}
        </div>

        <div onClick={() => setCurrentView('MAP_DUTY')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            🗺️
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Sơ đồ bảo vệ</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Phân công và theo dõi vị trí các chốt bảo vệ trên bản đồ số.
          </p>
        </div>

        <div onClick={() => setCurrentView('UTILITIES')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-purple-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            🗃️
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Tiện Ích Khác</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Tra cứu văn bản, danh bạ điện thoại và công cụ hỗ trợ.
          </p>
        </div>

        <div onClick={() => setCurrentView('ATTENDANCE')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-pink-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            🛑
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Điểm danh hội nghị</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Quét mã QR để điểm danh hội nghị.
          </p>
        </div>

        <div onClick={() => isLeader(currentUser?.role || UserRole.OFFICER) ? setShowUserModal(true) : alert('Chức năng dành cho lãnh đạo')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-green-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-green-100 text-green-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            👥
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Quản lý Cán bộ</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Quản lý danh sách, chức vụ và tài khoản.
          </p>
        </div>

        <div onClick={() => setCurrentView('GAMES')} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm border border-stone-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden h-full card-3d">
          <div className="absolute top-0 right-0 w-20 h-20 md:w-32 md:h-32 bg-orange-50 rounded-bl-full -mr-10 -mt-10 md:-mr-16 md:-mt-16 transition-transform group-hover:scale-150"></div>
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mb-3 md:mb-6 relative z-10 text-xl md:text-3xl">
            🎮
          </div>
          <h3 className="text-sm md:text-xl font-bold text-stone-800 mb-1 md:mb-3 relative z-10 uppercase">Góc Giải Trí</h3>
          <p className="text-[10px] md:text-sm text-stone-500 font-medium leading-relaxed relative z-10 line-clamp-3 md:line-clamp-none">
            Thư giãn với các trò chơi trí tuệ sau giờ làm việc.
          </p>
        </div>
      </div>
    </div>
  );

  const renderTopHeader = () => (
    <div className="hidden md:flex items-center justify-between px-6 py-4 mb-6 bg-white/50 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm animate-fade-in-up">
       <div className="flex items-center gap-3">
          {currentView !== 'HOME' && (
            <button 
              onClick={() => setCurrentView('HOME')}
              className="mr-1 p-2 text-stone-500 hover:text-red-800 hover:bg-stone-100 rounded-full transition-colors"
              title="Quay lại trang chủ"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
          )}
          <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain p-0.5 bg-red-900 rounded-full" />
          <div>
             <h2 className="text-sm font-extrabold text-red-900 uppercase">CA TỈNH QUẢNG TRỊ</h2>
             <p className="text-xs font-bold text-stone-500 uppercase">CAP Nam Đông Hà</p>
          </div>
       </div>
       <div className="flex items-center gap-4">
          <button onClick={handleRefreshData} className={`p-2 text-stone-400 hover:text-red-700 transition-colors rounded-lg hover:bg-red-50 ${isLoading ? 'animate-spin' : ''}`} title="Làm mới">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
          <div className="text-right hidden md:block">
             <p className="text-sm font-bold text-red-900">{currentUser?.fullName}</p>
             <p className="text-xs text-stone-500 uppercase font-bold">{roleLabel(currentUser?.role)}</p>
          </div>
          <img src={currentUser?.avatarUrl} alt="" className="w-10 h-10 rounded-full border-2 border-stone-100" />
          <div className="flex gap-1">
             <button onClick={() => setShowChangePassModal(true)} className="p-2 text-stone-400 hover:text-red-700 transition-colors rounded-lg hover:bg-red-50" title="Đổi mật khẩu">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
             </button>
             <button onClick={handleLogout} className="p-2 text-red-600 hover:text-red-800 transition-colors rounded-lg hover:bg-red-50" title="Đăng xuất">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
             </button>
          </div>
       </div>
    </div>
  );

  if (guestSession) {
    return (
      <GuestCheckIn 
        sessionId={guestSession.id} 
        timestamp={guestSession.timestamp} 
        onSuccess={() => {
          // You could show a success message or redirect
          alert("Điểm danh thành công! Bạn có thể đóng trang này.");
          window.location.href = window.location.origin + window.location.pathname;
        }} 
      />
    );
  }

  if (showChangePassModal) {
    return (
      <div className="fixed inset-0 z-[100] bg-stone-900/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border-t-4 border-red-700 relative">
           {!currentUser?.isFirstLogin && (
              <button onClick={() => setShowChangePassModal(false)} className="absolute top-4 right-4 text-stone-400 hover:text-red-600">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
           )}
           <div className="text-center mb-6">
             <div className="w-16 h-16 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
             </div>
             <h2 className="text-xl font-bold text-red-900">Cập nhật mật khẩu</h2>
             <p className="text-stone-500 text-sm mt-2">{currentUser?.isFirstLogin ? 'Vui lòng đổi mật khẩu cho lần đăng nhập đầu tiên.' : 'Nhập mật khẩu mới để bảo vệ tài khoản.'}</p>
           </div>
           <form onSubmit={handleChangePassword} className="space-y-4">
             <Input type="password" label="Mật khẩu hiện tại" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required placeholder="Nhập mật khẩu đang dùng" />
             <Input type="password" label="Mật khẩu mới" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Ít nhất 6 ký tự" />
             <Input type="password" label="Xác nhận mật khẩu" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Nhập lại mật khẩu" />
             <Button type="submit" className="w-full mt-2">Xác nhận đổi</Button>
           </form>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50 relative overflow-hidden">
        <div className="absolute top-4 right-4 z-50">
           <button 
             onClick={() => setShowSyncModal(true)} 
             className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${isCloudActive ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200' : 'bg-white/80 text-stone-600 hover:bg-white border border-stone-200 backdrop-blur'}`}
           >
             {isCloudActive ? (<><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Đã kết nối</>) : (<><span>⚙️</span> Cấu hình dữ liệu</>)}
           </button>
        </div>
        <div className="absolute inset-0 z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-red-200/50 blur-3xl"></div>
          <div className="absolute bottom-[0%] right-[0%] w-[50%] h-[50%] rounded-full bg-yellow-200/50 blur-3xl"></div>
        </div>
        <div className="max-w-md w-full bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-10 border border-white/50 relative z-10 m-4 card-3d border-t-4 border-red-700">
          <div className="text-center mb-8">
            <div className="w-24 h-24 mx-auto mb-6 shadow-md rounded-full p-2 bg-red-900 flex items-center justify-center overflow-hidden ring-4 ring-yellow-400">
              <img src={LOGO_URL} alt="Công An Hiệu" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-extrabold text-red-900 tracking-wider uppercase leading-tight">Công An Tỉnh Quảng Trị</h1>
            <h2 className="text-base font-bold text-red-700 uppercase mt-1">Công An Phường Nam Đông Hà</h2>
            <p className="text-stone-500 font-bold text-xs mt-3 uppercase tracking-widest">Hệ thống quản lý công việc</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <Input label="Tên đăng nhập" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Nhập tên đăng nhập..." className="bg-white" />
            <div>
              <Input type="password" label="Mật khẩu" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Nhập mật khẩu..." className="bg-white" />
              <div className="text-right mt-1">
                <span onClick={() => setShowForgotModal(true)} className="text-xs text-red-600 hover:underline cursor-pointer font-semibold">Quên mật khẩu?</span>
              </div>
            </div>
            <Button type="submit" className="w-full py-3.5 shadow-xl shadow-red-900/20 bg-red-800 hover:bg-red-900 text-white font-bold uppercase tracking-wider" isLoading={isLoading}>Đăng nhập</Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-xs text-stone-500">
              Chưa có tài khoản?{' '}
              <span onClick={() => setShowRegisterModal(true)} className="text-red-700 font-bold hover:underline cursor-pointer">Đăng ký ngay</span>
            </p>
          </div>
          <div className="mt-6 text-center border-t border-stone-200 pt-4"><p className="text-xs text-stone-400 font-semibold">Vì Nhân Dân Phục Vụ</p></div>
        </div>
        <CloudSyncModal isOpen={showSyncModal} onClose={() => setShowSyncModal(false)} onConfigSaved={reloadData} />
        <RegisterModal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)} />
        <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orange-50/50 flex flex-col md:flex-row font-sans text-stone-800 relative">
      
      {/* Realtime Toast Notification */}
      <ToastNotification 
         title={toastContent.title} 
         message={toastContent.message} 
         type={toastContent.type}
         visible={toastVisible} 
         onClose={() => setToastVisible(false)} 
      />

      {/* Notification Permission Banner (Mobile Friendly) */}
      {permissionStatus === 'default' && currentUser && (
        <div className="fixed bottom-20 left-4 right-4 z-[100] bg-indigo-900 text-white p-4 rounded-2xl shadow-2xl border border-indigo-700 animate-bounce-in md:hidden">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-800 rounded-full shrink-0">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm uppercase text-yellow-400">Bật thông báo ngay!</h4>
              <p className="text-xs text-indigo-200 mt-1">Nhận tin tức công việc tức thì ngay cả khi tắt ứng dụng.</p>
              <div className="mt-3 flex gap-2">
                <button 
                  onClick={requestNotificationPermission}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-indigo-900 text-xs font-bold rounded-lg shadow-lg transition-all active:scale-95"
                >
                  Bật ngay
                </button>
                <button 
                  onClick={() => setPermissionStatus('denied')} // Dismiss for session
                  className="px-4 py-2 bg-indigo-800 hover:bg-indigo-700 text-indigo-300 text-xs font-bold rounded-lg transition-all"
                >
                  Để sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installation Prompt */}
      {showInstallPrompt && (
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-lg border-t border-stone-200 p-6 shadow-2xl animate-slide-in-up md:max-w-md md:left-auto md:right-4 md:bottom-4 md:rounded-2xl md:border">
           <div className="flex items-start gap-4">
              <button onClick={() => setShowInstallPrompt(false)} className="text-stone-400 hover:text-stone-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
              <div className="flex-1">
                 <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-xl">📲</div>
                    <h4 className="text-base font-bold text-red-900">Cài đặt Ứng dụng CAP</h4>
                 </div>
                 
                 <p className="text-sm text-stone-600 leading-relaxed mb-4">
                    {isIOS ? (
                      "Để nhận thông báo nhiệm vụ tức thì và trải nghiệm tốt nhất trên iPhone, hãy thêm ứng dụng vào Màn hình chính:"
                    ) : (
                      "Cài đặt ứng dụng để nhận thông báo nhiệm vụ tức thì, hoạt động ổn định và tiết kiệm dữ liệu hơn."
                    )}
                 </p>

                 {isIOS ? (
                   <div className="space-y-2 bg-stone-50 p-3 rounded-xl border border-stone-100">
                      <div className="text-xs font-bold text-stone-800 flex items-center gap-2">
                         <span className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm text-[10px]">1</span>
                         Nhấn nút Chia sẻ <span className="text-blue-600 text-lg">⎋</span> ở thanh dưới cùng.
                      </div>
                      <div className="text-xs font-bold text-stone-800 flex items-center gap-2">
                         <span className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm text-[10px]">2</span>
                         Chọn <span className="text-red-700">"Thêm vào MH chính"</span>.
                      </div>
                   </div>
                 ) : (
                   <button 
                    onClick={handleInstallApp}
                    className="w-full py-3 bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                   >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      CÀI ĐẶT NGAY
                   </button>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-red-900 backdrop-blur-md shadow-md z-30 flex items-center justify-between px-4 text-white">
        <div className="flex items-center gap-3">
           {currentView !== 'HOME' ? (
             <button onClick={() => setCurrentView('HOME')} className="p-1 text-white hover:bg-white/20 rounded-full transition-colors mr-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
           ) : (
             <img src={LOGO_URL} alt="Logo" className="w-9 h-9 p-0.5 bg-white rounded-full" />
           )}
           <div><p className="font-bold text-[10px] uppercase text-yellow-400 leading-none mb-0.5">CA TỈNH QUẢNG TRỊ</p><p className="font-bold text-xs uppercase leading-none">CAP NAM ĐÔNG HÀ</p></div>
        </div>
        <div className="flex items-center gap-4">
           {isTaskView && (
             <>
                <button onClick={handleRefreshData} className={`p-2 text-white/80 active:bg-red-800 rounded-full ${isLoading ? 'animate-spin' : ''}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                <div className="relative" ref={notifRef}>
                  <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="p-2 text-white/80 active:bg-red-800 rounded-full relative">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                      {unreadCount > 0 && <span className="absolute top-1.5 right-2 w-2.5 h-2.5 bg-yellow-400 rounded-full border border-red-900"></span>}
                  </button>
                    {showNotifPanel && (
                      <div className="absolute top-12 right-[-10px] w-[300px] bg-white rounded-xl shadow-2xl border border-red-100 overflow-hidden z-50 animate-fade-in-up text-stone-800">
                        <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex justify-between items-center"><h3 className="text-sm font-bold text-red-900">Thông báo</h3><button onClick={handleMarkAllRead} className="text-xs text-red-600 font-medium">Đã xem tất cả</button></div>
                        <div className="max-h-[60vh] overflow-y-auto">
                          {/* Permission Prompt for non-iOS or iOS PWA */}
                          {permissionStatus === 'default' && !showInstallPrompt && (
                             <div className="p-3 bg-yellow-50 border-b border-yellow-100 text-center">
                                <p className="text-xs text-yellow-800 mb-2 font-medium">Nhận thông báo ngay trên thiết bị?</p>
                                <button onClick={requestNotificationPermission} className="px-3 py-1.5 bg-yellow-400 text-red-900 text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-transform">Bật thông báo ngay</button>
                             </div>
                          )}
                          
                          {/* Test Button for Debugging */}
                          <div className="px-4 py-2 border-b border-stone-100 flex justify-end">
                             <button onClick={handleTestNotification} className="text-[10px] flex items-center gap-1 font-bold text-stone-400 hover:text-red-600 border border-stone-200 px-2 py-1 rounded hover:bg-stone-50 transition-colors">
                                🔔 Test Loa & Rung
                             </button>
                          </div>

                          {notifications.length === 0 ? (<div className="p-8 text-center text-stone-400 text-xs">Không có thông báo mới</div>) : (
                            notifications.map(n => (
                              <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 border-b border-stone-50 hover:bg-stone-50 transition-colors ${!n.isRead ? 'bg-orange-50' : ''}`}>
                                <div className="flex gap-3"><div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.isRead ? 'bg-red-500' : 'bg-transparent'}`}></div><div><p className="text-xs font-bold text-stone-800 mb-0.5">{renderSafeString(n.title)}</p><p className="text-xs text-stone-600 leading-snug">{renderSafeString(n.message)}</p><span className="text-[10px] text-stone-400 mt-1 block">{new Date(n.createdAt).toLocaleString('vi-VN')}</span></div></div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                </div>
                <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-white/90 active:bg-red-800 rounded-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
             </>
           )}
           {!isTaskView && (<button onClick={handleLogout} className="p-2 text-white/90 active:bg-red-800 rounded-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg></button>)}
        </div>
      </div>

      {isMobileMenuOpen && (<div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

      {/* Sidebar */}
      {isTaskView && (
        <aside className={`fixed md:sticky top-0 left-0 bottom-0 w-72 bg-red-950 text-stone-300 h-screen z-50 shadow-2xl transform transition-transform duration-300 md:translate-x-0 flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 flex items-center gap-3 border-b border-red-900 shrink-0">
            <div className="w-12 h-12 rounded-full bg-red-900 flex items-center justify-center p-1 overflow-hidden ring-2 ring-yellow-500 shadow-lg"><img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain" /></div>
            <div><h2 className="text-[10px] font-bold text-yellow-500 leading-tight uppercase">CA TỈNH QUẢNG TRỊ</h2><h3 className="text-xs font-extrabold text-white leading-tight uppercase mt-0.5">CAP Nam Đông Hà</h3></div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden ml-auto text-red-300"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
          </div>
          
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            <button onClick={() => { setCurrentView('HOME'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'HOME' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>Trang chủ</button>
            
            <button onClick={() => { setCurrentView('WEEKLY_SCHEDULE'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'WEEKLY_SCHEDULE' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>Lịch công tác tuần</button>

            <button onClick={() => { setCurrentView('CALENDAR'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'CALENDAR' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>Lịch cá nhân</button>

            <button onClick={() => { setCurrentView('DASHBOARD'); setFilterStatus('ALL'); setFilterAssignee('ALL'); setFilterCreator('ALL'); setSortOption('NEWEST'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'DASHBOARD' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>Sổ Giao Việc</button>

            <button onClick={() => { setCurrentView('MAP_DUTY'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'MAP_DUTY' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>Sơ đồ bảo vệ</button>

            {isLeader(currentUser.role) && (
              <>
              <button onClick={() => { setCurrentView('PROPOSALS'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'PROPOSALS' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>Hòm thư Đề xuất {proposalTasks.length > 0 && <span className="ml-auto bg-yellow-500 text-red-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{proposalTasks.length}</span>}</button>
              </>
            )}

            <button onClick={() => { setCurrentView('UTILITIES'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'UTILITIES' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>Tiện ích hỗ trợ</button>
            
            <button onClick={() => { setCurrentView('GAMES'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'GAMES' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><span className="text-lg">🎮</span> Góc Giải Trí</button>
            
            <button onClick={() => { setCurrentView('ATTENDANCE'); setIsMobileMenuOpen(false); }} className={`w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${currentView === 'ATTENDANCE' ? 'bg-red-800 text-white shadow-lg shadow-red-900/50 font-bold border border-red-700' : 'hover:bg-red-900 text-red-200 hover:text-white'}`}><span className="text-lg">🛑</span> Điểm danh hội nghị</button>

            {!isStandalone && (
              <button 
                onClick={handleInstallApp}
                className="w-full text-left text-sm px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/30 mt-4"
              >
                <span className="text-lg">📲</span>
                <div className="flex flex-col">
                  <span className="font-bold">Cài đặt Ứng dụng</span>
                  <span className="text-[10px] opacity-80 leading-none mt-0.5">Để nhận thông báo tức thì</span>
                </div>
              </button>
            )}

            <div className="pt-6 pb-2 px-4 text-[11px] font-bold text-red-400 uppercase tracking-wider">Trạng thái</div>
            {[TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.OVERDUE].map(st => {
              const labels: Record<string, string> = { [TaskStatus.PENDING]: 'Chờ xử lý', [TaskStatus.IN_PROGRESS]: 'Đang thực hiện', [TaskStatus.COMPLETED]: 'Hoàn thành', [TaskStatus.OVERDUE]: 'Quá hạn' };
              const icons: Record<string, React.ReactNode> = {
                [TaskStatus.PENDING]: <span className="w-2 h-2 rounded-full bg-stone-400"></span>,
                [TaskStatus.IN_PROGRESS]: <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>,
                [TaskStatus.COMPLETED]: <span className="w-2 h-2 rounded-full bg-green-400"></span>,
                [TaskStatus.OVERDUE]: <span className="w-2 h-2 rounded-full bg-red-600"></span>
              };
              return (
                <button key={st} onClick={() => { setCurrentView('DASHBOARD'); setFilterStatus(st); setIsMobileMenuOpen(false); }} className={`w-full text-left px-4 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all ${filterStatus === st && currentView === 'DASHBOARD' ? 'bg-red-900 text-white font-medium border-l-4 border-yellow-500 pl-3' : 'hover:bg-red-900/50 text-red-200 hover:text-white'}`}>
                  {icons[st]} {labels[st]}
                </button>
              );
            })}

            {isLeader(currentUser.role) && (
              <>
                <div className="pt-6 pb-2 px-4 text-[11px] font-bold text-red-400 uppercase tracking-wider">Hệ thống</div>
                <button onClick={() => { setShowUserModal(true); setIsMobileMenuOpen(false); }} className="w-full text-left px-4 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all text-red-200 hover:bg-red-900 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>Quản lý Cán bộ
                </button>
              </>
            )}
          </nav>

          <div className="p-4 bg-red-950 border-t border-red-900">
            <div className="flex items-center gap-3 mb-4">
              <img src={currentUser.avatarUrl} alt="Avatar" className="w-9 h-9 rounded-full ring-2 ring-yellow-500" />
              <div className="overflow-hidden"><p className="text-sm font-bold text-white truncate">{currentUser.fullName}</p><p className="text-[10px] text-red-300 truncate uppercase">{roleLabel(currentUser.role)}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowChangePassModal(true)} className="w-full text-xs py-2 bg-red-900/50 hover:bg-red-800 text-red-200 hover:text-white border border-red-800 rounded-lg font-bold transition-colors">Đổi MK</button>
              <Button variant="danger" className="w-full text-xs py-2 bg-red-900 hover:bg-stone-800 text-white shadow-none hover:shadow-none border border-red-800 font-bold px-0" onClick={handleLogout}>Đăng xuất</Button>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`flex-1 p-4 pt-20 md:pb-12 md:p-12 md:pt-12 overflow-y-auto h-screen custom-scrollbar relative z-0 ${(currentView === 'CALENDAR' || currentView === 'WEEKLY_SCHEDULE') ? 'pb-4' : 'pb-36'}`}>
        
        {!isTaskView && renderTopHeader()}

        {isTaskView && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-10 gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentView('HOME')} 
                className="hidden md:flex p-3 bg-white rounded-xl shadow-sm border border-stone-100 text-stone-400 hover:text-red-800 hover:shadow-md transition-all"
                title="Quay lại"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              </button>
              <div>
                <h1 className="text-xl md:text-3xl font-extrabold text-red-900 tracking-tight uppercase">
                  {currentView === 'DASHBOARD' && 'Sổ Giao Việc'}
                  {currentView === 'WEEKLY_SCHEDULE' && 'Lịch Công Tác Tuần (Đơn vị)'}
                  {currentView === 'PROPOSALS' && 'Hòm thư Đề xuất'}
                  {currentView === 'CALENDAR' && 'Lịch Cá Nhân'}
                  {currentView === 'UTILITIES' && 'Tiện ích hỗ trợ'}
                </h1>
                {!isStandalone && (
                  <div className="mt-1 inline-flex items-center gap-2 px-2 py-0.5 bg-yellow-50 text-yellow-800 text-[10px] md:text-xs font-bold rounded-lg border border-yellow-200 animate-pulse">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                    Chế độ Web - Hãy cài đặt ứng dụng để nhận thông báo
                  </div>
                )}
                <p className="text-stone-500 mt-1 font-bold text-xs md:text-base">
                  {currentView === 'DASHBOARD' && `Hôm nay là ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
                  {currentView === 'WEEKLY_SCHEDULE' && 'Theo dõi và quản lý lịch công tác, hội họp của đơn vị.'}
                  {currentView === 'PROPOSALS' && 'Tổng hợp ý kiến, kiến nghị từ cán bộ chiến sĩ.'}
                  {currentView === 'CALENDAR' && 'Theo dõi lịch làm việc cá nhân.'}
                  {currentView === 'UTILITIES' && 'Các công cụ và liên kết hỗ trợ nghiệp vụ.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 w-full md:w-auto">
               <div className="hidden md:block">
                 <Button variant="secondary" onClick={handleRefreshData} className={`h-12 w-12 !px-0 rounded-full flex items-center justify-center ${isLoading ? 'animate-spin border-yellow-400 text-yellow-500' : 'text-stone-400 hover:text-red-700'}`} title="Làm mới dữ liệu"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></Button>
               </div>
               
               <div className="relative hidden md:block" ref={notifRef}>
                  <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="p-3 bg-white rounded-xl shadow-sm border border-stone-100 text-stone-500 hover:text-red-700 hover:shadow-md transition-all relative">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                    {unreadCount > 0 && (<span className="absolute top-2 right-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span></span>)}
                  </button>
                  {showNotifPanel && (
                    <div className="absolute top-14 right-0 w-[380px] bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden z-50 animate-fade-in-up origin-top-right">
                      <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex justify-between items-center"><h3 className="text-base font-bold text-red-900">Thông báo</h3><button onClick={handleMarkAllRead} className="text-xs text-red-600 font-bold hover:underline">Đánh dấu đã đọc</button></div>
                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {permissionStatus === 'default' && (
                           <div className="p-3 bg-yellow-50 border-b border-yellow-100 text-center">
                                <p className="text-xs text-yellow-800 mb-2 font-medium">Nhận thông báo ngay trên điện thoại?</p>
                                <button onClick={requestNotificationPermission} className="px-3 py-1.5 bg-yellow-400 text-red-900 text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-transform">Bật thông báo ngay</button>
                             </div>
                          )}
                        {notifications.length === 0 ? (<div className="p-10 text-center flex flex-col items-center"><div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mb-3 text-2xl">🔕</div><p className="text-stone-400 text-sm font-medium">Không có thông báo mới</p></div>) : (
                          notifications.map(n => (
                            <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 border-b border-stone-50 hover:bg-stone-50 transition-colors cursor-pointer group ${!n.isRead ? 'bg-orange-50/50' : ''}`}>
                              <div className="flex gap-4"><div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${!n.isRead ? 'bg-red-500 shadow-sm shadow-red-300' : 'bg-transparent'}`}></div><div className="flex-1"><p className="text-sm font-bold text-stone-800 mb-1 group-hover:text-red-700 transition-colors">{renderSafeString(n.title)}</p><p className="text-sm text-stone-600 leading-relaxed">{renderSafeString(n.message)}</p><span className="text-[11px] text-stone-400 mt-2 block font-medium">{new Date(n.createdAt).toLocaleString('vi-VN')}</span></div></div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
               </div>

               {currentView === 'DASHBOARD' && (
                  <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    {/* NEW EXPORT REMINDER BUTTON */}
                    {isLeader(currentUser.role) && (
                      <div className="flex gap-2 w-full md:w-auto">
                          <Button 
                            onClick={() => setShowRemindModal(true)} 
                            className="w-full md:w-auto px-4 py-3 bg-white text-black font-bold border border-red-200 hover:bg-red-50 shadow-md flex items-center justify-center"
                            title="Xuất ảnh nhắc việc"
                          >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            Xuất nhắc nhở
                          </Button>
                          <Button 
                            onClick={async () => {
                              const { ExcelService } = await import('./services/excelService');
                              ExcelService.exportTasks(tasks, users);
                            }}
                            className="w-full md:w-auto px-4 py-3 bg-green-600 text-white font-bold border border-green-700 hover:bg-green-700 shadow-md flex items-center justify-center"
                            title="Xuất tất cả công việc ra Excel"
                          >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Xuất Excel
                          </Button>
                      </div>
                    )}
                    <Button onClick={openNewTaskModal} icon={<span className="text-lg font-bold">+</span>} className={`w-full md:w-auto px-6 py-3 shadow-red-500/20 card-3d inline-flex ${currentUser.role === UserRole.OFFICER ? 'bg-amber-600 hover:bg-amber-700 border-b-2 border-amber-800' : ''}`}>{isLeader(currentUser.role) ? 'Giao việc mới' : 'Thêm việc cá nhân'}</Button>
                  </div>
                )}
            </div>
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
        ) : currentView === 'WEEKLY_SCHEDULE' ? (
            <Suspense fallback={<LoadingBox />}><WeeklyCalendar currentUser={currentUser} /></Suspense>
        ) : currentView === 'UTILITIES' ? (
           renderUtilities()
        ) : currentView === 'PROPOSALS' ? (
           <div className="pb-20">
              {allProposalsHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur rounded-3xl border border-dashed border-stone-300">
                  <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-full flex items-center justify-center mb-4 text-4xl">📬</div>
                  <p className="text-stone-500 font-medium">Chưa có đề xuất nào từ cán bộ.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                   {allProposalsHistory.map(task => {
                     // For proposals, we just show one assignee (creator usually) or first one
                     const assignee = users.find(u => u.id === task.assigneeIds[0]);
                     const isRead = task.isProposalRead;
                     return (
                       <div key={task.id} onClick={() => openEditTaskModal(task)} className={`p-6 rounded-2xl shadow-sm border cursor-pointer transition-all card-3d group relative overflow-hidden ${isRead ? 'bg-white border-stone-100 opacity-80' : 'bg-white border-blue-200 ring-2 ring-blue-50'}`}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isRead ? 'bg-stone-300' : 'bg-blue-500'}`}></div>
                          <div className="flex flex-col md:flex-row gap-6">
                             <div className="flex items-start gap-4 md:w-1/4 min-w-[200px] border-b md:border-b-0 md:border-r border-stone-100 pb-4 md:pb-0">
                                <img src={assignee?.avatarUrl} className="w-12 h-12 rounded-full ring-2 ring-blue-100" alt="" />
                                <div><p className="text-sm font-bold text-stone-800">{assignee?.fullName}</p><span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded mt-1 inline-block ${isRead ? 'text-stone-500 bg-stone-100' : 'text-blue-600 bg-blue-50'}`}>{isRead ? 'Đã xem' : 'Đề xuất mới'}</span></div>
                             </div>
                             <div className="flex-1">
                                <div className={`p-4 rounded-xl border mb-3 relative ${isRead ? 'bg-stone-50 border-stone-100' : 'bg-blue-50/50 border-blue-100'}`}><svg className={`absolute top-2 left-2 w-6 h-6 ${isRead ? 'text-stone-300' : 'text-blue-200'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 13.1216 16 12.017 16H9.01699V21H14.017ZM16.017 21V16H19.017C20.1216 16 21.017 16.8954 21.017 18V21H16.017ZM7.01699 16H4.01699C2.91243 16 2.01699 16.8954 2.01699 18V21H7.01699V16Z"></path></svg><p className="text-stone-800 text-sm font-medium italic pl-6">"{renderSafeString(task.proposal)}"</p></div>
                                <div className="flex items-center gap-2 text-xs text-stone-400"><span>Thuộc nhiệm vụ:</span><span className="font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded max-w-[300px] truncate">{renderSafeString(task.title)}</span></div>
                                {task.managerResponse && (<div className="mt-2 text-xs flex items-center gap-2"><span>Phản hồi:</span><span className={`font-bold ${task.managerResponse.type === 'AGREE' ? 'text-green-600' : (task.managerResponse.type === 'REJECT' ? 'text-red-600' : 'text-stone-600')}`}>{task.managerResponse.type === 'AGREE' ? 'ĐỒNG Ý' : (task.managerResponse.type === 'REJECT' ? 'TỪ CHỐI' : 'CHỈ ĐẠO KHÁC')}</span></div>)}
                             </div>
                             <div className="flex items-center justify-end md:w-auto"><button className="p-2 rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg></button></div>
                          </div>
                       </div>
                     );
                   })}
                </div>
              )}
           </div>
        ) : currentView === 'GAMES' ? (
            <Suspense fallback={<LoadingBox />}><GamesHub currentUser={currentUser!} /></Suspense>
        ) : currentView === 'ATTENDANCE' ? (
           <div className="animate-fade-in-up">
              <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
                 <div>
                    <h2 className="text-2xl font-bold text-gray-800">Điểm Danh Hội Nghị</h2>
                    <p className="text-stone-500">Quản lý và thực hiện điểm danh cho các cuộc họp, hội nghị</p>
                 </div>
                 {hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && (
                    <div className="flex bg-stone-100 p-1 rounded-xl shadow-inner border border-stone-200 w-full md:w-auto overflow-x-auto">
                        <button 
                          onClick={() => setAttendanceMode('MANAGE')} 
                          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${attendanceMode === 'MANAGE' ? 'bg-white text-red-700 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          Quản lý
                        </button>
                        <button 
                          onClick={() => setAttendanceMode('SCAN')} 
                          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${attendanceMode === 'SCAN' ? 'bg-white text-red-700 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          Quét mã
                        </button>
                        <button 
                          onClick={() => setAttendanceMode('REPORT')} 
                          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${attendanceMode === 'REPORT' ? 'bg-white text-red-700 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          Báo cáo vắng
                        </button>
                    </div>
                 )}
              </div>
              
              {hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && attendanceMode === 'REPORT' ? (
                  <Suspense fallback={<LoadingBox />}><AbsenceReport currentUser={currentUser} canEdit={hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE)} /></Suspense>
              ) : hasPermission(currentUser, UserPermission.MANAGE_ATTENDANCE) && attendanceMode === 'MANAGE' ? (
                  <Suspense fallback={<LoadingBox />}><AttendanceManager currentUser={currentUser} /></Suspense>
              ) : (
                  <Suspense fallback={<LoadingBox />}><AttendanceScanner currentUser={currentUser} onSuccess={() => setCurrentView('HOME')} /></Suspense>
              )}
           </div>
        ) : currentView === 'MAP_DUTY' ? (
            <Suspense fallback={<LoadingBox />}><MapDuty currentUser={currentUser!} users={users} isLeader={hasPermission(currentUser, UserPermission.MANAGE_MAP_DUTY)} /></Suspense>
        ) : (
           <>
              {recurringAlerts.length > 0 && (
                <div onClick={() => setFilterStatus('RECURRING_ATTENTION')} className={`mb-6 bg-white/80 backdrop-blur border p-4 rounded-2xl shadow-sm flex items-start gap-4 card-3d cursor-pointer hover:bg-yellow-50 transition-all ${filterStatus === 'RECURRING_ATTENTION' ? 'border-yellow-400 ring-2 ring-yellow-100' : 'border-yellow-100'}`}>
                  <div className="bg-yellow-50 p-2.5 rounded-full text-yellow-600 shrink-0"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                  <div><h4 className="font-bold text-yellow-900 text-sm">Nhiệm vụ định kỳ</h4><p className="text-yellow-700/80 text-xs mt-0.5">Có <strong>{recurringAlerts.length}</strong> công việc lặp lại cần chú ý.</p></div>
                </div>
              )}

              <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 md:gap-4 mb-8">
                <div onClick={() => setFilterStatus('ALL')} className={`col-span-4 lg:col-span-1 bg-white/80 backdrop-blur p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-white transition-all ${filterStatus === 'ALL' ? 'border-red-400 ring-2 ring-red-100' : 'border-stone-100'}`}><p className="text-stone-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-2">Tổng việc</p><p className="text-2xl md:text-3xl font-extrabold text-stone-800">{stats.total}</p></div>
                 <div onClick={() => setFilterStatus('ACCEPTED')} className={`col-span-2 lg:col-span-1 bg-white/80 backdrop-blur p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-white transition-all ${filterStatus === 'ACCEPTED' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-stone-100'}`}><p className="text-blue-600/70 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-2">Đã nhận</p><p className="text-2xl md:text-3xl font-extrabold text-blue-600">{stats.accepted}</p></div>
                <div onClick={() => setFilterStatus('NOT_ACCEPTED')} className={`col-span-2 lg:col-span-1 bg-white/80 backdrop-blur p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-white transition-all ${filterStatus === 'NOT_ACCEPTED' ? 'border-stone-400 ring-2 ring-stone-100' : 'border-stone-100'}`}><p className="text-stone-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-2">Chưa nhận</p><p className="text-2xl md:text-3xl font-extrabold text-stone-600">{stats.notAccepted}</p></div>
                <div onClick={() => setFilterStatus(TaskStatus.IN_PROGRESS)} className={`col-span-1 bg-white/80 backdrop-blur p-2 md:p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-white transition-all text-center lg:text-left ${filterStatus === TaskStatus.IN_PROGRESS ? 'border-amber-400 ring-2 ring-amber-100' : 'border-stone-100'}`}><p className="text-amber-600/70 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1 md:mb-2 truncate">Đang làm</p><p className="text-xl md:text-3xl font-extrabold text-amber-500">{stats.inProgress}</p></div>
                <div onClick={() => setFilterStatus(TaskStatus.COMPLETED)} className={`col-span-1 bg-white/80 backdrop-blur p-2 md:p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-white transition-all text-center lg:text-left ${filterStatus === TaskStatus.COMPLETED ? 'border-green-400 ring-2 ring-green-100' : 'border-stone-100'}`}><p className="text-green-600/70 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1 md:mb-2 truncate">Xong</p><p className="text-xl md:text-3xl font-extrabold text-green-600">{stats.completed}</p></div>
                <div onClick={() => setFilterStatus('DUE_SOON')} className={`col-span-1 bg-orange-50/90 backdrop-blur p-2 md:p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-orange-50 transition-all text-center lg:text-left ${filterStatus === 'DUE_SOON' ? 'border-orange-400 ring-2 ring-orange-100' : 'border-orange-100'}`}><p className="text-orange-700 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1 md:mb-2 truncate">Sắp hạn</p><p className="text-xl md:text-3xl font-extrabold text-orange-600">{stats.dueSoon}</p></div>
                <div onClick={() => setFilterStatus('OVERDUE_FILTER')} className={`col-span-1 bg-red-50/90 backdrop-blur p-2 md:p-4 rounded-2xl shadow-sm border card-3d cursor-pointer hover:bg-red-50 transition-all text-center lg:text-left ${filterStatus === 'OVERDUE_FILTER' ? 'border-red-600 ring-2 ring-red-200' : 'border-red-100'}`}><p className="text-red-700 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-1 md:mb-2 truncate">Quá hạn</p><p className="text-xl md:text-3xl font-extrabold text-red-600">{stats.overdue}</p></div>
              </div>

              <div className="flex flex-col xl:flex-row justify-between items-end xl:items-center mb-5 gap-3">
                  <div className="flex items-center gap-2 flex-1 w-full xl:w-auto">
                     <h3 className="text-base md:text-xl font-bold text-stone-800 whitespace-nowrap">
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
                     {filterAssignee !== 'ALL' && (<span className="bg-red-50 text-red-800 px-3 py-1 rounded-full text-[10px] md:text-sm truncate max-w-[120px]">{users.find(u => u.id === filterAssignee)?.fullName}</span>)}
                     {filterCreator !== 'ALL' && (<span className="bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-[10px] md:text-sm truncate max-w-[120px]">Giao bởi: {users.find(u => u.id === filterCreator)?.fullName}</span>)}
                     {(filterAssignee !== 'ALL' || filterStatus !== 'ALL' || filterCreator !== 'ALL') && (<button onClick={() => { setFilterAssignee('ALL'); setFilterStatus('ALL'); setFilterCreator('ALL'); }} className="text-[10px] md:text-xs text-stone-400 hover:text-red-600 transition-colors ml-2 font-semibold">✕ Xóa bộ lọc</button>)}
                  </div>
                  
                  <div className="w-full xl:w-auto flex flex-col sm:flex-row gap-3">
                    {isLeader(currentUser.role) && (
                        <div className="w-full sm:w-48"><Select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} options={officerOptions} className="py-2 text-sm shadow-sm" /></div>
                    )}
                    <div className="w-full sm:w-48"><Select value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)} options={leaderOptions} className="py-2 text-sm shadow-sm" /></div>
                    <div className="w-full sm:w-44"><Select value={sortOption} onChange={(e) => setSortOption(e.target.value)} options={sortOptions} className="py-2 text-sm shadow-sm" /></div>
                    <div className="w-full sm:w-60"><Input type="search" placeholder="Tìm kiếm công việc..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="py-2 text-sm shadow-sm" /></div>
                  </div>
              </div>

              <div className="space-y-4 pb-20">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur rounded-3xl border border-dashed border-stone-300">
                    <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-4xl">📂</div>
                    <p className="text-stone-500 font-medium">{searchQuery ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có nhiệm vụ nào.'}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:gap-5">
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
                        <div key={task.id} onClick={() => openEditTaskModal(task)} className={`group relative bg-white rounded-2xl p-5 shadow-sm border border-stone-100 cursor-pointer hover:shadow-lg hover:border-red-200 transition-all card-3d overflow-hidden ${isOverdue ? 'ring-2 ring-red-100 bg-red-50/30' : ''}`}>
                           {/* Highlight Bar */}
                           <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${task.status === TaskStatus.COMPLETED ? 'bg-green-500' : task.status === TaskStatus.IN_PROGRESS ? 'bg-amber-500' : task.status === TaskStatus.OVERDUE ? 'bg-red-600' : 'bg-stone-300'}`}></div>
                           
                           <div className="pl-4">
                              <div className="flex justify-between items-start mb-2">
                                 <div className="flex gap-2 items-center flex-wrap">
                                    <PriorityBadge priority={task.priority} />
                                    {task.isRegularDuty && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">TX</span>}
                                    {isDueSoon && <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 animate-pulse">Sắp hạn</span>}
                                    {!!task.acceptedAt && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Đã nhận</span>}
                                    <RecurringBadge type={task.recurring} />
                                 </div>
                                 <StatusBadge status={task.status} />
                              </div>

                              <h3 className={`text-sm md:text-base font-bold text-stone-800 mb-1 leading-snug ${task.status === TaskStatus.COMPLETED ? 'line-through text-stone-500' : ''}`}>
                                 {renderSafeString(task.title)}
                              </h3>
                              
                              <p className="text-xs md:text-sm text-stone-500 line-clamp-2 mb-3 leading-relaxed">
                                 {renderSafeString(task.description)}
                              </p>

                              {/* Show Creator Name */}
                              <div className="mb-3 flex items-center gap-1">
                                <span className="text-[9px] md:text-[10px] text-stone-400 uppercase font-bold">Người giao:</span>
                                <span className="text-[10px] md:text-xs font-bold text-stone-700">{users.find(u => u.id === task.creatorId)?.fullName || 'N/A'}</span>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-stone-100 border-dashed">
                                 <div className="flex -space-x-2">
                                    {assignees.map((u, i) => (
                                       <img key={u.id} src={u.avatarUrl} alt={u.fullName} className="w-6 h-6 rounded-full border border-white ring-1 ring-stone-100" title={u.fullName} style={{ zIndex: 10 - i }} />
                                    ))}
                                    {assignees.length === 0 && <span className="text-xs text-stone-400 italic">Chưa giao</span>}
                                 </div>
                                 <div className="text-right">
                                    <p className={`text-[10px] md:text-xs font-bold ${isOverdue ? 'text-red-600' : 'text-stone-500'}`}>
                                       {task.isRegularDuty ? 'Thường xuyên' : new Date(task.dueDate).toLocaleDateString('vi-VN')}
                                    </p>
                                    <p className="text-[9px] md:text-[10px] text-stone-400">Hạn xử lý</p>
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
      </main>

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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in-up">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-purple-50">
                 <h3 className="font-bold text-purple-900">{editingUtility ? 'Cập nhật tiện ích' : 'Thêm tiện ích mới'}</h3>
                 <button onClick={() => setShowUtilityModal(false)} className="text-stone-400 hover:text-red-600">✕</button>
              </div>
              <form onSubmit={handleSaveUtility} className="p-6 space-y-4">
                 <Input label="Tên tiện ích" value={utilName} onChange={e => setUtilName(e.target.value)} placeholder="VD: Cổng Dịch vụ công" required />
                 <Input label="Đường dẫn (URL)" value={utilUrl} onChange={e => setUtilUrl(e.target.value)} placeholder="https://..." required />
                 <Input label="Icon URL (Tùy chọn)" value={utilIconUrl} onChange={e => setUtilIconUrl(e.target.value)} placeholder="Link ảnh icon..." />
                 <div className="flex justify-end gap-2 mt-4">
                    <Button type="button" variant="secondary" onClick={() => setShowUtilityModal(false)}>Hủy</Button>
                    <Button type="submit" className="bg-purple-600 hover:bg-purple-700 border-purple-800">Lưu</Button>
                 </div>
              </form>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;