import type { InteractionKind } from '../../shared/game/model';

type Tone = { frequency: number; delay: number; duration: number };
export const soundPatterns: Record<InteractionKind, readonly Tone[]> = {
  walk: [{ frequency: 240, delay: 0, duration: 0.045 }],
  add: [
    { frequency: 440, delay: 0, duration: 0.09 },
    { frequency: 660, delay: 0.07, duration: 0.12 },
  ],
  subtract: [
    { frequency: 660, delay: 0, duration: 0.09 },
    { frequency: 440, delay: 0.07, duration: 0.12 },
  ],
  divide: [
    { frequency: 880, delay: 0, duration: 0.09 },
    { frequency: 660, delay: 0.07, duration: 0.09 },
    { frequency: 330, delay: 0.14, duration: 0.12 },
  ],
  multiply: [
    { frequency: 330, delay: 0, duration: 0.09 },
    { frequency: 660, delay: 0.07, duration: 0.09 },
    { frequency: 880, delay: 0.14, duration: 0.12 },
  ],
  set: [{ frequency: 520, delay: 0, duration: 0.14 }],
  absorb: [
    { frequency: 390, delay: 0, duration: 0.1 },
    { frequency: 780, delay: 0.08, duration: 0.16 },
  ],
  respawn: [
    { frequency: 300, delay: 0, duration: 0.12 },
    { frequency: 220, delay: 0.1, duration: 0.12 },
    { frequency: 440, delay: 0.24, duration: 0.18 },
  ],
  loss: [
    { frequency: 260, delay: 0, duration: 0.18 },
    { frequency: 180, delay: 0.15, duration: 0.24 },
  ],
  win: [
    { frequency: 523.25, delay: 0, duration: 0.16 },
    { frequency: 659.25, delay: 0.12, duration: 0.16 },
    { frequency: 783.99, delay: 0.24, duration: 0.16 },
    { frequency: 1046.5, delay: 0.36, duration: 0.3 },
  ],
};

let audio: AudioContext | undefined;

export function soundEffectsEnabled(): boolean {
  return soundVolume() > 0;
}

export function soundVolume(): number {
  try {
    const saved = localStorage.getItem('outnumber-volume');
    if (saved === null) return 0;
    const volume = Number(saved);
    return Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 0;
  } catch {
    return 0;
  }
}

export function restoredSoundVolume(): number {
  try {
    const volume = Number(localStorage.getItem('outnumber-volume-last'));
    return Number.isFinite(volume) && volume > 0 ? Math.min(100, volume) : 50;
  } catch {
    return 50;
  }
}

export function setSoundVolume(value: number): void {
  const volume = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  try {
    localStorage.setItem('outnumber-volume', String(volume));
    if (volume > 0)
      localStorage.setItem('outnumber-volume-last', String(volume));
  } catch {
    return;
  }
  if (volume > 0) {
    unlockSoundEffects();
  } else if (audio) {
    void audio.suspend().catch(() => {});
  }
}

export async function previewSoundEffects(): Promise<void> {
  unlockSoundEffects();
  try {
    if (audio?.state === 'suspended') await audio.resume();
    playSoundEffect('add');
  } catch {
    return;
  }
}

export function unlockSoundEffects(): void {
  if (!soundEffectsEnabled() || typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
  } catch {
    audio = undefined;
  }
}

export function playSoundEffect(kind: InteractionKind): void {
  if (
    !soundEffectsEnabled() ||
    !audio ||
    audio.state !== 'running' ||
    document.hidden
  )
    return;
  try {
    for (const tone of soundPatterns[kind]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + tone.delay;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        ((kind === 'walk' ? 0.025 : 0.07) * soundVolume()) / 100,
        start + 0.008
      );
      gain.gain.exponentialRampToValueAtTime(0.001, start + tone.duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + tone.duration + 0.01);
    }
  } catch {
    return;
  }
}
