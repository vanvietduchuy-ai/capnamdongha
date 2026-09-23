self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests
  event.respondWith(fetch(event.request));
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background Sync', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let title = 'Thông báo mới';
  let options = {
    body: 'Bạn có thông báo mới từ ứng dụng.',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMAT1EEiTjShLjCbC_DbVGPRAXHcbA_IZNww&s',
    badge: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMAT1EEiTjShLjCbC_DbVGPRAXHcbA_IZNww&s'
  };

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      options.body = data.body || options.body;
    } catch (e) {
      options.body = event.data.text();
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

// Background Fetch
self.addEventListener('backgroundfetchsuccess', (event) => {
  console.log('[Service Worker] Background Fetch Success', event.registration.id);
});

async function syncData() {
  console.log('[Service Worker] Syncing data in background...');
  // Implement background data sync logic here
  // For example, fetch new notifications or update local cache
}
