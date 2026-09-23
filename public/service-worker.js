/* Service Worker cho ứng dụng Điểm danh Hội nghị – CAP Nam Đông Hà */
/* Nhận thông báo nền bằng cách hỏi định kỳ Supabase (REST) */

const CACHE_NAME = 'cap-namdongha-supabase-v1';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json'];

const DB_NAME = 'sw_config_db';
const STORE_NAME = 'config_store';
const CONFIG_KEY = 'cloud_config';
const POLL_MS = 60000; // 1 phút/lần khi chạy nền

/* ---------- INDEXEDDB: nhớ cấu hình kể cả khi đóng app ---------- */
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onsuccess = (event) => resolve(event.target.result);
  request.onerror = (event) => reject(event.target.error);
});

async function saveConfigToDB(config) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(config, CONFIG_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getConfigFromDB() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(CONFIG_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- GỌI API SUPABASE ---------- */
async function fetchUnreadNotifications(config) {
  if (!config || !config.supabaseUrl || !config.supabaseKey || !config.userId) return null;
  try {
    const url = config.supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/notifications?select=*' +
      '&userId=eq.' + encodeURIComponent(config.userId) +
      '&isRead=eq.false&order=createdAt.desc&limit=10';

    const res = await fetch(url, {
      headers: {
        apikey: config.supabaseKey,
        Authorization: 'Bearer ' + config.supabaseKey
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

let pollTimer = null;
let lastSeenAt = 0;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => checkNotifications(), POLL_MS);
  checkNotifications();
}

async function checkNotifications() {
  const config = await getConfigFromDB();
  const data = await fetchUnreadNotifications(config);
  if (!Array.isArray(data)) return;

  // Chỉ báo những thông báo phát sinh sau lần kiểm tra trước
  const fresh = data.filter(n => Number(n.createdAt || 0) > lastSeenAt);
  if (data.length) {
    lastSeenAt = Math.max.apply(null, data.map(n => Number(n.createdAt || 0)));
  }
  if (fresh.length && lastSeenAt) {
    fresh.slice(0, 3).forEach(showNotification);
  }

  if ('setAppBadge' in self.navigator) {
    try {
      if (data.length) self.navigator.setAppBadge(data.length);
      else self.navigator.clearAppBadge();
    } catch (e) {}
  }
}

function showNotification(notif) {
  self.registration.showNotification(notif.title || 'Thông báo mới', {
    body: notif.message || '',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMAT1EEiTjShLjCbC_DbVGPRAXHcbA_IZNww&s',
    badge: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMAT1EEiTjShLjCbC_DbVGPRAXHcbA_IZNww&s',
    tag: notif.id,
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500],
    data: { url: '/', taskId: notif.taskId }
  });
}

/* ---------- VÒNG ĐỜI SERVICE WORKER ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(getConfigFromDB().then((config) => { if (config) startPolling(); }));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_BACKGROUND_LISTENER') {
    const payload = event.data.payload;
    saveConfigToDB(payload).then(() => startPolling());
  }
  if (event.data && event.data.type === 'CLEAR_BACKGROUND_LISTENER') {
    // Đăng xuất: ngừng nhận thông báo của tài khoản cũ
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    lastSeenAt = 0;
    saveConfigToDB(null);
    try { self.navigator.clearAppBadge && self.navigator.clearAppBadge(); } catch (e) {}
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          client.postMessage({ type: 'REFRESH_DATA' });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

/* ---------- ĐỒNG BỘ NỀN ---------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') event.waitUntil(performBackgroundRefresh());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'app-refresh') event.waitUntil(performBackgroundRefresh());
});

async function performBackgroundRefresh() {
  try {
    await checkNotifications();
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) client.postMessage({ type: 'BACKGROUND_REFRESH_COMPLETE' });
  } catch (error) {
    console.error('SW: Làm mới nền thất bại:', error);
  }
}
