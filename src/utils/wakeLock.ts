import NoSleep from 'nosleep.js';

class ScreenWakeManager {
  private noSleep: NoSleep | null = null;
  private isKeepingAwake = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.noSleep = new NoSleep();
      } catch (err) {
        console.warn('NoSleep initialization note:', err);
      }

      document.addEventListener('visibilitychange', () => {
        if (this.isKeepingAwake && document.visibilityState === 'visible' && this.noSleep) {
          this.activate();
        }
      });
    }
  }

  /**
   * Must be called during user interaction (tap/click) to enable wake lock
   * and start the looping video playback on mobile devices.
   */
  public activate() {
    this.isKeepingAwake = true;
    if (this.noSleep) {
      try {
        this.noSleep.enable().catch((err: unknown) => {
          console.warn('NoSleep enable error:', err);
        });
      } catch (e) {
        console.warn('NoSleep call error:', e);
      }
    }
  }

  /**
   * Release wake lock when timer is idle, paused, or finished
   */
  public release() {
    this.isKeepingAwake = false;
    if (this.noSleep) {
      try {
        this.noSleep.disable();
      } catch (err) {
        console.warn('NoSleep disable error:', err);
      }
    }
  }
}

export const screenWakeManager = new ScreenWakeManager();
