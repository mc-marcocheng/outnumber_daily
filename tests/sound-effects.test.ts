import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoredSoundVolume,
  setSoundVolume,
  soundEffectsEnabled,
  soundPatterns,
  soundVolume,
  unlockSoundEffects,
} from '../src/client/app/sound-effects';

afterEach(() => vi.unstubAllGlobals());

describe('sound effects', () => {
  it('stores the volume and restores the last nonzero value', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('AudioContext', undefined);
    expect(soundVolume()).toBe(0);
    setSoundVolume(65);
    expect(soundVolume()).toBe(65);
    setSoundVolume(0);
    expect(soundVolume()).toBe(0);
    expect(restoredSoundVolume()).toBe(65);
    setSoundVolume(150);
    expect(soundVolume()).toBe(100);
    setSoundVolume(Number.NaN);
    expect(soundVolume()).toBe(0);
  });

  it('starts muted and tolerates unavailable storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(soundEffectsEnabled()).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Blocked');
      },
    });
    expect(soundEffectsEnabled()).toBe(false);
    expect(() => unlockSoundEffects()).not.toThrow();
  });

  it('does not create audio before the player enables it', () => {
    const constructor = vi.fn();
    vi.stubGlobal('AudioContext', constructor);
    vi.stubGlobal('localStorage', { getItem: () => 'off' });
    unlockSoundEffects();
    expect(constructor).not.toHaveBeenCalled();
  });

  it('provides short, finite patterns for every interaction', () => {
    expect(Object.keys(soundPatterns).sort()).toEqual([
      'absorb',
      'add',
      'divide',
      'loss',
      'multiply',
      'respawn',
      'set',
      'subtract',
      'walk',
      'win',
    ]);
    for (const pattern of Object.values(soundPatterns)) {
      expect(pattern.length).toBeGreaterThan(0);
      for (const tone of pattern) {
        expect(tone.frequency).toBeGreaterThan(0);
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.delay + tone.duration).toBeLessThan(1);
      }
    }
  });
});
