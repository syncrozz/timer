import { TimerSession, TimerState } from '../types';

export const SESSION_STORAGE_KEY = 'pemasa_timer_session';

// Legacy storage keys from earlier versions (migrated and cleaned up automatically)
export const LEGACY_END_TIME_KEY = 'pemasa_target_end_time';
export const LEGACY_TIMER_STATE_KEY = 'pemasa_timer_state';
export const LEGACY_TOTAL_DURATION_KEY = 'pemasa_total_duration';

function getSafeStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function generateSessionId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `timer-${now}-${rand}`;
}

export function createIdleSession(durationSeconds: number, now = Date.now()): TimerSession {
  const safeDuration = Math.max(1, Math.floor(durationSeconds));
  return {
    sessionId: '',
    status: 'idle',
    durationSeconds: safeDuration,
    targetEndTime: null,
    pausedRemainingSeconds: null,
    alarmTriggered: false,
    alarmTriggeredAt: null,
    updatedAt: now,
  };
}

export function createRunningSession(
  durationSeconds: number,
  now = Date.now(),
  totalDurationSeconds?: number
): TimerSession {
  const safeRunSeconds = Math.max(1, Math.floor(durationSeconds));
  const safeTotal = Math.max(safeRunSeconds, Math.floor(totalDurationSeconds ?? safeRunSeconds));
  return {
    sessionId: generateSessionId(now),
    status: 'running',
    durationSeconds: safeTotal,
    targetEndTime: now + safeRunSeconds * 1000,
    pausedRemainingSeconds: null,
    alarmTriggered: false,
    alarmTriggeredAt: null,
    updatedAt: now,
  };
}

export function pauseRunningSession(
  session: TimerSession,
  now = Date.now()
): { session: TimerSession; expired: boolean } {
  if (session.status !== 'running' || session.targetEndTime === null) {
    return { session, expired: false };
  }

  const remainingMs = session.targetEndTime - now;
  if (remainingMs <= 0) {
    return { session, expired: true };
  }

  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return {
    expired: false,
    session: {
      ...session,
      status: 'paused',
      targetEndTime: null,
      pausedRemainingSeconds: remainingSeconds,
      updatedAt: now,
    },
  };
}

export function resumePausedSession(session: TimerSession, now = Date.now()): TimerSession {
  const remainingSeconds = Math.max(
    1,
    Math.floor(session.pausedRemainingSeconds ?? session.durationSeconds)
  );
  const safeDuration = Math.max(remainingSeconds, Math.floor(session.durationSeconds));

  return {
    sessionId: session.sessionId || generateSessionId(now),
    status: 'running',
    durationSeconds: safeDuration,
    targetEndTime: now + remainingSeconds * 1000,
    pausedRemainingSeconds: null,
    alarmTriggered: false,
    alarmTriggeredAt: null,
    updatedAt: now,
  };
}

export function calculateSessionRemaining(
  session: TimerSession,
  now = Date.now()
): { remainingMs: number; remainingSeconds: number; isExpired: boolean } {
  if (session.status === 'running' && session.targetEndTime !== null) {
    const remainingMs = session.targetEndTime - now;
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    return {
      remainingMs,
      remainingSeconds,
      isExpired: remainingMs <= 0,
    };
  }

  if (session.status === 'paused') {
    const secs = Math.max(0, Math.floor(session.pausedRemainingSeconds ?? session.durationSeconds));
    return {
      remainingMs: secs * 1000,
      remainingSeconds: secs,
      isExpired: false,
    };
  }

  if (session.status === 'finished') {
    return {
      remainingMs: 0,
      remainingSeconds: 0,
      isExpired: true,
    };
  }

  const secs = Math.max(0, Math.floor(session.durationSeconds));
  return {
    remainingMs: secs * 1000,
    remainingSeconds: secs,
    isExpired: false,
  };
}

/**
 * Atomic single-alarm guard: guarantees at most ONE alarm event per session.
 */
export function tryMarkAlarmTriggered(
  session: TimerSession,
  now = Date.now(),
  expectedSessionId?: string
): { shouldTrigger: boolean; session: TimerSession } {
  if (session.status !== 'running' || session.alarmTriggered) {
    return { shouldTrigger: false, session };
  }

  if (expectedSessionId && session.sessionId !== expectedSessionId) {
    return { shouldTrigger: false, session };
  }

  if (session.targetEndTime === null || now < session.targetEndTime) {
    return { shouldTrigger: false, session };
  }

  const nextSession: TimerSession = {
    ...session,
    status: 'finished',
    targetEndTime: null,
    pausedRemainingSeconds: 0,
    alarmTriggered: true,
    alarmTriggeredAt: now,
    updatedAt: now,
  };

  return { shouldTrigger: true, session: nextSession };
}

export function clearLegacyKeys(storage?: Storage): void {
  const s = getSafeStorage(storage);
  if (!s) return;
  try {
    s.removeItem(LEGACY_END_TIME_KEY);
    s.removeItem(LEGACY_TIMER_STATE_KEY);
    s.removeItem(LEGACY_TOTAL_DURATION_KEY);
  } catch {
    // Ignore storage quota/security errors
  }
}

