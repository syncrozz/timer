import NoSleep from 'nosleep.js';
import { WakeLockMode } from '../types';

export interface WakeLockStateSnapshot {
  isKeepingAwake: boolean;
  mode: WakeLockMode;
  nativeSupported: boolean;
  hasActiveNativeSentinel: boolean;
  lastError: string | null;
}

class ScreenWakeManager {
  private noSleep: NoSleep | null = null;
  private nativeSentinel: WakeLockSentinel | null = null;
  private isKeepingAwake = false;
  private mode: WakeLockMode = 'inactive';
  private lastError: string | null = null;
  private activatePromise: Promise<WakeLockMode> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.noSleep = new NoSleep();
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  public isNativeSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof navigator.wakeLock?.request === 'function'
    );
  }

  public getState(): WakeLockStateSnapshot {
    return {
      isKeepingAwake: this.isKeepingAwake,
      mode: this.mode,
      nativeSupported: this.isNativeSupported(),
      hasActiveNativeSentinel: Boolean(this.nativeSentinel && !this.nativeSentinel.released),
      lastError: this.lastError,
    };
  }

  /**
   * Activates Screen Wake Lock (prefers native Wake Lock API, falls back to NoSleep).
   * Safe against unsupported browsers and rejected wake lock requests.
   */
  public async activate(): Promise<WakeLockMode> {
    this.isKeepingAwake = true;
    this.lastError = null;

    if (this.activatePromise) {
      return this.activatePromise;
    }

    this.activatePromise = this.performActivate().finally(() => {
      this.activatePromise = null;
    });

    return this.activatePromise;
  }

  private async performActivate(): Promise<WakeLockMode> {
    if (!this.isKeepingAwake) {
      return 'inactive';
    }

    // Native Wake Lock API requires the document to be visible
    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';

    if (this.isNativeSupported() && isVisible) {
      if (this.nativeSentinel && !this.nativeSentinel.released) {
        this.mode = 'native';
        return 'native';
      }

      try {
        const sentinel = await navigator.wakeLock.request('screen');
        // Check if release() was called while awaiting request()
        if (!this.isKeepingAwake) {
          await sentinel.release().catch(() => {});
          this.mode = 'inactive';
          return 'inactive';
        }

        this.nativeSentinel = sentinel;
        this.mode = 'native';
        this.lastError = null;

        sentinel.addEventListener('release', () => {
          if (this.nativeSentinel === sentinel) {
            this.nativeSentinel = null;
            if (!this.isKeepingAwake) {
              this.mode = 'inactive';
            }
          }
        });

        // Disable NoSleep if native wake lock succeeded so we don't hold duplicate locks
        this.disableNoSleepQuietly();
        return 'native';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = `Native Wake Lock rejected: ${message}`;
        this.nativeSentinel = null;
      }
    } else if (!this.isNativeSupported()) {
      this.lastError = 'Native Screen Wake Lock API unsupported in this environment';
    }

    // Fallback to NoSleep
    if (this.noSleep && this.isKeepingAwake) {
      try {
        await this.noSleep.enable();
        if (!this.isKeepingAwake) {
          this.disableNoSleepQuietly();
          this.mode = 'inactive';
          return 'inactive';
        }
        this.mode = 'nosleep';
        return 'nosleep';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = this.lastError
          ? `${this.lastError}; NoSleep fallback failed: ${message}`
          : `NoSleep fallback failed: ${message}`;
        this.mode = 'error';
        return 'error';
      }
    }

    this.mode = this.isNativeSupported() ? 'error' : 'unsupported';
    return this.mode;
  }

  /**
   * Reacquires wake lock when application becomes visible again while timer is active.
   */
  public async reacquireIfVisible(): Promise<WakeLockMode> {
    if (!this.isKeepingAwake) {
      return 'inactive';
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return this.mode;
    }
    if (this.nativeSentinel && !this.nativeSentinel.released) {
      this.mode = 'native';
      return 'native';
    }
    return this.activate();
  }

  private disableNoSleepQuietly() {
    if (this.noSleep) {
      try {
        this.noSleep.disable();
      } catch {
        // Ignore NoSleep disable errors
      }
    }
  }

  /**
   * Release wake lock when timer is idle, paused, reset, or finished.
   */
  public async release(): Promise<void> {
    this.isKeepingAwake = false;
    this.mode = 'inactive';

    if (this.nativeSentinel) {
      const sentinel = this.nativeSentinel;
      this.nativeSentinel = null;
      try {
        if (!sentinel.released) {
          await sentinel.release();
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }

    this.disableNoSleepQuietly();
  }
}

export const screenWakeManager = new ScreenWakeManager();
