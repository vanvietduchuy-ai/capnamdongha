export enum UserRole {
  ADMIN = 'ADMIN',           // Quản trị viên
  CHIEF = 'CHIEF',           // Trưởng Công an phường
  DEPUTY_CHIEF = 'DEPUTY_CHIEF', // Phó trưởng Công an phường
  MANAGER = 'MANAGER',       // Tổ trưởng
  DEPUTY = 'DEPUTY',         // Tổ phó
  OFFICER = 'OFFICER'        // Cán bộ
}

export enum UserDepartment {
  TONG_HOP = 'Tổ Tổng hợp',
  CSKV = 'Tổ CSKV',
  CSTT = 'Tổ CSTT',
  PCTP = 'Tổ PCTP',
  AN_NINH = 'Tổ An ninh',
  PHU_TRACH_CHUNG = 'Phụ trách chung'
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE' // New status
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum RecurringType {
  NONE = 'NONE',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY' // New type
}

export enum UserPermission {
  MANAGE_USERS = 'MANAGE_USERS',
  ASSIGN_TASKS = 'ASSIGN_TASKS',
  VIEW_STATISTICS = 'VIEW_STATISTICS',
  MANAGE_WEEKLY_CALENDAR = 'MANAGE_WEEKLY_CALENDAR',
  VIEW_WEEKLY_CALENDAR = 'VIEW_WEEKLY_CALENDAR',
  MANAGE_UTILITIES = 'MANAGE_UTILITIES',
  MANAGE_ATTENDANCE = 'MANAGE_ATTENDANCE',
  MANAGE_TASKS = 'MANAGE_TASKS', // Quản lý toàn bộ nhiệm vụ
  VIEW_ALL_TASKS = 'VIEW_ALL_TASKS', // Xem toàn bộ nhiệm vụ
  MANAGE_PROPOSALS = 'MANAGE_PROPOSALS', // Quản lý đề xuất
  MANAGE_MAP_DUTY = 'MANAGE_MAP_DUTY' // Quản lý sơ đồ bảo vệ
}

export interface User {
  id: string;
  username: string;
  password?: string;
  isFirstLogin?: boolean;
  fullName: string;
  role: UserRole;
  department?: UserDepartment; // New field for Department (Tổ)
  permissions?: UserPermission[]; // New field for granular permissions
  avatarUrl?: string;
  lastLoginAt?: number; // New field for activity tracking
  email?: string; // Email nhận thông báo
  position?: string; // Chức danh
  isApproved?: boolean; // Tài khoản tự đăng ký cần quản trị viên duyệt
  emailVerified?: boolean; // Đã xác thực email bằng OTP
  createdAt?: number;
}

export interface UserGroup {
  id: string;
  name: string;
  userIds: string[];
  creatorId: string;
}

export interface AttendanceSession {
  id: string;
  title: string;
  creatorId: string;
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  expectedUserIds: string[]; // List of users expected to attend
  status?: 'DRAFT' | 'OPEN' | 'CLOSED'; // Chưa bắt đầu / Đang điểm danh / Đã kết thúc
  scheduledAt?: number | null; // Thời gian dự kiến họp
  location?: string | null;    // Địa điểm
  startedAt?: number | null;   // Lúc bắt đầu điểm danh
  endedAt?: number | null;     // Lúc kết thúc điểm danh
  seatLayoutId?: string | null; // Sơ đồ chỗ ngồi dùng cho hội nghị
  seatCompare?: boolean | null; // Bật "Đối sánh sơ đồ chỗ ngồi"
}

/** Một ghế trong sơ đồ: r = hàng (0 = sát bục), c = cột (0..leftCols+rightCols-1) */
export interface Seat {
  r: number;
  c: number;
  label: string;          // tên ghi trên sơ đồ (VD "Minh Quốc", "Đ/c Hồng")
  team?: string;          // tổ ghi trên sơ đồ (VD "CSKV")
  userId?: string | null; // cán bộ đã gắn với ghế
}

export interface SeatLayout {
  id: string;
  name: string;
  rows: number;
  leftCols: number;
  rightCols: number;
  seats: Seat[];
  updatedAt?: number;
  updatedBy?: string;
}

/** Đối sánh tại chỗ: SUSPECT = đã quét nhưng không thấy ngồi tại ghế; CONFIRMED = xác nhận có mặt đúng chỗ */
export interface SeatFlag {
  id: string;
  sessionId: string;
  userId: string;
  status: 'SUSPECT' | 'CONFIRMED';
  flaggedBy?: string;
  flaggedAt?: number;
}

export type SessionState = 'DRAFT' | 'OPEN' | 'CLOSED';

/** Trạng thái thực tế của phiên (phiên đang mở nhưng quá giờ tự đóng coi như đã kết thúc) */
export const sessionState = (s: AttendanceSession, now: number = Date.now()): SessionState => {
  if (s.status === 'DRAFT') return 'DRAFT';
  if ((s.status ?? 'OPEN') === 'OPEN' && s.isActive !== false && s.expiresAt > now) return 'OPEN';
  return 'CLOSED';
};

/** Mốc thời gian dùng cho báo cáo: lúc bắt đầu điểm danh (phiên cũ: lúc tạo) */
export const sessionTime = (s: AttendanceSession) => s.startedAt || s.createdAt;

export interface AttendanceRecord {
  id: string;
  sessionId: string; // Link to specific session
  userId: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  deviceId: string; // To prevent multiple logins on same device
  fingerprint?: string; // New: Browser fingerprint for enhanced fraud prevention
  ipAddress?: string; // New: IP address for strict fraud prevention
  status: 'PRESENT' | 'LATE' | 'ABSENT';
  guestName?: string;  // Khách mời: họ tên
  guestUnit?: string;  // Khách mời: đơn vị
  guestPhone?: string; // Khách mời: số điện thoại
}

export interface AttendanceAbsence {
  id: string;            // `${sessionId}__${userId}`
  sessionId: string;
  userId: string;
  excused: boolean | null; // true: có lý do, false: không lý do, null: chưa xác minh
  reason?: string;
  updatedBy?: string;
  updatedAt?: number;
}

export interface ManagerResponse {
  type: 'AGREE' | 'REJECT' | 'OTHER';
  content?: string;
  respondedAt: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  
  proposal?: string;
  isProposalRead?: boolean; // Check if manager viewed the proposal
  managerResponse?: ManagerResponse; // Manager's reply to proposal

