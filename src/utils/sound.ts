import { RingtoneOption } from '../types';

export const BUILT_IN_RINGTONES: RingtoneOption[] = [
  {
    id: 'digital',
    name: 'Loud Digital Alarm',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Jam%20Loceng%20Digital.mp3',
    description: 'Classic loud digital alarm clock ringing',
    category: 'Classic',
  },
  {
    id: 'siren',
    name: 'Emergency Siren Alarm',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Emergency%201.mp3',
    description: 'High-pitched emergency warning siren',
    category: 'Emergency',
  },
  {
    id: 'buzzer',
    name: 'Electric Clock Buzzer',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Buzzer%20BioHazard.mp3',
    description: 'Sharp loud electric clock buzzer',
    category: 'Classic',
  },
  {
    id: 'twin-bell',
    name: 'Classic Twin Bell',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Jam%20Loceng%20Style%20Lama.mp3',
    description: 'Loud ringing twin alarm bell hammer',
    category: 'Classic',
  },
  {
    id: 'facility-emergency',
    name: 'Facility Emergency',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Facility%20Emergency.wav',
    description: 'Facility level alarm warning tone',
    category: 'Emergency',
  },
  {
    id: 'cyber-alert',
    name: 'Cyber Alert',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Cyber%20Alert.mp3',
    description: 'Futuristic electronic cyber alert',
    category: 'Alert',
  },
  {
    id: 'robot-siren',
    name: 'Robot Siren',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Robot%20Siren.mp3',
    description: 'Oscillating robot siren alert',
    category: 'Alert',
  },
  {
    id: 'nuclear-alert',
    name: 'Nuclear Alert',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Nuclear%20Alert%20Hazard.mp3',
    description: 'Urgent nuclear hazard warning siren',
    category: 'Emergency',
  },
  {
    id: 'timer-complete',
    name: 'Timer Complete',
    url: 'https://assets.syncrozz.com/ring_tone/alarm/Alarm%20Timer%20Time%20untuk%20Stop.wav',
    description: 'Notification signal for timer completion',
    category: 'Alert',
  },
];

/**
 * Generates a clean 16-bit 44.1kHz silent WAV PCM audio buffer (pure digital zero).
 * Keeps the browser/OS audio session, MediaSession, and `ontimeupdate` heartbeat active
 * when the browser allows background audio, without producing audible hiss or hum.
 * Note: Mobile OSes may still suspend browser processes after screen lock.
 */
function createSilentWavBlobUrl(): string {
  try {
    const sampleRate = 44100;
    const duration = 5;
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataSize = sampleRate * duration * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn('Failed to build silent wav blob:', e);
    return 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==';
  }
}

export interface PlayAlarmOptions {
  vibrate?: boolean;
}

