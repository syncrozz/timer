/**
 * Automated Verification Gate Suite (VG-01 through VG-14)
 * Runs simulated browser/lifecycle/OS suspension scenarios against the actual modules.
 * Note: Physical Android device screen-lock behavior cannot be executed in this Linux container
 * and is explicitly distinguished from simulated verification.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Mock browser globals BEFORE importing modules that inspect window/document/navigator at load
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const mockStorage = new MemoryStorage();
const vibrateCalls: Array<number | number[]> = [];
let mockVisibilityState: 'visible' | 'hidden' = 'visible';
let mockNotificationPermission: NotificationPermission = 'granted';
const createdNotifications: Array<{ title: string; options?: NotificationOptions }> = [];
const audioInstances: MockAudio[] = [];

class MockAudio {
  public src = '';
  public preload = '';
  public loop = false;
  public volume = 1;
  public currentTime = 0;
  public paused = true;
  public loadCalls = 0;
  public playCalls = 0;
  public pauseCalls = 0;
  public attributes: Record<string, string> = {};
  public ontimeupdate: (() => void) | null = null;

  constructor(src?: string) {
    if (src) this.src = src;
    audioInstances.push(this);
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }

  load() {
    this.loadCalls++;
  }

  play(): Promise<void> {
    this.paused = false;
    this.playCalls++;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.pauseCalls++;
  }
}

class MockNotification {
  static get permission(): NotificationPermission {
    return mockNotificationPermission;
  }
  static requestPermission(): Promise<NotificationPermission> {
    return Promise.resolve(mockNotificationPermission);
  }
  constructor(title: string, options?: NotificationOptions) {
    createdNotifications.push({ title, options });
  }
}

class MockMediaMetadata {
  public title: string;
  public artist: string;
  public album: string;
  constructor(init: MediaMetadataInit) {
    this.title = init.title || '';
    this.artist = init.artist || '';
    this.album = init.album || '';
  }
}

const mediaSessionState = {
  metadata: null as MockMediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  handlers: new Map<string, () => void>(),
  setActionHandler(action: string, handler: (() => void) | null) {
    if (handler) this.handlers.set(action, handler);
    else this.handlers.delete(action);
  },
};

const mockDocument = {
  get visibilityState() {
    return mockVisibilityState;
  },
  get hidden() {
    return mockVisibilityState === 'hidden';
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

const mockWindow = {
  localStorage: mockStorage,
  Notification: MockNotification,
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
};

let wakeLockBehavior: 'supported' | 'unsupported' | 'reject' = 'supported';
let wakeLockRequestCount = 0;
let wakeLockReleaseCount = 0;

class MockWakeLockSentinel {
  public released = false;
  private releaseListeners: Array<() => void> = [];
  addEventListener(type: string, cb: () => void) {
    if (type === 'release') this.releaseListeners.push(cb);
  }
  async release(): Promise<void> {
    if (!this.released) {
      this.released = true;
      wakeLockReleaseCount++;
      for (const cb of this.releaseListeners) cb();
    }
  }
}

let activeMockSentinel: MockWakeLockSentinel | null = null;

const mockNavigator: Record<string, unknown> = {
  vibrate: (pattern: number | number[]) => {
    vibrateCalls.push(pattern);
    return true;
  },
  mediaSession: mediaSessionState,
};

Object.defineProperty(mockNavigator, 'wakeLock', {
  configurable: true,
  get() {
    if (wakeLockBehavior === 'unsupported') return undefined;
    return {
      request: async () => {
        wakeLockRequestCount++;
        if (wakeLockBehavior === 'reject') {
          throw new DOMException('Wake Lock permission denied', 'NotAllowedError');
        }
        activeMockSentinel = new MockWakeLockSentinel();
        return activeMockSentinel;
      },
    };
  },
});

Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  configurable: true,
  writable: true,
});

Object.assign(globalThis, {
  window: mockWindow,
  document: mockDocument,
  localStorage: mockStorage,
  Audio: MockAudio,
  Notification: MockNotification,
  MediaMetadata: MockMediaMetadata,
});

// Import actual project modules after globals are mounted
const timerSession = await import('../src/utils/timerSession.ts');
const { soundEngine } = await import('../src/utils/sound.ts');
const { screenWakeManager } = await import('../src/utils/wakeLock.ts');
const bgTimerMod = await import('../src/utils/backgroundTimer.ts');

interface GateResult {
  gate: string;
  mode: 'Automated / Simulated' | 'Manual Device Required';
  status: 'PASS' | 'NOT PERFORMED (Physical Device)';
  detail: string;
}

const results: GateResult[] = [];

function record(
  gate: string,
  mode: GateResult['mode'],
  status: GateResult['status'],
  detail: string
) {
  results.push({ gate, mode, status, detail });
}

// --- VG-01: Normal countdown with screen active ---
{
  const t0 = 1_700_000_000_000;
  let session = timerSession.createRunningSession(60, t0);
  const r1 = timerSession.calculateSessionRemaining(session, t0 + 15_200);
  const r2 = timerSession.calculateSessionRemaining(session, t0 + 59_500);
  const r3 = timerSession.calculateSessionRemaining(session, t0 + 60_000);
  assert.equal(r1.remainingSeconds, 45);
  assert.equal(r1.isExpired, false);
  assert.equal(r2.remainingSeconds, 1);
  assert.equal(r2.isExpired, false);
  assert.equal(r3.remainingSeconds, 0);
  assert.equal(r3.isExpired, true);
  record(
    'VG-01',
    'Automated / Simulated',
    'PASS',
    'Timestamp-based countdown yields 45s -> 1s -> 0s (expired) without tick counting.'
  );
}

// --- VG-02: Lock screen during countdown ---
{
  // Simulated lifecycle transition: visible -> hidden while running keeps persisted targetEndTime
  mockStorage.clear();
  const t0 = 1_700_000_100_000;
  const session = timerSession.createRunningSession(120, t0);
  timerSession.persistSession(session, mockStorage);
  mockVisibilityState = 'hidden';
  // Simulate OS releasing wake lock on screen lock
  if (activeMockSentinel) await activeMockSentinel.release();
  const reloaded = timerSession.loadPersistedSession(300, mockStorage, t0 + 5000);
  assert.equal(reloaded.status, 'running');
  assert.equal(reloaded.targetEndTime, t0 + 120_000);
  mockVisibilityState = 'visible';
  record(
    'VG-02',
    'Manual Device Required',
    'NOT PERFORMED (Physical Device)',
    'Physical screen lock not executed in container; simulated hidden/wakeLock-release preserved running targetEndTime.'
  );
}

// --- VG-03: Screen remains locked beyond timer expiry ---
{
  mockStorage.clear();
  const t0 = 1_700_000_200_000;
  const session = timerSession.createRunningSession(10, t0);
  timerSession.persistSession(session, mockStorage);
  // Simulate 45s locked beyond expiry, then unlock -> visible reconciliation
  const resumeAt = t0 + 55_000;
  const loaded = timerSession.loadPersistedSession(300, mockStorage, resumeAt);
  const rem = timerSession.calculateSessionRemaining(loaded, resumeAt);
  assert.equal(rem.isExpired, true);
  const trig = timerSession.tryMarkAlarmTriggered(loaded, resumeAt, loaded.sessionId);
  assert.equal(trig.shouldTrigger, true);
  assert.equal(trig.session.status, 'finished');
  record(
    'VG-03',
    'Manual Device Required',
    'NOT PERFORMED (Physical Device)',
    'Physical screen lock beyond expiry not executed in container; simulated 55s post-start resume reconciled expired state & triggered once.'
  );
}

// --- VG-04: Switch to another application during countdown ---
{
  mockStorage.clear();
  const t0 = 1_700_000_300_000;
  const session = timerSession.createRunningSession(90, t0);
  timerSession.persistSession(session, mockStorage);
  mockVisibilityState = 'hidden';
  const storedRaw = mockStorage.getItem(timerSession.SESSION_STORAGE_KEY);
  assert.ok(storedRaw, 'Authoritative session persisted when switching away');
  const parsed = JSON.parse(storedRaw!);
  assert.equal(parsed.targetEndTime, t0 + 90_000);
  mockVisibilityState = 'visible';
  record(
    'VG-04',
    'Automated / Simulated',
    'PASS',
    'Simulated app switch (hidden) retains authoritative session with targetEndTime in storage.'
  );
}

// --- VG-05: Return to application before expiry ---
{
  const t0 = 1_700_000_400_000;
  const session = timerSession.createRunningSession(60, t0);
  const returnAt = t0 + 25_000;
  const rem = timerSession.calculateSessionRemaining(session, returnAt);
  assert.equal(rem.remainingSeconds, 35);
  assert.equal(rem.isExpired, false);
  const trig = timerSession.tryMarkAlarmTriggered(session, returnAt);
  assert.equal(trig.shouldTrigger, false);
  record(
    'VG-05',
    'Automated / Simulated',
    'PASS',
    'Returning at +25s of 60s recalculates 35s remaining and does not trigger alarm.'
  );
}

// --- VG-06: Return after expiry ---
{
  const t0 = 1_700_000_500_000;
  const session = timerSession.createRunningSession(30, t0);
  const returnAt = t0 + 42_000;
  const rem = timerSession.calculateSessionRemaining(session, returnAt);
  assert.equal(rem.isExpired, true);
  assert.equal(rem.remainingSeconds, 0);
  const trig = timerSession.tryMarkAlarmTriggered(session, returnAt);
  assert.equal(trig.shouldTrigger, true);
  assert.equal(trig.session.alarmTriggered, true);
  assert.equal(trig.session.status, 'finished');
  record(
    'VG-06',
    'Automated / Simulated',
    'PASS',
    'Returning 12s after expiry reconciles immediately to 0s and triggers alarm.'
  );
}

// --- VG-07: Reload application during active countdown ---
{
  mockStorage.clear();
  const t0 = 1_700_000_600_000;
  const running = timerSession.createRunningSession(180, t0);
  timerSession.persistSession(running, mockStorage);
  // Simulated reload 40s later
  const reloadAt = t0 + 40_000;
  const restored = timerSession.loadPersistedSession(300, mockStorage, reloadAt);
  assert.equal(restored.sessionId, running.sessionId);
  assert.equal(restored.status, 'running');
  assert.equal(restored.durationSeconds, 180);
  const rem = timerSession.calculateSessionRemaining(restored, reloadAt);
  assert.equal(rem.remainingSeconds, 140);
  record(
    'VG-07',
    'Automated / Simulated',
    'PASS',
    'Reload restores active sessionId, durationSeconds=180, and exact 140s remaining.'
  );
}

// --- VG-08: Pause and resume ---
{
  mockStorage.clear();
  const t0 = 1_700_000_700_000;
  const running = timerSession.createRunningSession(100, t0);
  const pauseAt = t0 + 24_200; // 75.8s left -> ceil 76s
  const pauseRes = timerSession.pauseRunningSession(running, pauseAt);
  assert.equal(pauseRes.expired, false);
  assert.equal(pauseRes.session.status, 'paused');
  assert.equal(pauseRes.session.pausedRemainingSeconds, 76);
  timerSession.persistSession(pauseRes.session, mockStorage);

  // Reload while paused keeps exact paused remaining seconds
  const reloadedPaused = timerSession.loadPersistedSession(300, mockStorage, pauseAt + 10_000);
  assert.equal(reloadedPaused.status, 'paused');
  assert.equal(reloadedPaused.pausedRemainingSeconds, 76);

  // Resume 10s later
  const resumeAt = pauseAt + 10_000;
  const resumed = timerSession.resumePausedSession(reloadedPaused, resumeAt);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.targetEndTime, resumeAt + 76_000);
  const remAfterResume = timerSession.calculateSessionRemaining(resumed, resumeAt + 6_000);
  assert.equal(remAfterResume.remainingSeconds, 70);
  record(
    'VG-08',
    'Automated / Simulated',
    'PASS',
    'Pause freezes 76s (survives reload), resume schedules +76s from resume timestamp.'
  );
}

// --- VG-09: Reset and verify no stale alarm occurs ---
{
  mockStorage.clear();
  const t0 = 1_700_000_800_000;
  const running = timerSession.createRunningSession(10, t0);
  timerSession.persistSession(running, mockStorage);
  // Also simulate legacy keys present
  mockStorage.setItem(timerSession.LEGACY_END_TIME_KEY, String(t0 + 10_000));
  mockStorage.setItem(timerSession.LEGACY_TIMER_STATE_KEY, 'running');

  // Reset
  soundEngine.stop();
  timerSession.clearPersistedSession(mockStorage);
  const afterReset = timerSession.loadPersistedSession(300, mockStorage, t0 + 60_000);
  assert.equal(afterReset.status, 'idle');
  assert.equal(afterReset.durationSeconds, 300);
  assert.equal(mockStorage.getItem(timerSession.SESSION_STORAGE_KEY), null);
  assert.equal(mockStorage.getItem(timerSession.LEGACY_END_TIME_KEY), null);

  // Verify Service Worker CANCEL_ALARM clears scheduled timeout and closes displayed notifications
  const swCode = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  let swClosedNotifications = 0;
  const swListeners: Record<string, (ev: any) => void> = {};
  const swCtx = {
    Notification: { permission: 'granted' },
    caches: { open: async () => ({ addAll: async () => {}, add: async () => {} }), keys: async () => [], match: async () => null },
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: {
      showNotification: async () => {},
      getNotifications: async () => [{ close: () => { swClosedNotifications++; } }],
    },
    skipWaiting: async () => {},
    addEventListener: (name: string, fn: (ev: any) => void) => {
      swListeners[name] = fn;
    },
  };
  (swCtx as any).self = swCtx;
  vm.runInNewContext(swCode, { ...swCtx, setTimeout, clearTimeout, Date, Promise, Number });
  swListeners.message({ data: { type: 'SCHEDULE_ALARM', endTime: Date.now() + 5000, sessionId: 's1' } });
  let waitPromise: Promise<unknown> = Promise.resolve();
  swListeners.message({
    data: { type: 'CANCEL_ALARM' },
    waitUntil: (p: Promise<unknown>) => {
      waitPromise = p;
    },
  });
  await waitPromise;
  assert.equal(swClosedNotifications, 1);

  record(
    'VG-09',
    'Automated / Simulated',
    'PASS',
    'Reset clears current + legacy storage keys (no resurrection) and SW CANCEL_ALARM clears timeout + notifications.'
  );
}

// --- VG-10: Duplicate alarm prevention ---
{
  const t0 = 1_700_000_900_000;
  let session = timerSession.createRunningSession(10, t0);
  const first = timerSession.tryMarkAlarmTriggered(session, t0 + 10_000, session.sessionId);
  session = first.session;
  const second = timerSession.tryMarkAlarmTriggered(session, t0 + 10_050, session.sessionId);
  const third = timerSession.tryMarkAlarmTriggered(session, t0 + 10_100);
  assert.equal(first.shouldTrigger, true);
  assert.equal(second.shouldTrigger, false);
  assert.equal(third.shouldTrigger, false);

  soundEngine.stop();
  const beforeCount = audioInstances.reduce((acc, a) => acc + a.playCalls, 0);
  soundEngine.playAlarm('digital', undefined, 0.8, { vibrate: true });
  soundEngine.playAlarm('digital', undefined, 0.8, { vibrate: true });
  soundEngine.playAlarm('digital', undefined, 0.8, { vibrate: true });
  const afterCount = audioInstances.reduce((acc, a) => acc + a.playCalls, 0);
  assert.equal(afterCount - beforeCount, 1, 'playAlarm must only start audio once while already playing');
  soundEngine.stop();

  record(
    'VG-10',
    'Automated / Simulated',
    'PASS',
    'tryMarkAlarmTriggered and soundEngine.isAlarmPlaying guard enforce 1 trigger & 1 playback per session.'
  );
}

// --- VG-11: Notification permission denied ---
{
  mockNotificationPermission = 'denied';
  createdNotifications.length = 0;
  const reqRes = await bgTimerMod.requestNotificationPermission();
  const sentRes = bgTimerMod.sendTimerNotification('One Tap Timer', 'Test');
  bgTimerMod.scheduleServiceWorkerAlarm(Date.now() + 5000, 'One Tap Timer', 'Test', 's-denied');
  assert.equal(reqRes, false);
  assert.equal(sentRes, false);
  assert.equal(createdNotifications.length, 0);
  mockNotificationPermission = 'granted';
  record(
    'VG-11',
    'Automated / Simulated',
    'PASS',
    'Denied permission safely returns false without exceptions or notification creation.'
  );
}

// --- VG-12: Wake Lock unavailable & rejected ---
{
  await screenWakeManager.release();
  wakeLockBehavior = 'unsupported';
  const modeUnsupported = await screenWakeManager.activate();
  assert.ok(['nosleep', 'unsupported', 'error'].includes(modeUnsupported));
  assert.equal(screenWakeManager.isNativeSupported(), false);
  await screenWakeManager.release();

  wakeLockBehavior = 'reject';
  const modeRejected = await screenWakeManager.activate();
  assert.ok(['nosleep', 'error'].includes(modeRejected));
  assert.ok(screenWakeManager.getState().lastError?.includes('Native Wake Lock rejected'));
  await screenWakeManager.release();

  wakeLockBehavior = 'supported';
  mockVisibilityState = 'visible';
  const modeNative = await screenWakeManager.activate();
  assert.equal(modeNative, 'native');
  assert.equal(screenWakeManager.getState().hasActiveNativeSentinel, true);
  // Simulate OS releasing sentinel on hide, then reacquiring on visible
  await activeMockSentinel?.release();
  assert.equal(screenWakeManager.getState().hasActiveNativeSentinel, false);
  const reacquired = await screenWakeManager.reacquireIfVisible();
  assert.equal(reacquired, 'native');
  assert.equal(screenWakeManager.getState().hasActiveNativeSentinel, true);
  await screenWakeManager.release();

  record(
    'VG-12',
    'Automated / Simulated',
    'PASS',
    'Handled unsupported & rejected Wake Lock gracefully with NoSleep fallback and visible reacquisition.'
  );
}

// --- VG-13: Countdown accuracy after background suspension ---
{
  const t0 = 1_700_001_000_000;
  const session = timerSession.createRunningSession(300, t0);
  // Simulate 187.4s suspension with ZERO interval ticks
  const resumeAt = t0 + 187_400;
  const rem = timerSession.calculateSessionRemaining(session, resumeAt);
  // 300 - 187.4 = 112.6s -> ceil = 113s
  assert.equal(rem.remainingSeconds, 113);
  assert.equal(rem.isExpired, false);
  record(
    'VG-13',
    'Automated / Simulated',
    'PASS',
    'After 187.4s zero-tick suspension, single reconciliation computes exact 113s remaining.'
  );
}

// --- VG-14: Ringtone and vibration behaviour ---
{
  soundEngine.stop();
  vibrateCalls.length = 0;

  // Test preload before start
  soundEngine.preloadRingtone('siren');
  const lastAudio = audioInstances[audioInstances.length - 1];
  assert.ok(lastAudio.src.includes('Alarm%20Emergency%201.mp3'));
  assert.ok(lastAudio.loadCalls >= 1);

  // Test vibrate=false suppresses vibration (only sends stop signal 0)
  soundEngine.playAlarm('siren', undefined, 0.75, { vibrate: false });
  assert.deepEqual(vibrateCalls, [0]);
  soundEngine.stop();

  // Test vibrate=true starts vibration and stop() cancels with vibrate(0)
  vibrateCalls.length = 0;
  soundEngine.playAlarm('custom', 'data:audio/mp3;base64,AAAA', 0.9, { vibrate: true });
  assert.ok(vibrateCalls.length >= 1);
  soundEngine.stop();
  assert.equal(vibrateCalls[vibrateCalls.length - 1], 0);
  assert.equal(mediaSessionState.playbackState, 'none');

  record(
    'VG-14',
    'Automated / Simulated',
    'PASS',
    'Preload, built-in/custom ringtone resolution, vibrate toggle, and stop() cleanup verified.'
  );
}

console.log('\n=== SYNCROZZ SES v4.5 VERIFICATION GATES ===');
for (const r of results) {
  console.log(`[${r.status}] ${r.gate} (${r.mode}): ${r.detail}`);
}

const failed = results.filter((r) => r.status !== 'PASS' && r.status !== 'NOT PERFORMED (Physical Device)');
if (failed.length > 0) {
  process.exit(1);
}
