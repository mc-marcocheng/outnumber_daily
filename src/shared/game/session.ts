import { initialState, interact } from './engine';
import type { GameState, InteractionResult, Level } from './model';

export type Session = Readonly<{
  levelId: string;
  revision: number;
  present: GameState;
  past: readonly GameState[];
  actions: readonly string[];
}>;

export function createSession(level: Level): Session {
  return {
    levelId: level.id,
    revision: level.revision,
    present: initialState(level),
    past: [],
    actions: [],
  };
}

export function commitInteraction(
  level: Level,
  session: Session,
  tileId: string
): {
  session: Session;
  result: InteractionResult;
} {
  if (session.levelId !== level.id || session.revision !== level.revision) {
    throw new Error('Session and level do not match');
  }

  const result = interact(level, session.present, tileId);

  if (!result.ok) {
    return { session, result };
  }

  return {
    session: {
      ...session,
      present: result.state,
      past: [...session.past, session.present],
      actions: [...session.actions, tileId],
    },
    result,
  };
}

export function undo(session: Session): Session {
  const previous =
    session.past.length > 0 ? session.past[session.past.length - 1] : undefined;

  if (!previous) return session;

  return {
    ...session,
    present: previous,
    past: session.past.slice(0, -1),
    actions: session.actions.slice(0, -1),
  };
}

export function restoreSession(
  level: Level,
  actions: readonly string[]
): Session {
  let session = createSession(level);

  for (const tileId of actions) {
    const committed = commitInteraction(level, session, tileId);

    if (!committed.result.ok) {
      throw new Error(
        `Invalid saved action ${tileId}: ${committed.result.reason}`
      );
    }

    session = committed.session;
  }

  return session;
}
