import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { AppSettings, TimerSession, TimerState } from './types';
import { BUILT_IN_RINGTONES, soundEngine } from './utils/sound';
import {
  backgroundTimer,
  requestNotificationPermission,
  sendTimerNotification,
  scheduleServiceWorkerAlarm,
  cancelServiceWorkerAlarm,
} from './utils/backgroundTimer';
import {
  calculateSessionRemaining,
  clearPersistedSession,
  createIdleSession,
  createRunningSession,
  loadPersistedSession,
  pauseRunningSession,
  persistSession,
  resumePausedSession,
  tryMarkAlarmTriggered,
} from './utils/timerSession';
import { TimerDisplay } from './components/TimerDisplay';
import { PresetsBar } from './components/PresetsBar';
import { SettingsModal } from './components/SettingsModal';
import { AlarmScreen } from './components/AlarmScreen';
import { SupportPage } from './components/SupportPage';
import { screenWakeManager } from './utils/wakeLock';

const DEFAULT_SETTINGS: AppSettings = {
  defaultMinutes: 5,
  defaultSeconds: 0,
  ringtoneId: 'digital',
  volume: 0.8,
  vibrate: true,
  keepScreenAwake: true,
  backgroundTimer: true,
  backgroundNotifications: true,
  theme: 'dark',
  autoRestart: false,
};

const STORAGE_KEY = 'pemasa_1tap_settings';

