import { describe, expect, it } from 'vitest';
import rawBankLevel from './fixtures/bank-it.json';
import rawFrozenTutorial from './fixtures/banking-tutorial.json';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  commitInteraction,
  createSession,
  restoreSession,
  undo,
} from '../src/shared/game/session';
import type { Level } from '../src/shared/game/model';
import type { Session } from '../src/shared/game/session';

const level = compileLevel(rawBankLevel);
const frozen = compileLevel(rawFrozenTutorial);

// Session rules against the frozen banking fixture (test-audit 2.2).
describe('session rules (frozen banking fixture)', () => {
  it('commits interactions and records the action log', () => {
    let session = createSession(frozen);

    for (const id of ['bank', 'triple', 'bank', 'boss']) {
      const committed = commitInteraction(frozen, session, id);

      expect(committed.result.ok).toBe(true);
      session = committed.session;
    }

    expect(session.actions).toEqual(['bank', 'triple', 'bank', 'boss']);
    expect(session.present.phase).toBe('won');
    expect(session.past).toHaveLength(4);
  });

  it('rejects mismatched level or revision', () => {
    const session = createSession(frozen);
    const other: Level = { ...frozen, revision: frozen.revision + 1 };

    expect(() => commitInteraction(other, session, 'bank')).toThrow();
  });

  it('undo restores every part of a sacrifice', () => {
    let session = createSession(frozen);

    session = commitInteraction(frozen, session, 'bank').session;

    const afterBank = session.present;

    expect(afterBank.spareLives).toBe(0);
    expect(afterBank.enemies.get('bank')).toBe(11n);

    session = undo(session);
    const restored = session.present;

    expect(restored.value).toBe(4n);
    expect(restored.spareLives).toBe(1);
    expect(restored.enemies.get('bank')).toBe(7n);
    expect(restored.position).toBe(frozen.startCell);
    expect(restored.usedOps.size).toBe(0);
    expect(session.actions).toEqual([]);
  });

  it('supports undo after victory and after terminal loss', () => {
    // Undo after victory.
    let session = createSession(frozen);

    for (const id of ['bank', 'triple', 'bank', 'boss']) {
      session = commitInteraction(frozen, session, id).session;
    }

    expect(session.present.phase).toBe('won');

    session = undo(session);

    expect(session.present.phase).toBe('playing');
    expect(session.present.value).toBe(23n);

    // Undo after terminal loss: run out of lives against the boss.
    let lossSession = createSession(frozen);

    lossSession = commitInteraction(frozen, lossSession, 'bank').session;
    lossSession = commitInteraction(frozen, lossSession, 'triple').session;
    lossSession = commitInteraction(frozen, lossSession, 'boss').session;

    expect(lossSession.present.phase).toBe('lost');

    lossSession = undo(lossSession);

    expect(lossSession.present.phase).toBe('playing');
    expect(lossSession.present.value).toBe(12n);
  });

  it('replay reconstructs the exact same state', () => {
    let session = createSession(frozen);

    for (const id of ['bank', 'triple', 'bank', 'boss']) {
      session = commitInteraction(frozen, session, id).session;
    }

    const replayed = restoreSession(frozen, session.actions);

    expect(replayed.actions).toEqual(session.actions);
    expect(replayed.present.value).toBe(session.present.value);
    expect(replayed.present.phase).toBe(session.present.phase);
    expect(replayed.present.spareLives).toBe(session.present.spareLives);
    expect(replayed.present.position).toBe(session.present.position);
    expect([...replayed.present.enemies.entries()]).toEqual([
      ...session.present.enemies.entries(),
    ]);
    expect([...replayed.present.usedOps]).toEqual([...session.present.usedOps]);
    // The whole undo history is reconstructed too.
    expect(replayed.past).toHaveLength(session.past.length);
    expect(replayed.past[2]?.value).toBe(session.past[2]?.value);
  });

  it('rejects invalid saved action logs', () => {
    expect(() => restoreSession(frozen, ['triple', 'nope'])).toThrow();
  });

  it('rejects a log that fights the boss twice', () => {
    // After winning, the boss is gone; replaying another action fails.
    expect(() =>
      restoreSession(frozen, ['bank', 'triple', 'bank', 'boss', 'bank'])
    ).toThrow();
  });

  it('undo at the start of an attempt is a no-op', () => {
    const session: Session = createSession(frozen);

    expect(undo(session)).toBe(session);
  });
});

