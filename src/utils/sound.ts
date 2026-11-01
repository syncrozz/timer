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

class SoundEngine {
  private alarmAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private keepAliveGain: GainNode | null = null;
  private keepAliveOsc: OscillatorNode | null = null;
  private scheduledDspTimeout: number | null = null;
  private fallbackOscInterval: number | null = null;
  private vibrationInterval: number | null = null;
  private onStopAction: (() => void) | null = null;
  private onExpiredAction: (() => void) | null = null;
  private targetEndTime: number | null = null;
  private isArmed = false;

  public setStopHandler(callback: (() => void) | null) {
    this.onStopAction = callback;
  }

  /**
   * Unlocks and initializes AudioContext during user gesture
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
      this.ensureWebAudioKeepAlive();
    } catch (e) {
      console.warn('AudioContext unlock note:', e);
    }
  }

  /**
   * Runs an imperceptible sub-bass signal (-120dB) through the Web Audio graph.
   * This maintains an active hardware audio pipe on iOS Safari / Android Chrome.
   */
  private ensureWebAudioKeepAlive() {
    if (!this.audioContext || this.keepAliveOsc) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(30, this.audioContext.currentTime); // inaudible 30Hz
      gain.gain.setValueAtTime(0.00001, this.audioContext.currentTime); // inaudible amplitude
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      this.keepAliveOsc = osc;
      this.keepAliveGain = gain;
    } catch (err) {
      console.warn('Web Audio keep alive note:', err);
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
   * Arms the audio keep-alive and begins pre-playing the alarm audio silently.
   * Because this executes on user tap, the browser grants full background playback permission.
   * When the timer expires, we un-mute the stream instantly without needing a new user interaction.
   */
  public armTimer(
    ringtoneId: string,
    customDataUrl?: string,
    volume = 0.8,
    targetEndTime?: number,
    onExpired?: () => void
  ) {
    this.isArmed = true;
    this.targetEndTime = targetEndTime || null;
    this.onExpiredAction = onExpired || null;
    this.unlockAudio();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);

    try {
      if (!this.alarmAudio) {
        this.alarmAudio = new Audio();
      }
      this.alarmAudio.setAttribute('playsinline', '');
      this.alarmAudio.setAttribute('webkit-playsinline', '');
      if (this.alarmAudio.src !== url) {
        this.alarmAudio.src = url;
      }
      this.alarmAudio.loop = true;
      // Start inaudible so the mobile media pipeline remains open throughout countdown
      this.alarmAudio.volume = 0.0001;

      // Audio timeupdate acts as an OS-level heartbeat that continues firing even with screen off
      this.alarmAudio.ontimeupdate = () => {
        if (!this.isArmed || !this.targetEndTime) return;
        if (Date.now() >= this.targetEndTime) {
          this.playAlarm(ringtoneId, customDataUrl, volume);
          if (this.onExpiredAction) {
            this.onExpiredAction();
          }
        }
      };

      const playPromise = this.alarmAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Pre-play note (will un-mute on expire):', err);
        });
      }
    } catch (err) {
      console.warn('Audio arm warning:', err);
    }

    // Schedule DSP hardware-clock alert as a secondary fail-safe for deep sleep
    if (this.audioContext && targetEndTime) {
      this.scheduleHardwareDspAlert(targetEndTime, volume);
    }

    this.updateMediaSessionRunning('Pemasa sedang berjalan...');
  }

  /**
   * Schedules a Web Audio DSP hardware-clock alert at target timestamp.
   * Hardware DSP clock runs independently of JavaScript thread throttling.
   */
  private scheduleHardwareDspAlert(targetEndTime: number, volume: number) {
    this.cancelScheduledDsp();
    if (!this.audioContext) return;

    const delaySeconds = Math.max(0, (targetEndTime - Date.now()) / 1000);
    const triggerAudioTime = this.audioContext.currentTime + delaySeconds;

    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, triggerAudioTime);

      // Silent until triggerAudioTime, then loud beeps
      gain.gain.setValueAtTime(0, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0, triggerAudioTime - 0.01);
      gain.gain.setValueAtTime(Math.min(1, volume * 0.7), triggerAudioTime);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(triggerAudioTime);
      osc.stop(triggerAudioTime + 30); // Stop after 30s
    } catch (e) {
      console.warn('Hardware DSP schedule note:', e);
    }
  }

  private cancelScheduledDsp() {
    if (this.scheduledDspTimeout) {
      clearTimeout(this.scheduledDspTimeout);
      this.scheduledDspTimeout = null;
    }
  }

  public disarmKeepAlive() {
    this.isArmed = false;
    this.cancelScheduledDsp();
    if (this.alarmAudio) {
      this.alarmAudio.ontimeupdate = null;
      try {
        this.alarmAudio.pause();
      } catch {}
    }
  }

  /**
   * Updates Media Session metadata during countdown so lockscreen shows active timer
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
   * Sound the alarm when timer expires.
   * Unmutes the already-streaming audio and triggers vibration and lockscreen controls.
   */
  public playAlarm(ringtoneId: string, customDataUrl?: string, volume = 0.8) {
    this.isArmed = false;
    this.stopFallbackBeep();

    const safeVolume = Math.max(0.1, Math.min(1, volume));
    const url = this.getAudioUrl(ringtoneId, customDataUrl);

    // Update lockscreen controls to alarming state with immediate Stop action
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
      this.alarmAudio.ontimeupdate = null;
      if (this.alarmAudio.src !== url) {
        this.alarmAudio.src = url;
      }
      this.alarmAudio.loop = true;
      this.alarmAudio.volume = safeVolume;
      this.alarmAudio.currentTime = 0;

      const playPromise = this.alarmAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Alarm audio un-mute note, activating fallback oscillator:', err);
          this.startFallbackBeep(safeVolume);
        });
      }
    } catch (err) {
      console.error('Failed to un-mute alarm audio, fallback oscillator:', err);
      this.startFallbackBeep(safeVolume);
    }

    this.startVibrationLoop([600, 300, 600, 300, 600, 300, 600]);
  }

  /**
   * Synthesizes urgent electronic beeps using Web Audio oscillator
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
    if (this.fallbackOscInterval) {
      clearInterval(this.fallbackOscInterval);
      this.fallbackOscInterval = null;
    }
  }

  /**
   * Sound preview when testing ringtones in settings modal
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
          console.warn('Audio preview note, testing synth beep:', err);
          this.startFallbackBeep(volume);
          setTimeout(() => this.stopFallbackBeep(), 2000);
        });
      }
    } catch (err) {
      console.error('Failed to preview audio:', err);
    }
  }

  /**
   * Tactile vibration
   */
  public vibrate(pattern: number | number[] = 30) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * Continuous looping vibration while alarm sounds
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
   * Complete stop of all sounds and vibrations
   */
  public stop() {
    this.isArmed = false;
    this.targetEndTime = null;
    this.cancelScheduledDsp();
    this.stopFallbackBeep();
    this.stopVibration();

    if (this.alarmAudio) {
      this.alarmAudio.ontimeupdate = null;
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
