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
  private currentAudio: HTMLAudioElement | null = null;

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
    // Fallback to first ringtone URL if not found
    return BUILT_IN_RINGTONES[0].url;
  }

  /**
   * Stops any currently playing audio immediately.
   */
  public stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {
        console.warn('Error stopping current audio:', e);
      }
      this.currentAudio = null;
    }
  }

  /**
   * Plays selected alarm sound on loop when timer finishes.
   */
  public playAlarm(
    ringtoneId: string,
    customDataUrl?: string,
    volume = 0.8
  ) {
    this.stop();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);
    if (!url) return;

    try {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = Math.max(0, Math.min(1, volume));
      
      this.currentAudio = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio alarm playback failed/blocked:', err);
        });
      }
    } catch (err) {
      console.error('Failed to instantiate Audio for alarm:', err);
    }
  }

  /**
   * Plays a single test sample of the selected sound when clicking "Test Sound".
   */
  public previewSound(
    ringtoneId: string,
    customDataUrl?: string,
    volume = 0.8
  ) {
    this.stop();

    const url = this.getAudioUrl(ringtoneId, customDataUrl);
    if (!url) return;

    try {
      const audio = new Audio(url);
      audio.loop = false;
      audio.volume = Math.max(0, Math.min(1, volume));

      this.currentAudio = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio preview playback failed/blocked:', err);
        });
      }
    } catch (err) {
      console.error('Failed to instantiate Audio for preview:', err);
    }
  }

  /**
   * Triggers device vibration if supported.
   */
  public vibrate(pattern: number | number[] = [500, 250, 500, 250]) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        // Vibrate not supported or allowed
      }
    }
  }

  /**
   * Stops device vibration.
   */
  public stopVibration() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (err) {
        // ignore
      }
    }
  }
}

export const soundEngine = new SoundEngine();
