// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  rememberIdentity,
  restoredDifficulty,
  restoredIdentity,
} from '../src/client/app/difficulty-preference';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe('difficulty preference and expansion handoff', () => {
  it('defaults first and invalid visits to Easy, retaining only difficulty', () => {
    expect(restoredDifficulty()).toBe('easy');
    localStorage.setItem('outnumber-difficulty', 'hard');
    expect(restoredDifficulty()).toBe('hard');
    localStorage.setItem('outnumber-difficulty', '2026-11-14');
    expect(restoredDifficulty()).toBe('easy');
  });
  it('consumes a validated post-scoped date and difficulty together', () => {
    rememberIdentity('post', { date: '2026-11-11', difficulty: 'medium' });
    expect(restoredIdentity('other')).toBeUndefined();
    expect(restoredIdentity('post')).toEqual({
      date: '2026-11-11',
      difficulty: 'medium',
    });
    expect(restoredIdentity('post')).toBeUndefined();
  });
  it('ignores malformed, plain-date, future and invalid handoffs', () => {
    for (const value of [
      '2026-11-11',
      '{',
      JSON.stringify({ date: '2099-01-01', difficulty: 'hard' }),
      JSON.stringify({ date: '2026-11-11', difficulty: 'master' }),
    ]) {
      sessionStorage.setItem('outnumber-expand:post', value);
      expect(restoredIdentity('post')).toBeUndefined();
    }
  });
  it('falls back when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(restoredDifficulty()).toBe('easy');
    expect(restoredIdentity('post')).toBeUndefined();
  });
});
