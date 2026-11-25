const CACHE_NAME = 'one-tap-timer-v3';
const CORE_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/site.webmanifest',
];

const OPTIONAL_ICON_ASSETS = [
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-512x512.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/apple-touch-icon.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-32x32.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-16x16.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon.ico',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/OGI/OGI.One.Tap.Timer.jpg',
];

const ALARM_NOTIFICATION_TAG = 'one-tap-timer-finished';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CORE_SHELL_ASSETS);
        await Promise.allSettled(
          OPTIONAL_ICON_ASSETS.map((url) => cache.add(url))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

let scheduledAlarmTimeout = null;
let activeSessionId = null;

function canShowNotification() {
  return (
    typeof self.Notification !== 'undefined' &&
    self.Notification.permission === 'granted' &&
    self.registration &&
    typeof self.registration.showNotification === 'function'
  );
}

async function clearTimerNotifications() {
  if (!self.registration || typeof self.registration.getNotifications !== 'function') {
    return;
  }
  try {
    const existing = await self.registration.getNotifications({ tag: ALARM_NOTIFICATION_TAG });
    for (const notification of existing) {
      notification.close();
    }
  } catch {
    // Ignore unsupported notification query errors
  }
}

function clearScheduledAlarm() {
  if (scheduledAlarmTimeout !== null) {
    clearTimeout(scheduledAlarmTimeout);
    scheduledAlarmTimeout = null;
  }
  activeSessionId = null;
}

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_ALARM') {
    clearScheduledAlarm();

    if (!canShowNotification()) {
      return;
    }

    const targetTime = Number(event.data.endTime);
    if (!Number.isFinite(targetTime) || targetTime <= 0) {
      return;
    }

    const sessionId = event.data.sessionId || `sw-${targetTime}`;
    activeSessionId = sessionId;
    const delay = Math.max(0, targetTime - Date.now());
    const title = event.data.title || 'One Tap Timer';
    const body = event.data.body || '⏰ Masa telah tamat! Jam penggera sedang berbunyi.';

    // Best-effort supplementary fallback only: mobile OSes may terminate idle
    // Service Workers after ~30s, so setTimeout does NOT guarantee exact delivery.
    scheduledAlarmTimeout = setTimeout(async () => {
      if (activeSessionId !== sessionId) return;
      scheduledAlarmTimeout = null;
      activeSessionId = null;

      if (!canShowNotification()) return;

      try {
        await self.registration.showNotification(title, {
          body,
          icon: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
          badge: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png',
          tag: ALARM_NOTIFICATION_TAG,
          requireInteraction: true,
          vibrate: [600, 300, 600, 300, 600, 300, 600],
          renotify: true,
        });
      } catch {
        // Ignore notification errors if permission was revoked
      }
    }, delay);
  } else if (event.data.type === 'CANCEL_ALARM') {
    clearScheduledAlarm();
    event.waitUntil(clearTimerNotifications());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'TIMER_NOTIFICATION_CLICKED' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
