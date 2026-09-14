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
 * Generates an in-memory 2-second silent WAV Blob URL.
 * Used as an "Audio Anchor" to keep mobile operating systems (iOS Safari & Android Chrome)
 * from putting the timer worker and audio pipeline to sleep when screen dims or locks.
 */
function createSilentWavBlobUrl(): string {
  try {
    const sampleRate = 8000;
    const duration = 2;
    const numChannels = 1;
    const bitsPerSample = 8;
    const dataSize = sampleRate * duration;
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
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const pcm = new Uint8Array(buffer, 44);
    pcm.fill(128); // 8-bit PCM center (silence)

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.warn('Failed to build silent wav blob, fallback data URL:', e);
    return 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==';
  }
}

class SoundEngine {
  private silentWavUrl: string = '';
  private silentAudio: HTMLAudioElement | null = null;
  private alarmAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private fallbackOscInterval: number | null = null;
  private vibrationInterval: number | null = null;
  private onStopAction: (() => void) | null = null;
  private isArmed = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.silentWavUrl = createSilentWavBlobUrl();
    }
  }

  public setStopHandler(callback: (() => void) | null) {
    this.onStopAction = callback;
  }

  /**
   * Unlocks AudioContext upon user gesture (tap/click)
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

  /**
   * Arms the audio keep-alive and preloads alarm sound on user gesture.
   * This is the critical piece that prevents mobile browsers from freezing
   * countdown and blocking background audio playback when phone dims or locks.
   */
  public armTimer(ringtoneId: string, customDataUrl?: string, volume = 0.8) {
    this.isArmed = true;
    this.unlockAudio();

    // 1. Start silent keep-alive audio loop
    try {
      if (!this.silentAudio) {
        this.silentAudio = new Audio(this.silentWavUrl);
        this.silentAudio.loop = true;
      }
      // Set low volume to maintain media session on Android/iOS
      this.silentAudio.volume = 0.05;
      const playPromise = this.silentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn('Silent keep-alive play note:', e);
        });
      }
    } catch (err) {
      console.warn('Silent audio init warning:', err);
    }

    // 2. Pre-arm and load alarm audio element during this user gesture
    try {
      const url = this.getAudioUrl(ringtoneId, customDataUrl);
      if (!this.alarmAudio) {
        this.alarmAudio = new Audio();
      }
      this.alarmAudio.src = url;
      this.alarmAudio.loop = true;
      this.alarmAudio.volume = Math.max(0, Math.min(1, volume));
      this.alarmAudio.load();
    } catch (err) {
      console.warn('Alarm audio pre-load warning:', err);
    }

    // 3. Register media session so OS treats this tab with media priority
    this.updateMediaSessionRunning('Pemasa sedang berjalan...');
  }

  /**
   * Disarm keep alive without stopping any existing alarm
   */
  public disarmKeepAlive() {
    this.isArmed = false;
    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      } catch {}
    }
  }

  /**
   * Update Media Session when timer is running
   */
  public updateMediaSessionRunning(timeLeftFormatted: string) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `One Tap Timer - ${timeLeftFormatted}`,
        artist: 'Pemasa sedang berjalan di latar belakang',
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
   * Plays selected alarm sound on loop when timer finishes.
   * Swaps seamlessly from silent keep-alive to full volume alarm audio.
   */
  public playAlarm(ringtoneId: string, customDataUrl?: string, volume = 0.8) {
    this.disarmKeepAlive();
    this.stopFallbackBeep();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);

    // Update MediaSession to alarming state with stop controls
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '⏰ MASA TELAH TAMAT!',
          artist: 'Jam Penggera Sedang Berbunyi - Ketik untuk henti',
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

    try {
      if (!this.alarmAudio) {
        this.alarmAudio = new Audio();
      }
      if (this.alarmAudio.src !== url) {
        this.alarmAudio.src = url;
      }
      this.alarmAudio.loop = true;
      this.alarmAudio.volume = Math.max(0, Math.min(1, volume));
      this.alarmAudio.currentTime = 0;

      const playPromise = this.alarmAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio alarm playback issue, starting synthesized oscillator fallback:', err);
          this.startFallbackBeep(volume);
        });
      }
    } catch (err) {
      console.error('Failed to play alarm audio, starting fallback oscillator:', err);
      this.startFallbackBeep(volume);
    }
  }

  /**
   * Plays a synthesized urgent electronic beep pattern using Web Audio oscillator
   * as a robust fallback or secondary alert if HTMLAudioElement fails.
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

        // Urgent alternating double beep (880Hz -> 1320Hz)
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
      console.warn('Fallback beep failed:', err);
    }
  }

  public stopFallbackBeep() {
    if (this.fallbackOscInterval) {
      clearInterval(this.fallbackOscInterval);
      this.fallbackOscInterval = null;
    }
  }

  /**
   * Plays a single test sample of the selected sound when clicking "Test Sound".
   */
  public previewSound(ringtoneId: string, customDataUrl?: string, volume = 0.8) {
    this.stop();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);
    if (!url) return;

    try {
      const audio = new Audio(url);
      audio.loop = false;
      audio.volume = Math.max(0, Math.min(1, volume));
      this.alarmAudio = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio preview playback blocked, testing fallback synth beep:', err);
          this.startFallbackBeep(volume);
          setTimeout(() => this.stopFallbackBeep(), 2000);
        });
      }
    } catch (err) {
      console.error('Failed to preview audio:', err);
    }
  }

  /**
   * One-shot vibration for tactile tap feedback
   */
  public vibrate(pattern: number | number[] = 30) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * Continuous looping vibration while the alarm rings
   */
  public startVibrationLoop(pattern = [600, 300, 600, 300, 600]) {
    this.stopVibration();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
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

  /**
   * Stops device vibration.
   */
  public stopVibration() {
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }

  /**
   * Stops all active alarms and vibrations immediately.
   */
  public stop() {
    this.isArmed = false;
    this.stopFallbackBeep();
    this.stopVibration();

    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      } catch {}
    }

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