export function persistSession(session: TimerSession, storage?: Storage): void {
  const s = getSafeStorage(storage);
  if (!s) return;
  try {
    if (session.status === 'idle') {
      s.removeItem(SESSION_STORAGE_KEY);
    } else {
      s.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    clearLegacyKeys(s);
  } catch {
    // Ignore storage errors
  }
}

export function clearPersistedSession(storage?: Storage): void {
  const s = getSafeStorage(storage);
  if (!s) return;
  try {
    s.removeItem(SESSION_STORAGE_KEY);
    clearLegacyKeys(s);
  } catch {
    // Ignore storage errors
  }
}

function isValidTimerState(val: unknown): val is TimerState {
  return val === 'idle' || val === 'running' || val === 'paused' || val === 'finished';
}

export function loadPersistedSession(
  defaultDurationSeconds: number,
  storage?: Storage,
  now = Date.now()
): TimerSession {
  const safeDefault = Math.max(1, Math.floor(defaultDurationSeconds));
  const s = getSafeStorage(storage);
  if (!s) return createIdleSession(safeDefault, now);

  try {
    const raw = s.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TimerSession>;
      if (parsed && isValidTimerState(parsed.status)) {
        const duration =
          typeof parsed.durationSeconds === 'number' &&
          Number.isFinite(parsed.durationSeconds) &&
          parsed.durationSeconds > 0
            ? Math.floor(parsed.durationSeconds)
            : safeDefault;

        if (parsed.status === 'idle') {
          clearPersistedSession(s);
          return createIdleSession(safeDefault, now);
        }

        if (parsed.status === 'running') {
          if (
            typeof parsed.targetEndTime === 'number' &&
            Number.isFinite(parsed.targetEndTime) &&
            parsed.targetEndTime > 0 &&
            !parsed.alarmTriggered
          ) {
            return {
              sessionId:
                typeof parsed.sessionId === 'string' && parsed.sessionId
                  ? parsed.sessionId
                  : generateSessionId(now),
              status: 'running',
              durationSeconds: duration,
              targetEndTime: parsed.targetEndTime,
              pausedRemainingSeconds: null,
              alarmTriggered: false,
              alarmTriggeredAt: null,
              updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now,
            };
          }
          // Corrupted running session without valid targetEndTime -> clear stale state
          clearPersistedSession(s);
          return createIdleSession(safeDefault, now);
        }

        if (parsed.status === 'paused') {
          const pausedSecs =
            typeof parsed.pausedRemainingSeconds === 'number' &&
            Number.isFinite(parsed.pausedRemainingSeconds) &&
            parsed.pausedRemainingSeconds > 0
              ? Math.floor(parsed.pausedRemainingSeconds)
              : duration;
          return {
            sessionId:
              typeof parsed.sessionId === 'string' && parsed.sessionId
                ? parsed.sessionId
                : generateSessionId(now),
            status: 'paused',
            durationSeconds: duration,
            targetEndTime: null,
            pausedRemainingSeconds: pausedSecs,
            alarmTriggered: false,
            alarmTriggeredAt: null,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now,
          };
        }

        if (parsed.status === 'finished') {
          // Do not resurrect finished alarm if it was already marked triggered on a prior load;
          // keep UI consistent only if finished very recently without being cleared, or keep finished state cleanly.
          return {
            sessionId:
              typeof parsed.sessionId === 'string' && parsed.sessionId
                ? parsed.sessionId
                : generateSessionId(now),
            status: 'finished',
            durationSeconds: duration,
            targetEndTime: null,
            pausedRemainingSeconds: 0,
            alarmTriggered: true,
            alarmTriggeredAt:
              typeof parsed.alarmTriggeredAt === 'number' ? parsed.alarmTriggeredAt : now,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now,
          };
        }
      }

      clearPersistedSession(s);
      return createIdleSession(safeDefault, now);
    }

    // One-time migration from legacy keys if present
    const legacyState = s.getItem(LEGACY_TIMER_STATE_KEY);
    const legacyEndTime = s.getItem(LEGACY_END_TIME_KEY);
    const legacyTotal = s.getItem(LEGACY_TOTAL_DURATION_KEY);

    if (legacyState === 'running' && legacyEndTime) {
      const end = parseInt(legacyEndTime, 10);
      const total = legacyTotal ? parseInt(legacyTotal, 10) : safeDefault;
      if (Number.isFinite(end) && end > 0) {
        const migrated: TimerSession = {
          sessionId: generateSessionId(now),
          status: 'running',
          durationSeconds: Number.isFinite(total) && total > 0 ? total : safeDefault,
          targetEndTime: end,
          pausedRemainingSeconds: null,
          alarmTriggered: false,
          alarmTriggeredAt: null,
          updatedAt: now,
        };
        persistSession(migrated, s);
        return migrated;
      }
    }

    clearLegacyKeys(s);
  } catch {
    clearPersistedSession(s);
  }

  return createIdleSession(safeDefault, now);
}