function formatCountdownTitle(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  const defaultTotalSeconds = Math.max(1, settings.defaultMinutes * 60 + settings.defaultSeconds);

  // Authoritative session initialized synchronously from persisted storage
  const initialSessionRef = useRef<TimerSession | null>(null);
  if (initialSessionRef.current === null) {
    initialSessionRef.current = loadPersistedSession(defaultTotalSeconds);
  }
  const sessionRef = useRef<TimerSession>(initialSessionRef.current);

  const initialRemaining = calculateSessionRemaining(sessionRef.current, Date.now());

  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(
    sessionRef.current.status === 'idle' ? defaultTotalSeconds : sessionRef.current.durationSeconds
  );
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(initialRemaining.remainingSeconds);
  const [timerState, setTimerState] = useState<TimerState>(sessionRef.current.status);
  const [alarmStartedAt, setAlarmStartedAt] = useState<number | null>(
    sessionRef.current.alarmTriggeredAt
  );
  const [showSettings, setShowSettings] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.hash === '#support';
  });

  // Preload selected ringtone whenever settings change or on mount
  useEffect(() => {
    soundEngine.preloadRingtone(settings.ringtoneId, settings.customRingtoneDataUrl);
  }, [settings.ringtoneId, settings.customRingtoneDataUrl]);

  // Keep browser tab title synchronized with countdown
  useEffect(() => {
    if (timerState === 'running') {
      document.title = `${formatCountdownTitle(timeLeftSeconds)} - One Tap Timer`;
    } else if (timerState === 'finished') {
      document.title = '⏰ Masa Tamat! - One Tap Timer';
    } else if (timerState === 'paused') {
      document.title = '⏸️ Dijeda - One Tap Timer';
    } else {
      document.title = 'One Tap Timer';
    }
  }, [timerState, timeLeftSeconds]);

  useEffect(() => {
    const handleHashChange = () => {
      setIsSupportOpen(window.location.hash === '#support');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleNavigateToSupport = () => {
    window.location.hash = 'support';
    setIsSupportOpen(true);
  };

  const handleReturnFromSupport = () => {
    if (window.location.hash === '#support') {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setIsSupportOpen(false);
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    settingsRef.current = newSettings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }

    if (sessionRef.current.status === 'idle') {
      const newTotal = Math.max(1, newSettings.defaultMinutes * 60 + newSettings.defaultSeconds);
      const idle = createIdleSession(newTotal);
      sessionRef.current = idle;
      setTotalDurationSeconds(newTotal);
      setTimeLeftSeconds(newTotal);
    }
  };

  /**
   * Single authoritative alarm trigger protected by `tryMarkAlarmTriggered`.
   * Guarantees at most ONE alarm playback + notification per timer session.
   */
  const triggerAlarm = useCallback((expectedSessionId?: string) => {
    const now = Date.now();
    const { shouldTrigger, session: nextSession } = tryMarkAlarmTriggered(
      sessionRef.current,
      now,
      expectedSessionId
    );

    if (!shouldTrigger) {
      return;
    }

    sessionRef.current = nextSession;
    persistSession(nextSession);

    backgroundTimer.stop();
    screenWakeManager.release();
    cancelServiceWorkerAlarm();

    setTimeLeftSeconds(0);
    setAlarmStartedAt(nextSession.alarmTriggeredAt ?? now);
    setTimerState('finished');

    const activeSettings = settingsRef.current;
    soundEngine.playAlarm(
      activeSettings.ringtoneId,
      activeSettings.customRingtoneDataUrl,
      activeSettings.volume,
      { vibrate: activeSettings.vibrate }
    );

    if (activeSettings.backgroundNotifications) {
      sendTimerNotification('One Tap Timer', '⏰ Masa telah tamat! Jam penggera sedang berbunyi.');
    }
  }, []);

  const clearToIdle = useCallback((resetDurationSeconds: number) => {
    soundEngine.stop();
    backgroundTimer.stop();
    screenWakeManager.release();
    cancelServiceWorkerAlarm();

    const idle = createIdleSession(resetDurationSeconds);
    sessionRef.current = idle;
    clearPersistedSession();

    setAlarmStartedAt(null);
    setTimerState('idle');
    setTimeLeftSeconds(idle.durationSeconds);
  }, []);

  const handleStopAlarm = useCallback(() => {
    clearToIdle(totalDurationSeconds);
  }, [clearToIdle, totalDurationSeconds]);

  // Connect MediaSession lockscreen controls to handleStopAlarm
  useEffect(() => {
    soundEngine.setStopHandler(handleStopAlarm);
    return () => {
      soundEngine.setStopHandler(null);
    };
  }, [handleStopAlarm]);

  const startSessionWithDuration = useCallback(
    (runSeconds: number, totalSecondsForProgress: number, existingPausedSession?: TimerSession) => {
      const activeSettings = settingsRef.current;
      soundEngine.unlockAudio();
      soundEngine.preloadRingtone(activeSettings.ringtoneId, activeSettings.customRingtoneDataUrl);

      if (activeSettings.keepScreenAwake) {
        screenWakeManager.activate();
      }
      if (activeSettings.backgroundNotifications) {
        requestNotificationPermission().catch(() => {});
      }

      const now = Date.now();
      const nextSession = existingPausedSession
        ? resumePausedSession(existingPausedSession, now)
        : createRunningSession(runSeconds, now, totalSecondsForProgress);

      sessionRef.current = nextSession;
      persistSession(nextSession);

      const { remainingSeconds } = calculateSessionRemaining(nextSession, now);
      setTotalDurationSeconds(nextSession.durationSeconds);
      setTimeLeftSeconds(remainingSeconds);
      setAlarmStartedAt(null);

      if (nextSession.targetEndTime !== null) {
        soundEngine.armTimer(
          activeSettings.ringtoneId,
          activeSettings.customRingtoneDataUrl,
          activeSettings.volume,
          nextSession.targetEndTime,
          () => triggerAlarm(nextSession.sessionId)
        );

        if (activeSettings.backgroundNotifications) {
          scheduleServiceWorkerAlarm(
            nextSession.targetEndTime,
            'One Tap Timer',
            '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
            nextSession.sessionId
          );
        }
      }

      setTimerState('running');
    },
    [triggerAlarm]
  );

  const pauseTimer = useCallback(() => {
    const now = Date.now();
    const { session: pausedSession, expired } = pauseRunningSession(sessionRef.current, now);
    if (expired) {
      triggerAlarm(sessionRef.current.sessionId);
      return;
    }

    soundEngine.disarmKeepAlive();
    backgroundTimer.stop();
    screenWakeManager.release();
    cancelServiceWorkerAlarm();

    sessionRef.current = pausedSession;
    persistSession(pausedSession);

    const { remainingSeconds } = calculateSessionRemaining(pausedSession, now);
    setTimeLeftSeconds(remainingSeconds);
    setTimerState('paused');
  }, [triggerAlarm]);

  /**
   * Authoritative timestamp reconciliation: reads `sessionRef.current`,
   * recalculates remaining time via `Date.now()`, updates UI immediately,
   * and triggers alarm once if `targetEndTime` has passed.
   */
  const reconcileTimer = useCallback(() => {
    const current = sessionRef.current;
    if (current.status !== 'running' || current.targetEndTime === null) {
      return;
    }

    const now = Date.now();
    const { remainingMs, remainingSeconds, isExpired } = calculateSessionRemaining(current, now);

    setTimeLeftSeconds(remainingSeconds);
    soundEngine.updateMediaSessionRunning(formatCountdownTitle(remainingSeconds));

    if (isExpired || remainingMs <= 0) {
      triggerAlarm(current.sessionId);
    }
  }, [triggerAlarm]);

  // One-time startup recovery for a running timer restored from localStorage
  useEffect(() => {
    const restored = sessionRef.current;
    if (restored.status !== 'running' || restored.targetEndTime === null) {
      return;
    }

    const activeSettings = settingsRef.current;
    const { isExpired } = calculateSessionRemaining(restored, Date.now());
    if (isExpired) {
      triggerAlarm(restored.sessionId);
      return;
    }

    if (activeSettings.keepScreenAwake) {
      screenWakeManager.activate();
    }

    soundEngine.armTimer(
      activeSettings.ringtoneId,
      activeSettings.customRingtoneDataUrl,
      activeSettings.volume,
      restored.targetEndTime,
      () => triggerAlarm(restored.sessionId)
    );

    if (activeSettings.backgroundNotifications) {
      scheduleServiceWorkerAlarm(
        restored.targetEndTime,
        'One Tap Timer',
        '⏰ Masa telah tamat! Jam penggera sedang berbunyi.',
        restored.sessionId
      );
    }
  }, [triggerAlarm]);

  // Countdown tick engine (Web Worker + timestamp-based main-thread reconciliation)
  useEffect(() => {
    if (timerState !== 'running' || sessionRef.current.targetEndTime === null) {
      backgroundTimer.stop();
      return;
    }

    const activeSessionId = sessionRef.current.sessionId;
    const targetEndTime = sessionRef.current.targetEndTime;

    if (settings.keepScreenAwake) {
      screenWakeManager.activate();
    }

    reconcileTimer();

    backgroundTimer.start(reconcileTimer, targetEndTime, () => triggerAlarm(activeSessionId));
    const fallbackInterval = window.setInterval(reconcileTimer, 200);

    return () => {
      backgroundTimer.stop();
      clearInterval(fallbackInterval);
    };
  }, [timerState, settings.keepScreenAwake, reconcileTimer, triggerAlarm]);

  // Comprehensive Lifecycle Recovery: visibilitychange, pageshow, pagehide, focus, resume, freeze
  useEffect(() => {
    const handleBecomeActive = () => {
      reconcileTimer();

      const current = sessionRef.current;
      if (current.status === 'running') {
        if (settingsRef.current.keepScreenAwake) {
          screenWakeManager.reacquireIfVisible();
        }
        soundEngine.resumeAudioIfNeeded();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleBecomeActive();
      } else {
        const current = sessionRef.current;
        if (current.status === 'running') {
          if (!settingsRef.current.backgroundTimer) {
            pauseTimer();
          } else {
            persistSession(current);
          }
        }
      }
    };

    const handleBecomeInactive = () => {
      const current = sessionRef.current;
      if (current.status === 'running') {
        persistSession(current);
      }
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TIMER_NOTIFICATION_CLICKED') {
        handleBecomeActive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('resume', handleBecomeActive);
    document.addEventListener('freeze', handleBecomeInactive);
    window.addEventListener('pageshow', handleBecomeActive);
    window.addEventListener('pagehide', handleBecomeInactive);
    window.addEventListener('focus', handleBecomeActive);

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('resume', handleBecomeActive);
      document.removeEventListener('freeze', handleBecomeInactive);
      window.removeEventListener('pageshow', handleBecomeActive);
      window.removeEventListener('pagehide', handleBecomeInactive);
      window.removeEventListener('focus', handleBecomeActive);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [pauseTimer, reconcileTimer]);

  const handleMainTap = () => {
    soundEngine.unlockAudio();
    if (settings.vibrate) {
      soundEngine.vibrate(30);
    }

    const current = sessionRef.current;
    if (current.status === 'idle') {
      startSessionWithDuration(totalDurationSeconds, totalDurationSeconds);
    } else if (current.status === 'running') {
      pauseTimer();
    } else if (current.status === 'paused') {
      const resumeSeconds = current.pausedRemainingSeconds ?? timeLeftSeconds;
      startSessionWithDuration(resumeSeconds, current.durationSeconds, current);
    } else if (current.status === 'finished') {
      handleStopAlarm();
    }
  };

  const handleReset = () => {
    clearToIdle(totalDurationSeconds);
  };

  const handleRestartTimer = () => {
    soundEngine.stop();
    backgroundTimer.stop();
    screenWakeManager.release();
    cancelServiceWorkerAlarm();
    startSessionWithDuration(totalDurationSeconds, totalDurationSeconds);
  };

  const handleSelectPreset = (mins: number, secs: number) => {
    if (sessionRef.current.status !== 'idle') return;
    const newTotal = Math.max(1, mins * 60 + secs);
    const idle = createIdleSession(newTotal);
    sessionRef.current = idle;
    setTotalDurationSeconds(newTotal);
    setTimeLeftSeconds(newTotal);
  };

  const getRingtoneDisplayName = () => {
    if (settings.ringtoneId === 'custom') {
      return settings.customRingtoneName || 'Custom Audio';
    }
    const found = BUILT_IN_RINGTONES.find((r) => r.id === settings.ringtoneId);
    return found ? found.name : BUILT_IN_RINGTONES[0].name;
  };

  if (isSupportOpen) {
    return <SupportPage onReturn={handleReturnFromSupport} appName="One Tap Timer" />;
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Ambient Glass Lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] bg-indigo-600/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[35%] h-[35%] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-lg mx-auto px-6 pt-6 pb-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/15 overflow-hidden shadow-xl flex items-center justify-center p-0.5">
            <img
              src="https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png"
              alt="One Tap Timer"
              className="w-full h-full object-contain rounded-xl"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            One Tap Timer
          </h1>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          id="open-settings-btn"
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/15 backdrop-blur-md active:scale-95 text-white/90 border border-white/10 shadow-xl transition-all cursor-pointer"
        >
          <SettingsIcon className="w-4 h-4 text-indigo-300" />
          <span className="text-xs font-semibold">Settings</span>
        </button>
      </header>

      {/* Main Focus Canvas */}
      <main className="w-full max-w-lg mx-auto flex-1 flex flex-col items-center justify-center py-4 z-10">
        <TimerDisplay
          timeLeftSeconds={timeLeftSeconds}
          totalDurationSeconds={totalDurationSeconds}
          timerState={timerState}
          onMainTap={handleMainTap}
          onReset={handleReset}
          ringtoneName={getRingtoneDisplayName()}
        />

        <PresetsBar
          currentMinutes={Math.floor(totalDurationSeconds / 60)}
          currentSeconds={totalDurationSeconds % 60}
          onSelectPreset={handleSelectPreset}
          disabled={timerState !== 'idle'}
        />
      </main>

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3.5 text-center sm:text-left z-10">
        {/* Footer Left — Developer Credit */}
        <div className="flex items-center gap-1.5 text-xs text-white/50 font-normal">
          <span>Developed by</span>
          <a
            href="https://www.syncrozz.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/80 hover:text-indigo-300 font-semibold no-underline transition-colors cursor-pointer"
          >
            Syncrozz
          </a>
          <a
            href="https://wa.me/60145313756"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp Syncrozz"
            className="inline-flex items-center justify-center opacity-85 hover:opacity-100 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ml-0.5"
          >
            <img
              src="https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/MAIN/Logo%20Whatapp%20v2.png"
              alt="WhatsApp"
              className="w-5 h-5 object-contain"
              referrerPolicy="no-referrer"
            />
          </a>
        </div>

        {/* Minimal & Understated Support CTA */}
        <a
          href="https://syncrozz.com/#support"
          onClick={(e) => {
            e.preventDefault();
            handleNavigateToSupport();
          }}
          id="footer-support-cta-btn"
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-white/50 hover:text-white/80 text-[11px] font-normal border border-white/5 hover:border-white/15 backdrop-blur-sm transition-all cursor-pointer group"
        >
          <span>Sokong Inovasi Ini ❤️</span>
        </a>
      </footer>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {timerState === 'finished' && (
        <AlarmScreen
          onStopAlarm={handleStopAlarm}
          onRestartTimer={handleRestartTimer}
          ringtoneName={getRingtoneDisplayName()}
          defaultMinutes={settings.defaultMinutes}
          alarmStartedAt={alarmStartedAt}
        />
      )}
    </div>
  );
}
