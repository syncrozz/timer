const CACHE_NAME = 'one-tap-timer-v2';
const ASSETS_TO_CACHE = [
  '/',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-512x512.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/apple-touch-icon.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-32x32.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-16x16.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon.ico',
  '/site.webmanifest',
  '/manifest.json',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/OGI/OGI.One.Tap.Timer.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

let scheduledAlarmTimeout = null;

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_ALARM') {
    if (scheduledAlarmTimeout) {
      clearTimeout(scheduledAlarmTimeout);
      scheduledAlarmTimeout = null;
    }

    const targetTime = event.data.endTime;
    const now = Date.now();
    const delay = Math.max(0, targetTime - now);

    // Try native OS TimestampTrigger (supported on Android Chrome for exact lockscreen alarm wakeup)
    try {
      if (typeof TimestampTrigger !== 'undefined' && 'showTrigger' in Notification.prototype) {
        self.registration.showNotification(event.data.title || 'One Tap Timer', {
          body: event.data.body || '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
          icon: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
          badge: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png',
          tag: 'one-tap-timer-finished',
          showTrigger: new TimestampTrigger(targetTime),
          requireInteraction: true,
          vibrate: [600, 300, 600, 300, 600, 300, 600],
          renotify: true,
        });
      }
    } catch (e) {
      // Fallback to standard timer below
    }

    scheduledAlarmTimeout = setTimeout(() => {
      self.registration.showNotification(event.data.title || 'One Tap Timer', {
        body: event.data.body || '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
        icon: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
        badge: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png',
        tag: 'one-tap-timer-finished',
        requireInteraction: true,
        vibrate: [600, 300, 600, 300, 600, 300, 600],
        renotify: true,
      });
      scheduledAlarmTimeout = null;
    }, delay);
  } else if (event.data.type === 'CANCEL_ALARM') {
    if (scheduledAlarmTimeout) {
      clearTimeout(scheduledAlarmTimeout);
      scheduledAlarmTimeout = null;
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