class SoundEngine {
  private silentWavUrl: string = '';
  private keepAliveAudio: HTMLAudioElement | null = null;
  private alarmAudio: HTMLAudioElement | null = null;
  private preloadedUrl: string | null = null;
  private audioContext: AudioContext | null = null;
  private keepAliveSource: AudioBufferSourceNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private fallbackOscInterval: number | null = null;
  private vibrationInterval: number | null = null;
  private onStopAction: (() => void) | null = null;
  private onExpiredAction: (() => void) | null = null;
  private targetEndTime: number | null = null;
  private isArmed = false;
  private isAlarmPlaying = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.silentWavUrl = createSilentWavBlobUrl();
    }
  }

  public setStopHandler(callback: (() => void) | null) {
    this.onStopAction = callback;
  }

  public isPlayingAlarm(): boolean {
    return this.isAlarmPlaying;
  }

  /**
   * Unlocks or resumes AudioContext during user gesture or lifecycle recovery
   */
  public unlockAudio() {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext unlock note:', e);
    }
  }

  public resumeAudioIfNeeded() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    if (this.isArmed && this.keepAliveAudio && this.keepAliveAudio.paused) {
      this.keepAliveAudio.play().catch(() => {});
    }
  }

  /**
   * Helper to resolve audio URL from ringtoneId or customDataUrl
   */
  public getAudioUrl(ringtoneId: string, customDataUrl?: string): string {
    if (ringtoneId === 'custom' && customDataUrl) {
      return customDataUrl;
    }
    const found = BUILT_IN_RINGTONES.find((r) => r.id === ringtoneId);
    if (found) {
      return found.url;
    }
    return BUILT_IN_RINGTONES[0].url;
  }

  /**
   * Preloads the selected ringtone into an HTMLAudioElement before the timer starts.
   */
  public preloadRingtone(ringtoneId: string, customDataUrl?: string) {
    if (typeof Audio === 'undefined') return;
    try {
      const url = this.getAudioUrl(ringtoneId, customDataUrl);
      if (!url) return;

      if (!this.alarmAudio) {
        this.alarmAudio = new Audio();
      }
      this.alarmAudio.setAttribute('playsinline', '');
      this.alarmAudio.setAttribute('webkit-playsinline', '');
      this.alarmAudio.preload = 'auto';
      this.alarmAudio.loop = true;

      if (this.preloadedUrl !== url) {
        this.alarmAudio.src = url;
        this.alarmAudio.load();
        this.preloadedUrl = url;
      }
    } catch (err) {
      console.warn('Alarm audio preload warning:', err);
    }
  }

  /**
   * Arms the supplementary background audio keep-alive and preloads alarm tone.
   * `ontimeupdate` delegates strictly to `onExpired` so expiration goes through
   * the single authoritative session guard (preventing duplicate alarm playback).
   */
  public armTimer(
    ringtoneId: string,
    customDataUrl?: string,
    _volume = 0.8,
    targetEndTime?: number,
    onExpired?: () => void
  ) {
    this.isArmed = true;
    this.isAlarmPlaying = false;
    this.targetEndTime = targetEndTime || null;
    this.onExpiredAction = onExpired || null;
    this.unlockAudio();

    // 1. Pre-load the chosen alarm ringtone before starting
    this.preloadRingtone(ringtoneId, customDataUrl);

    // 2. Start continuous silent carrier audio on loop (supplementary keep-alive)
    try {
      if (typeof Audio !== 'undefined') {
        if (!this.keepAliveAudio) {
          this.keepAliveAudio = new Audio(this.silentWavUrl);
        }
        this.keepAliveAudio.setAttribute('playsinline', '');
        this.keepAliveAudio.setAttribute('webkit-playsinline', '');
        this.keepAliveAudio.loop = true;
        this.keepAliveAudio.volume = 0.01;

        this.keepAliveAudio.ontimeupdate = () => {
          if (!this.isArmed || !this.targetEndTime || this.isAlarmPlaying) return;
          if (Date.now() >= this.targetEndTime) {
            const cb = this.onExpiredAction;
            this.onExpiredAction = null;
            if (cb) cb();
          }
        };

        const p = this.keepAliveAudio.play();
        if (p !== undefined) {
          p.catch((err) => console.warn('Carrier play note:', err));
        }
      }
    } catch (err) {
      console.warn('Keep-alive init warning:', err);
    }

    // 3. Start silent Web Audio keep-alive buffer (zero audible signal)
    try {
      if (this.audioContext && !this.keepAliveSource) {
        const silentBuffer = this.audioContext.createBuffer(
          1,
          this.audioContext.sampleRate,
          this.audioContext.sampleRate
        );
        const source = this.audioContext.createBufferSource();
        source.buffer = silentBuffer;
        source.loop = true;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, this.audioContext.currentTime);

        source.connect(gain);
        gain.connect(this.audioContext.destination);
        source.start();

        this.keepAliveSource = source;
        this.keepAliveGain = gain;
      }
    } catch (e) {
      console.warn('Web Audio buffer keep-alive note:', e);
    }

    this.updateMediaSessionRunning('Pemasa sedang berjalan...');
  }

  public disarmKeepAlive() {
    this.isArmed = false;
    this.onExpiredAction = null;
    if (this.keepAliveAudio) {
      this.keepAliveAudio.ontimeupdate = null;
      try {
        this.keepAliveAudio.pause();
      } catch {}
    }
    if (this.keepAliveSource) {
      try {
        this.keepAliveSource.stop();
        this.keepAliveSource.disconnect();
      } catch {}
      this.keepAliveSource = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {}
      this.keepAliveGain = null;
    }
  }

  /**
   * Updates Media Session metadata so lockscreen displays countdown
   */
  public updateMediaSessionRunning(timeLeftFormatted: string) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `One Tap Timer - ${timeLeftFormatted}`,
        artist: 'Pemasa berjalan di latar belakang (Ketik untuk henti)',
        album: 'One Tap Timer',
        artwork: [
          {
            src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('stop', () => {
        if (this.onStopAction) this.onStopAction();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (this.onStopAction) this.onStopAction();
      });
    } catch {}
  }

  /**
   * Plays selected alarm sound on loop and triggers oscillator fallback + optional vibration.
   * Guarded by `isAlarmPlaying` to guarantee no duplicate audio or vibration loops.
   */
  public playAlarm(
    ringtoneId: string,
    customDataUrl?: string,
    volume = 0.8,
    options: PlayAlarmOptions = {}
  ) {
    if (this.isAlarmPlaying) {
      return;
    }
    this.isAlarmPlaying = true;
    this.disarmKeepAlive();
    this.stopFallbackBeep();

    const safeVolume = Math.max(0.05, Math.min(1, volume));
    const url = this.getAudioUrl(ringtoneId, customDataUrl);

    // Update Lock Screen controls to alarming state
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '⏰ MASA TELAH TAMAT!',
          artist: 'Jam Penggera Berbunyi - Ketik Stop untuk henti',
          album: 'One Tap Timer',
          artwork: [
            {
              src: 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/OneTapTimer/android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
          ],
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('stop', () => {
          if (this.onStopAction) this.onStopAction();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (this.onStopAction) this.onStopAction();
        });
      } catch {}
    }

    // 1. Play synthesized emergency buzzer immediately for zero-delay alert
    this.startFallbackBeep(safeVolume);

    // 2. Play primary ringtone audio file
    try {
      if (typeof Audio !== 'undefined') {
        if (!this.alarmAudio) {
          this.alarmAudio = new Audio();
        }
        this.alarmAudio.setAttribute('playsinline', '');
        this.alarmAudio.setAttribute('webkit-playsinline', '');
        if (this.preloadedUrl !== url) {
          this.alarmAudio.src = url;
          this.preloadedUrl = url;
        }
        this.alarmAudio.loop = true;
        this.alarmAudio.volume = safeVolume;
        try {
          this.alarmAudio.currentTime = 0;
        } catch {}

        const p = this.alarmAudio.play();
        if (p !== undefined) {
          p.catch((err) => {
            console.warn('Alarm audio file play note (fallback beep active):', err);
          });
        }
      }
    } catch (err) {
      console.warn('Alarm audio play error:', err);
    }

    // 3. Start looping vibration pattern only when enabled
    if (options.vibrate !== false) {
      this.startVibrationLoop([800, 300, 800, 300, 800, 300, 800]);
    } else {
      this.stopVibration();
    }
  }

  /**
   * Web Audio urgent synthesized alert beeper (880Hz / 1320Hz alarm)
   */
  public startFallbackBeep(volume = 0.8) {
    this.stopFallbackBeep();
    try {
      this.unlockAudio();
      if (!this.audioContext) return;

      const playTone = () => {
        if (!this.audioContext || this.audioContext.state === 'closed') return;
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
        const now = this.audioContext.currentTime;

        [0, 0.16].forEach((offset, idx) => {
          if (!this.audioContext) return;
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(idx === 0 ? 880 : 1320, now + offset);
          gain.gain.setValueAtTime(Math.min(1, volume * 0.7), now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.13);
        });
      };

      playTone();
      this.fallbackOscInterval = window.setInterval(playTone, 650);
    } catch (err) {
      console.warn('Fallback beep note:', err);
    }
  }

  public stopFallbackBeep() {
    if (this.fallbackOscInterval !== null) {
      clearInterval(this.fallbackOscInterval);
      this.fallbackOscInterval = null;
    }
  }

  /**
   * Sound preview in settings
   */
  public previewSound(ringtoneId: string, customDataUrl?: string, volume = 0.8) {
    this.stop();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);
    if (!url || typeof Audio === 'undefined') return;

    try {
      const audio = new Audio(url);
      audio.loop = false;
      audio.volume = Math.max(0.05, Math.min(1, volume));
      this.alarmAudio = audio;
      this.preloadedUrl = url;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio preview note, playing synth beep:', err);
          this.startFallbackBeep(volume);
          setTimeout(() => this.stopFallbackBeep(), 2000);
        });
      }
    } catch (err) {
      console.error('Failed to preview audio:', err);
    }
  }

  public vibrate(pattern: number | number[] = 30) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  public startVibrationLoop(pattern = [600, 300, 600, 300, 600]) {
    this.stopVibration();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
        const duration = pattern.reduce((sum, val) => sum + val, 0) + 400;
        this.vibrationInterval = window.setInterval(() => {
          try {
            navigator.vibrate(pattern);
          } catch {}
        }, duration);
      } catch {}
    }
  }

  public stopVibration() {
    if (this.vibrationInterval !== null) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }

  /**
   * Complete stop of all sounds, keep-alives, and vibrations
   */
  public stop() {
    this.isArmed = false;
    this.isAlarmPlaying = false;
    this.targetEndTime = null;
    this.disarmKeepAlive();
    this.stopFallbackBeep();
    this.stopVibration();

    if (this.alarmAudio) {
      try {
        this.alarmAudio.pause();
        this.alarmAudio.currentTime = 0;
      } catch {}
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }
  }
}

export const soundEngine = new SoundEngine();
