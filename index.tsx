import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(async registration => {
      console.log('SW registered: ', registration);
      
      // Request periodic background sync if supported
      if ('periodicSync' in registration) {
        try {
          const status = await navigator.permissions.query({
            name: 'periodic-background-sync' as PermissionName
          });
          
          if (status.state === 'granted') {
            // @ts-ignore
            await registration.periodicSync.register('app-refresh', {
              minInterval: 24 * 60 * 60 * 1000 // 1 day
            });
            console.log('Periodic background sync registered.');
          } else {
            console.log('Periodic background sync permission denied.');
          }
        } catch (error) {
          console.error('Periodic background sync could not be registered:', error);
        }
      }
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}


// --- HIỂN THỊ LỖI RA MÀN HÌNH (thay vì trang trắng) ---
const escapeHtml = (v: string) =>
  String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

const showFatalError = (rawMessage: string, rawDetail?: string) => {
  const el = document.getElementById('root');
  if (!el) return;
  const message = escapeHtml(rawMessage || '');
  const detail = rawDetail ? escapeHtml(rawDetail) : '';
  el.innerHTML = `
    <div style="max-width:640px;margin:40px auto;padding:24px;background:#fff;border-radius:16px;
                border-top:5px solid #b91c1c;box-shadow:0 10px 30px rgba(0,0,0,.08);
                font-family:system-ui,sans-serif;color:#450a0a">
      <h2 style="margin:0 0 8px;font-size:18px">Ứng dụng gặp lỗi khi khởi động</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#57534e">
        Vui lòng chụp lại màn hình này gửi cho người quản trị hệ thống.
      </p>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#fef2f2;padding:12px;
                  border-radius:8px;font-size:12px;color:#991b1b;margin:0 0 12px">${message}${detail ? '\n\n' + detail : ''}</pre>
      <button onclick="localStorage.clear();location.reload()"
              style="padding:10px 16px;background:#b91c1c;color:#fff;border:0;border-radius:8px;
                     font-weight:700;cursor:pointer">Xoá dữ liệu tạm và tải lại</button>
    </div>`;
};

window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root && root.querySelectorAll('div').length <= 3) {
    showFatalError(e.message || 'Lỗi không xác định', (e as any).filename || '');
  }
});

window.addEventListener('unhandledrejection', (e: any) => {
  console.error('Unhandled rejection:', e.reason);
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('App crashed:', error, info);
  }
  render() {
    if (this.state.error) {
      setTimeout(() => showFatalError(this.state.error!.message, this.state.error!.stack?.split('\n')[1] || ''), 0);
      return null;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);