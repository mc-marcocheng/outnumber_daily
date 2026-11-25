import type { Cell, InteractionEvent } from '../../shared/game/model';

export type PresentationPhase =
  'walk' | 'contact' | 'effect' | 'fade-out' | 'respawn' | 'finish';

/** Outcome feedback layered on the token once the effect is revealed. */
export type JuiceKind = 'absorb' | 'win' | 'loss' | 'respawn' | 'bank';

export type PresentationFrame = {
  /** Offset from animation start. The whole plan is built up front. */
  atMs: number;
  phase: PresentationPhase;
  /** Where the player token is shown during this frame. */
  cell: Cell;
  playerValue: bigint;
  showPlayer: boolean;
  /** Reveal the interaction's effect on the target enemy. */
  revealed: boolean;
  /** CSS transition duration used to arrive at this frame's cell. */
  stepMs: number;
  /** Optional juice class applied while this frame is revealed. */
  juice?: JuiceKind;
};

export type TimelinePlan = {
  frames: readonly PresentationFrame[];
  totalMs: number;
};

export const WALK_MS_PER_CELL = 200;
export const CONTACT_MS = 200;
export const EFFECT_MS = 160;
export const FADE_MS = 120;
export const RESPAWN_GAP_MS = 130;
export const RESPAWN_APPEAR_MS = 160;

/**
 * Build the complete presentation timeline for one committed
 * interaction before any timer is scheduled. Respawn shows a
 * disappearance and reappearance at the level's actual starting cell —
 * never a walk backwards along the approach path.
 */
export function buildTimeline(
  path: readonly Cell[],
  event: InteractionEvent,
  startCell: Cell
): TimelinePlan {
  const steps = Math.max(path.length - 1, 0);
  const stepMs = steps === 0 ? 0 : WALK_MS_PER_CELL;

  const targetCell = path[path.length - 1] ?? startCell;
  const frames: PresentationFrame[] = steps
    ? [
        {
          atMs: 0,
          phase: 'walk',
          cell: path[0] ?? startCell,
          playerValue: event.playerBefore,
          showPlayer: true,
          revealed: false,
          stepMs: 0,
        },
      ]
    : [];

  let t: number;

  for (let step = 1; step <= steps; step += 1) {
    t = 32 + (step - 1) * stepMs;
    frames.push({
      atMs: t,
      phase: 'walk',
      cell: path[step],
      playerValue: event.playerBefore,
      showPlayer: true,
      revealed: false,
      stepMs,
    });
  }
  t = steps ? 32 + steps * stepMs : 0;

  if (event.kind === 'walk') {
    frames.push({
      atMs: t,
      phase: 'finish',
      cell: targetCell,
      playerValue: event.playerAfter,
      showPlayer: true,
      revealed: true,
      stepMs: 0,
    });
    return { frames, totalMs: t };
  }

  // Contact: highlight the target; the arithmetic outcome is not
  // revealed yet.
  frames.push({
    atMs: t,
    phase: 'contact',
    cell: targetCell,
    playerValue: event.playerBefore,
    showPlayer: true,
    revealed: false,
    stepMs,
  });

  t += CONTACT_MS;

  // Effect: committed values become visible; for combat this means the
  // enemy grows (deliberate defeat / loss) or disappears (absorb/win).
  const revealed = true;

  if (event.kind === 'respawn' || event.kind === 'loss') {
    const juice: JuiceKind = event.kind === 'respawn' ? 'respawn' : 'loss';

    frames.push({
      atMs: t,
      phase: 'effect',
      cell: targetCell,
      playerValue: event.playerAfter,
      showPlayer: event.kind === 'respawn',
      revealed,
      stepMs: 0,
      juice,
    });

    t += FADE_MS;
    frames.push({
      atMs: t,
      phase: 'fade-out',
      cell: targetCell,
      playerValue: event.playerAfter,
      showPlayer: false,
      revealed,
      stepMs: 0,
      juice,
    });

    t += RESPAWN_GAP_MS;

    if (event.kind === 'respawn') {
      frames.push({
        atMs: t,
        phase: 'respawn',
        cell: startCell,
        playerValue: event.playerAfter,
        showPlayer: true,
        revealed,
        stepMs: RESPAWN_APPEAR_MS,
        juice,
      });

      t += RESPAWN_APPEAR_MS;
    }

    frames.push({
      atMs: t,
      phase: 'finish',
      cell: startCell,
      playerValue: event.playerAfter,
      showPlayer: event.kind === 'respawn',
      revealed,
      stepMs: 0,
      juice,
    });

    return { frames, totalMs: t };
  }

  const juice: JuiceKind =
    event.kind === 'win' ? 'win' : event.kind === 'absorb' ? 'absorb' : 'bank';

  frames.push({
    atMs: t,
    phase: 'effect',
    cell: targetCell,
    playerValue: event.playerAfter,
    showPlayer: true,
    revealed,
    stepMs: 0,
    juice,
  });

  t += EFFECT_MS;
  frames.push({
    atMs: t,
    phase: 'finish',
    cell: targetCell,
    playerValue: event.playerAfter,
    showPlayer: true,
    revealed,
    stepMs: 0,
    juice,
  });

  return { frames, totalMs: t };
}
