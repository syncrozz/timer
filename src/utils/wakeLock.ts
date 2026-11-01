/**
 * Screen Wake Lock Manager
 * Ensures mobile devices keep the display awake during active countdowns
 * using both the W3C Screen Wake Lock API and a background video fallback (NoSleep pattern).
 */

class ScreenWakeManager {
  private wakeLock: WakeLockSentinel | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private isKeepingAwake = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (this.isKeepingAwake && document.visibilityState === 'visible') {
          this.acquireWakeLock();
        }
      });
    }
  }

  private async acquireWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!this.wakeLock || this.wakeLock.released) {
          this.wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            if (this.isKeepingAwake && document.visibilityState === 'visible') {
              this.acquireWakeLock().catch(() => {});
            }
          });
        }
      } catch (err) {
        console.warn('Screen WakeLock error:', err);
      }
    }
  }

  private startVideoFallback() {
    if (typeof document === 'undefined') return;
    try {
      if (!this.videoEl) {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.muted = true;
        video.loop = true;
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0.001';
        video.style.pointerEvents = 'none';

        // Tiny valid 1-frame MP4 video loop to prevent iOS/Android screen dimming
        video.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21tcDQyAAAACHBhc3MAAAACbW9vdgAAAGxtdmhkAAAAAMK2mQvCtpkLAAAD6AAABD0AAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAHhtZGF0';
        document.body.appendChild(video);
        this.videoEl = video;
      }
      const p = this.videoEl.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    } catch (err) {
      console.warn('Video keep-alive note:', err);
    }
  }

  /**
   * Request wake lock synchronously during user interaction (tap/click)
   */
  public activate() {
    this.isKeepingAwake = true;
    this.acquireWakeLock();
    this.startVideoFallback();
  }

  /**
   * Release wake lock when timer is stopped, paused, or finished
   */
  public release() {
    this.isKeepingAwake = false;
    if (this.wakeLock) {
      try {
        this.wakeLock.release().catch(() => {});
      } catch {}
      this.wakeLock = null;
    }
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {}
    }
  }
}

export const screenWakeManager = new ScreenWakeManager();
