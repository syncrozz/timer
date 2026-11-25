/**
 * Background Timer & Notification Service
 *
 * Uses a Web Worker for off-main-thread timestamp checks while the browser process
 * is alive, plus best-effort Service Worker / Web Notification fallbacks.
 * Note: Mobile browsers (Android Chrome / WebView / iOS) may still suspend or
 * terminate background tabs and idle Service Workers when the screen locks.
 */

class BackgroundTimerService {
  private worker: Worker | null = null;
  private onTickCallback: (() => void) | null = null;
  private onExpiredCallback: (() => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      this.worker = null;
      return;
    }
    try {
      const workerCode = `
        let timerId = null;
        let timeoutId = null;
        let targetEndTime = null;
        let hasFiredExpired = false;

        function clearTimers() {
          if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
          }
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }

        function fireExpired() {
          if (hasFiredExpired) return;
          hasFiredExpired = true;
          clearTimers();
          targetEndTime = null;
          self.postMessage({ type: 'EXPIRED' });
        }

        self.onmessage = function(e) {
          if (!e.data) return;

          if (e.data.type === 'START') {
            clearTimers();
            hasFiredExpired = false;
            targetEndTime = e.data.targetEndTime || null;

            if (targetEndTime && Date.now() >= targetEndTime) {
              fireExpired();
              return;
            }

            // Periodic tick every 250ms based on wall-clock targetEndTime
            timerId = setInterval(function() {
              const now = Date.now();
              if (targetEndTime && now >= targetEndTime) {
                fireExpired();
              } else {
                self.postMessage({ type: 'TICK' });
              }
            }, 250);

            // Precision timeout aligned to targetEndTime
            if (targetEndTime) {
              const delay = Math.max(0, targetEndTime - Date.now());
              timeoutId = setTimeout(fireExpired, delay);
            }
          } else if (e.data.type === 'STOP') {
            clearTimers();
            targetEndTime = null;
            hasFiredExpired = false;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (!e.data) return;
        if (e.data.type === 'EXPIRED') {
          const expiredCb = this.onExpiredCallback;
          this.onExpiredCallback = null;
          if (expiredCb) {
            expiredCb();
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

async function postMessageToServiceWorker(message: Record<string, unknown>): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(message);
  } catch (err) {
    console.warn('Service Worker messaging note:', err);
  }
}

/**
 * Best-effort supplementary notification scheduling in Service Worker.
 * Note: Service Worker setTimeout is NOT guaranteed by Android/mobile OSes when
 * the Service Worker process is terminated in the background.
 */
export function scheduleServiceWorkerAlarm(
  endTime: number,
  title?: string,
  body?: string,
  sessionId?: string
) {
  if (!isNotificationSupported() || getNotificationPermissionStatus() !== 'granted') {
    return;
  }
  postMessageToServiceWorker({
    type: 'SCHEDULE_ALARM',
    endTime,
    sessionId: sessionId || null,
    title: title || 'One Tap Timer',
    body: body || '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
  });
}

/**
 * Cancels any pending Service Worker notification fallback and clears stale notifications.
 */
export function cancelServiceWorkerAlarm() {
  postMessageToServiceWorker({
    type: 'CANCEL_ALARM',
  });
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

export function sendTimerNotification(title: string, body: string): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const iconUrl =
      'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png';
    const badgeUrl =
      'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/favicon-96x96.png';

    const options: NotificationOptions = {
      body,
      icon: iconUrl,
      badge: badgeUrl,
      tag: 'one-tap-timer-finished',
      requireInteraction: true,
      silent: false,
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((registration) => {
          return registration.showNotification(title, {
            ...options,
            vibrate: [600, 300, 600, 300, 600, 300, 600] as unknown as number[],
            renotify: true,
          } as NotificationOptions);
        })
        .catch(() => {
          try {
            new Notification(title, options);
          } catch {}
        });
    } else {
      new Notification(title, options);
    }
    return true;
  } catch (err) {
    console.warn('Notification trigger error:', err);
    return false;
  }
}
