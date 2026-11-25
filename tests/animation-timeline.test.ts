import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/client/presentation/animation-timeline';
import type { InteractionEvent } from '../src/shared/game/model';

function event(
  kind: InteractionEvent['kind'],
  extra: Partial<InteractionEvent> = {}
): InteractionEvent {
  return {
    kind,
    tileId: 'target',
    playerBefore: 4n,
    playerAfter: 9n,
    ...extra,
  };
}

describe('animation timeline', () => {
  it('produces monotonic timestamps', () => {
    const plan = buildTimeline([0, 1, 2, 5], event('absorb'), 0);

    for (let i = 1; i < plan.frames.length; i += 1) {
      expect(plan.frames[i].atMs).toBeGreaterThanOrEqual(
        plan.frames[i - 1].atMs
      );
    }

    expect(plan.totalMs).toBe(plan.frames[plan.frames.length - 1].atMs);
  });

  it('walks the approach path in order', () => {
    const plan = buildTimeline([0, 1, 2], event('absorb'), 0);
    const walk = plan.frames.filter((frame) => frame.phase === 'walk');

    expect(walk.map((frame) => frame.cell)).toEqual([0, 1, 2]);
  });

  it('paints the origin and retains a one-cell overlay until arrival', () => {
    const plan = buildTimeline([4, 5], event('walk'), 4);
    expect(plan.frames[0]).toMatchObject({ cell: 4, atMs: 0 });
    const destination = plan.frames.find(
      (frame) => frame.cell === 5 && frame.phase === 'walk'
    )!;
    expect(destination.stepMs).toBe(200);
    expect(plan.totalMs).toBeGreaterThanOrEqual(
      destination.atMs + destination.stepMs
    );
  });

  it("ends respawns at the level's starting cell, not a reversed path", () => {
    const plan = buildTimeline(
      [7, 8, 12],
      event('respawn', { playerAfter: 4n, enemyAfter: 11n }),
      7
    );

    const respawn = plan.frames.find((frame) => frame.phase === 'respawn');
    const finish = plan.frames[plan.frames.length - 1];

    expect(respawn?.cell).toBe(7);
    expect(finish.cell).toBe(7);
    expect(finish.showPlayer).toBe(true);

    // The token must vanish before reappearing at the start.
    const fadeOut = plan.frames.find((frame) => frame.phase === 'fade-out');
    expect(fadeOut?.showPlayer).toBe(false);
    expect(fadeOut?.atMs).toBeLessThan(respawn!.atMs);
  });

  it('reveals the grown enemy before respawning', () => {
    const plan = buildTimeline(
      [7, 12],
      event('respawn', { playerAfter: 4n, enemyAfter: 11n }),
      7
    );

    const effect = plan.frames.find((frame) => frame.phase === 'effect');

    expect(effect?.revealed).toBe(true);
    expect(effect?.playerValue).toBe(4n);
  });

  it('hides the player for a terminal loss', () => {
    const plan = buildTimeline(
      [3, 4],
      event('loss', { playerAfter: 0n, enemyAfter: 15n }),
      3
    );

    const finish = plan.frames[plan.frames.length - 1];

    expect(finish.showPlayer).toBe(false);
    expect(plan.frames.every((frame) => frame.phase !== 'respawn')).toBe(true);
  });

  it('keeps the player at the target for ordinary operations', () => {
    const plan = buildTimeline([3, 4, 5], event('multiply'), 3);
    const finish = plan.frames[plan.frames.length - 1];

    expect(finish.cell).toBe(5);
    expect(finish.showPlayer).toBe(true);
    expect(finish.playerValue).toBe(9n);
  });

  it('schedules zero-length walks when already adjacent', () => {
    const plan = buildTimeline([4], event('absorb'), 4);

    expect(plan.frames[0].phase).toBe('contact');
    expect(plan.frames[0].atMs).toBe(0);
  });

  it('tags revealed frames with outcome juice, never the walk', () => {
    const cases: [InteractionEvent['kind'], string][] = [
      ['absorb', 'absorb'],
      ['win', 'win'],
      ['multiply', 'bank'],
      ['add', 'bank'],
      ['set', 'bank'],
      ['respawn', 'respawn'],
      ['loss', 'loss'],
    ];

    for (const [kind, juice] of cases) {
      const plan = buildTimeline([0, 1, 2], event(kind), 0);

      for (const frame of plan.frames) {
        if (frame.phase === 'walk' || frame.phase === 'contact') {
          expect(frame.juice).toBeUndefined();
        } else {
          expect(frame.juice).toBe(juice);
        }
      }
    }
  });
});