  dispatchNumber?: string;
  issuingAuthority?: string;
  issueDate?: string;
  
  recurring?: RecurringType[]; // Changed to array for multiple selection

  assigneeIds: string[]; // Changed from assigneeId (string) to array
  creatorId: string;
  status: TaskStatus;
  priority: TaskPriority;
  
  dueDate: string;
  isRegularDuty?: boolean; // New flag for "Công tác thường xuyên"

  createdAt: number;
  acceptedAt?: number;
  aiSuggestedSteps?: string[];
  
  calendarSequence?: number; // Tracks how many times the task has been updated for Calendar Sync
}

export interface DashboardStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueSoon: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  type: 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'DEADLINE_WARNING' | 'SYSTEM' | 'PROPOSAL_RESPONSE' | 'TASK_ACCEPTED';
  taskId?: string;
}

// --- NEW UTILITY TYPES ---
export type UtilityScope = 'SYSTEM' | 'SHARED' | 'PERSONAL';

export interface Utility {
  id: string;
  name: string;
  url: string;
  icon?: string;
  scope: UtilityScope; 
  creatorId?: string;
}

// --- NEW CALENDAR SCHEDULE TYPES ---
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  session: 'MORNING' | 'AFTERNOON';
  time: string; // Giờ cụ thể (vd: 07:30)
  content: string; // Nội dung công việc
  location: string; // Địa điểm
  chairperson: string; // Chủ trì
  participants: string; // Thành phần tham dự
  isOnline: boolean; // Họp trực tuyến?
  meetingLink?: string; // Link họp
  creatorId: string;
  department?: UserDepartment; // Đơn vị/Tổ phụ trách
}

// --- GAME TYPES ---
export enum GameType {
  SUDOKU = 'SUDOKU',
  PUZZLE = 'PUZZLE',
  CARO = 'CARO'
}

export interface GameScore {
  id: string;
  userId: string;
  gameId: GameType;
  score: number; // Time in seconds (lower is better) or points (higher is better)
  playedAt: number;
}

export interface GameProgress {
  id: string;
  userId: string;
  gameId: GameType;
  highestLevel: number;
}

export interface DutyInfo {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  mapType?: 'real' | 'image';
  mapImageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt?: number;
  updatedAt?: number;
}