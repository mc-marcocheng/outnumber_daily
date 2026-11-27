import { describe, expect, it } from 'vitest';
import {
  guidedActions,
  guidedLevel,
  guidedPages,
  lessons,
} from '../src/client/tutorials/lessons';
import { ruleDemos } from '../src/client/tutorials/rule-demos';
import {
  commitInteraction,
  createSession,
  restoreSession,
} from '../src/shared/game/session';
import { initialState, interact } from '../src/shared/game/engine';
import { buildTimeline } from '../src/client/presentation/animation-timeline';
import {
  analyzeReachability,
  canonicalStateKey,
} from '../src/shared/game/reachability';
import type { GameState } from '../src/shared/game/model';

function winningRoutes(lesson: (typeof lessons)[number]): string[][] {
  const queue: { state: GameState; actions: string[] }[] = [
    { state: initialState(lesson.level), actions: [] },
  ];
  const visited = new Set<string>();
  const wins: string[][] = [];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const key = `${canonicalStateKey(lesson.level, current.state)}:${current.actions.join(',')}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.state.phase === 'won') {
      wins.push(current.actions);
      continue;
    }
    if (current.state.phase !== 'playing') continue;
    for (const target of analyzeReachability(lesson.level, current.state)
      .targetIds) {
      const result = interact(lesson.level, current.state, target);
      if (result.ok)
        queue.push({
          state: result.state,
          actions: [...current.actions, target],
        });
    }
  }
  return wins;
}

describe('tutorial routes', () => {
  it('plays every looping rule demo to a win', () => {
    for (const { level, solution } of new Set(Object.values(ruleDemos))) {
      expect(restoreSession(level, solution).present.phase, level.id).toBe(
        'won'
      );
    }
  });

  it('orders prerequisite lessons before reducing operations and removes redundant combat practice', () => {
    expect(lessons.map((lesson) => lesson.id)).toEqual([
      'walking',
      'addition',
      'multiply',
      'undo',
      'window',
      'subtract',
      'divide',
      'set',
      'bank',
      'blocked',
    ]);
  });
  for (const [kind, reason] of [
    ['subtract', 'non-positive-result'],
    ['divide', 'non-integer-result'],
  ]) {
    it(`keeps the ${kind} lesson unchanged after an invalid first attempt`, () => {
      const lesson = lessons.find((item) => item.id === kind)!;
      const session = createSession(lesson.level);
      const outcome = commitInteraction(lesson.level, session, kind!);
      expect(outcome.result).toEqual({ ok: false, reason });
      expect(outcome.session).toBe(session);
      expect(outcome.session.present.usedOps.has(kind!)).toBe(false);
      expect(outcome.session.actions).toEqual([]);
      expect(restoreSession(lesson.level, lesson.solution).present.phase).toBe(
        'won'
      );
    });
  }
  it('places the window lesson choices in left-to-right order', () => {
    const lesson = lessons.find((item) => item.id === 'window')!;
    expect(lesson.level.startCell).toBe(5);
    expect(
      ['trap', 'add', 'window', 'boss'].map(
        (id) => lesson.level.tiles.find((tile) => tile.id === id)!.cell
      )
    ).toEqual([6, 7, 8, 9]);
  });
  it('requires each practice mechanic on every winning route', () => {
    const required: Record<string, readonly string[]> = {
      walking: ['add', 'boss'],
      addition: ['add', 'boss'],
      multiply: ['add', 'multiply', 'boss'],
      set: ['set', 'window', 'boss'],
      subtract: ['add', 'subtract', 'window', 'boss'],
      divide: ['add', 'divide', 'window', 'boss'],
      window: ['add', 'window', 'boss'],
      bank: ['window', 'add', 'window', 'boss'],
      undo: ['enemy', 'multiply', 'boss'],
      blocked: ['add', 'boss'],
    };
    for (const lesson of lessons) {
      const routes = winningRoutes(lesson);
      expect(routes.length, lesson.id).toBeGreaterThan(0);
      for (const route of routes) {
        let next = 0;
        for (const action of route)
          if (action === required[lesson.id]?.[next]) next++;
        expect(next, `${lesson.id}: ${route.join(', ')}`).toBe(
          required[lesson.id]!.length
        );
      }
    }
  });
  it('blocks both corner paths around the set lesson window', () => {
    const lesson = lessons.find((item) => item.id === 'set')!;
    const state = initialState(lesson.level);
    expect(lesson.level.terrain).toEqual(['....#', '.....', '....#']);
    for (const target of ['boss', 'walk:4', 'walk:14']) {
      expect(interact(lesson.level, state, target).ok).toBe(false);
    }
  });
  it('places multiplication first visually but requires addition first', () => {
    const lesson = lessons.find((item) => item.id === 'multiply')!;
    expect(
      lesson.level.tiles.find((tile) => tile.id === 'multiply')!.cell
    ).toBeLessThan(lesson.level.tiles.find((tile) => tile.id === 'add')!.cell);
    expect(
      restoreSession(lesson.level, ['multiply', 'add', 'boss']).present.phase
    ).toBe('lost');
  });
  it('requires banking to change the window before powering up', () => {
    const lesson = lessons.find((item) => item.id === 'bank')!;
    expect(
      restoreSession(lesson.level, ['add', 'window', 'window']).present.phase
    ).toBe('lost');
    expect(
      restoreSession(lesson.level, lesson.solution).present.spareLives
    ).toBe(0);
  });
  it('makes early multiplication a losing resource order', () => {
    const lesson = lessons.find((item) => item.id === 'undo')!;
    expect(
      restoreSession(lesson.level, ['multiply', 'enemy', 'boss']).present.phase
    ).toBe('lost');
  });
  for (const lesson of lessons)
    it(`wins ${lesson.id}`, () => {
      expect(restoreSession(lesson.level, lesson.solution).present.phase).toBe(
        'won'
      );
    });
  it('walks through every guided page with a valid snapshot', () => {
    expect(guidedPages.length).toBe(guidedActions.length + 1);
    expect(restoreSession(guidedLevel, guidedActions).present.phase).toBe(
      'won'
    );
    expect(
      restoreSession(guidedLevel, guidedActions.slice(0, 7)).present.spareLives
    ).toBe(0);
  });
  it('blocks the corridor until the object is used', () => {
    const level = lessons.find((lesson) => lesson.id === 'blocked')!.level;
    expect(interact(level, initialState(level), 'boss').ok).toBe(false);
    expect(interact(level, initialState(level), 'walk:4').ok).toBe(false);
  });
  it('walking has no combat contact, effect or juice', () => {
    const result = interact(guidedLevel, initialState(guidedLevel), 'walk:7');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timeline = buildTimeline(
      result.path,
      result.event,
      guidedLevel.startCell
    );
    expect(
      timeline.frames.every(
        (frame) => frame.phase === 'walk' || frame.phase === 'finish'
      )
    ).toBe(true);
    expect(timeline.frames.every((frame) => !frame.juice)).toBe(true);
  });
});
