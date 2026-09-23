import React, { useState, useEffect } from 'react';
import { MockDB } from '../services/mockDatabase';
import { Button, Input } from './UI';

interface GuestCheckInProps {
  sessionId: string;
  timestamp: number;
  onSuccess: () => void;
}

export const GuestCheckIn: React.FC<GuestCheckInProps> = ({ sessionId, timestamp, onSuccess }) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('Hội nghị');

  useEffect(() => {
    const initSystem = async () => {
      // Validate Timestamp (60 seconds validity window)
      const now = Date.now();
      if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 60000) {
        setError("Mã QR đã hết hạn. Vui lòng quét lại mã mới nhất trên màn hình.");
        return;
      }

      // Tìm đúng phiên theo mã trong liên kết
      const session = await MockDB.getSessionById(sessionId);
      if (!session || session.isActive === false || session.expiresAt <= now) {
        setError(MockDB.isCloudEnabled()
          ? "Phiên điểm danh không tồn tại hoặc đã kết thúc."
          : "Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi quét lại.");
        return;
      }
      setSessionTitle(session.title);

      // Get or generate persistent unique device ID
      let id = localStorage.getItem('attendance_device_id');
      if (!id) {
          const random = Math.random().toString(36).substring(2, 11);
          const ts = Date.now().toString(36);
          id = `device_${ts}_${random}`;
          localStorage.setItem('attendance_device_id', id);
      }
      setDeviceId(id);
      
      // Fetch IP Address
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
          const data = await res.json();
          setIpAddress(data.ip);
          setIsSystemReady(true);
          clearTimeout(timeoutId);
      } catch (err) {
          try {
              const res2 = await fetch('https://api.db-ip.com/v2/free/self');
              const data2 = await res2.json();
              setIpAddress(data2.ipAddress);
              setIsSystemReady(true);
          } catch (err2) {
              setIsSystemReady(true);
          }
      }
    };

    initSystem();
  }, [sessionId, timestamp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim() || !phone.trim()) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }

    // Basic phone validation
    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
      setError("Số điện thoại không hợp lệ.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const normalizedPhone = phone.replace(/\s+/g, '').replace(/^\+84/, '0');
      const result = await MockDB.guestCheckIn(name.trim(), unit.trim(), normalizedPhone, deviceId, sessionId, ipAddress);
      if (result.success) {
        onSuccess();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  if (error && !isSystemReady) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-stone-800 mb-2">Lỗi Điểm Danh</h2>
          <p className="text-stone-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-800 mb-2">Điểm Danh Khách Mời</h1>
          <p className="text-stone-600 font-medium text-lg">{sessionTitle}</p>
          <p className="text-sm text-stone-500 mt-2">Vui lòng điền thông tin để xác nhận tham gia</p>
        </div>

        {!isSystemReady ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-sm text-stone-500">Đang khởi tạo hệ thống...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-1">Họ và tên *</label>
              <Input 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nhập họ và tên của bạn"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 mb-1">Đơn vị công tác *</label>
              <Input 
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="Nhập tên đơn vị/cơ quan"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 mb-1">Số điện thoại *</label>
              <Input 
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Nhập số điện thoại cá nhân"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full py-3 mt-6"
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận điểm danh'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