describe('Bank It session (shipped content)', () => {
  it('commits interactions and records the action log', () => {
    let session = createSession(level);

    for (const id of ['banka', 'mulm', 'banka', 'bankb', 'boss']) {
      const committed = commitInteraction(level, session, id);

      expect(committed.result.ok).toBe(true);
      session = committed.session;
    }

    expect(session.actions).toEqual([
      'banka',
      'mulm',
      'banka',
      'bankb',
      'boss',
    ]);
    expect(session.present.phase).toBe('won');
    expect(session.past).toHaveLength(5);
  });

  it('rejects mismatched level or revision', () => {
    const session = createSession(level);
    const other: Level = { ...level, revision: level.revision + 1 };

    expect(() => commitInteraction(other, session, 'banka')).toThrow();
  });

  it('undo restores every part of a sacrifice', () => {
    let session = createSession(level);

    session = commitInteraction(level, session, 'banka').session;

    const afterBank = session.present;

    expect(afterBank.spareLives).toBe(0);
    expect(afterBank.enemies.get('banka')).toBe(13n);

    session = undo(session);
    const restored = session.present;

    expect(restored.value).toBe(5n);
    expect(restored.spareLives).toBe(1);
    expect(restored.enemies.get('banka')).toBe(8n);
    expect(restored.position).toBe(level.startCell);
    expect(restored.usedOps.size).toBe(0);
    expect(session.actions).toEqual([]);
  });

  it('supports undo after victory and after terminal loss', () => {
    // Undo after victory.
    let session = createSession(level);

    for (const id of ['banka', 'mulm', 'banka', 'bankb', 'boss']) {
      session = commitInteraction(level, session, id).session;
    }

    expect(session.present.phase).toBe('won');

    session = undo(session);

    expect(session.present.phase).toBe('playing');
    expect(session.present.value).toBe(49n);

    // Undo after terminal loss: spend the life on the wrong bank, then
    // run out of lives against the boss.
    let lossSession = createSession(level);

    lossSession = commitInteraction(level, lossSession, 'bankb').session;
    lossSession = commitInteraction(level, lossSession, 'mulm').session;
    lossSession = commitInteraction(level, lossSession, 'boss').session;

    expect(lossSession.present.phase).toBe('lost');

    lossSession = undo(lossSession);

    expect(lossSession.present.phase).toBe('playing');
    expect(lossSession.present.value).toBe(15n);
  });

  it('replay reconstructs the exact same state', () => {
    let session = createSession(level);

    for (const id of ['banka', 'mulm', 'banka', 'bankb', 'boss']) {
      session = commitInteraction(level, session, id).session;
    }

    const replayed = restoreSession(level, session.actions);

    expect(replayed.actions).toEqual(session.actions);
    expect(replayed.present.value).toBe(session.present.value);
    expect(replayed.present.phase).toBe(session.present.phase);
    expect(replayed.present.spareLives).toBe(session.present.spareLives);
    expect(replayed.present.position).toBe(session.present.position);
    expect([...replayed.present.enemies.entries()]).toEqual([
      ...session.present.enemies.entries(),
    ]);
    expect([...replayed.present.usedOps]).toEqual([...session.present.usedOps]);
    // The whole undo history is reconstructed too.
    expect(replayed.past).toHaveLength(session.past.length);
    expect(replayed.past[2]?.value).toBe(session.past[2]?.value);
  });

  it('rejects invalid saved action logs', () => {
    expect(() => restoreSession(level, ['triple', 'nope'])).toThrow();
  });

  it('rejects a log that fights the boss twice', () => {
    // After winning, the boss is gone; replaying another action fails.
    expect(() =>
      restoreSession(level, ['bank', 'triple', 'bank', 'boss', 'bank'])
    ).toThrow();
  });

  it('undo at the start of an attempt is a no-op', () => {
    const session: Session = createSession(level);

    expect(undo(session)).toBe(session);
  });
});
