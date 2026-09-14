/**
 * Background Timer Service
 * Uses Web Worker with precision target-timestamp timeouts to prevent browser
 * throttling when the tab is backgrounded or when phone screen dims.
 */

class BackgroundTimerService {
  private worker: Worker | null = null;
  private onTickCallback: (() => void) | null = null;
  private onExpiredCallback: (() => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      const workerCode = `
        let timerId = null;
        let timeoutId = null;
        let targetEndTime = null;

        self.onmessage = function(e) {
          if (e.data && e.data.type === 'START') {
            if (timerId) clearInterval(timerId);
            if (timeoutId) clearTimeout(timeoutId);

            targetEndTime = e.data.targetEndTime || null;

            // Periodic tick every 200ms
            timerId = setInterval(function() {
              const now = Date.now();
              if (targetEndTime && now >= targetEndTime) {
                self.postMessage({ type: 'EXPIRED' });
              } else {
                self.postMessage({ type: 'TICK' });
              }
            }, 200);

            // Precision exact millisecond timeout
            if (targetEndTime) {
              const delay = Math.max(0, targetEndTime - Date.now());
              timeoutId = setTimeout(function() {
                self.postMessage({ type: 'EXPIRED' });
              }, delay);
            }
          } else if (e.data && e.data.type === 'STOP') {
            if (timerId) {
              clearInterval(timerId);
              timerId = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            targetEndTime = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (!e.data) return;
        if (e.data.type === 'EXPIRED') {
          if (this.onExpiredCallback) {
            this.onExpiredCallback();
          } else if (this.onTickCallback) {
            this.onTickCallback();
          }
        } else if (e.data.type === 'TICK' && this.onTickCallback) {
          this.onTickCallback();
        }
      };
    } catch (e) {
      console.warn('Web Worker initialization fallback to window timer:', e);
      this.worker = null;
    }
  }

  public start(onTick: () => void, targetEndTime?: number, onExpired?: () => void) {
    this.onTickCallback = onTick;
    this.onExpiredCallback = onExpired || null;
    if (this.worker) {
      this.worker.postMessage({ type: 'START', targetEndTime });
    }
  }

  public stop() {
    this.onTickCallback = null;
    this.onExpiredCallback = null;
    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
    }
  }
}

export const backgroundTimer = new BackgroundTimerService();

/**
 * Schedule background notification via Service Worker
 */
export function scheduleServiceWorkerAlarm(endTime: number, title?: string, body?: string) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_ALARM',
        endTime,
        title: title || 'One Tap Timer',
        body: body || '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
      });
    }
  } catch (err) {
    console.warn('Could not schedule service worker alarm:', err);
  }
}

/**
 * Cancel scheduled alarm notification in Service Worker
 */
export function cancelServiceWorkerAlarm() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CANCEL_ALARM',
      });
    }
  } catch (err) {
    console.warn('Could not cancel service worker alarm:', err);
  }
}

/**
 * Notification helpers for timer alerts when running in background
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return false;
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function sendTimerNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    const iconUrl = 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png';
    const badgeUrl = 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png';

    const options: NotificationOptions = {
      body,
      icon: iconUrl,
      badge: badgeUrl,
      tag: 'one-tap-timer-finished',
      requireInteraction: true,
      silent: false,
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          ...options,
          vibrate: [600, 300, 600, 300, 600, 300, 600] as unknown as number[],
          renotify: true,
        } as NotificationOptions);
      }).catch(() => {
        new Notification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}
