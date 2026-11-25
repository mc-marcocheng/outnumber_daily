// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDailyGame } from '../src/client/hooks/useDailyGame';
import type {
  MoveResponse,
  PuzzleResponse,
  RestartResponse,
  UndoResponse,
} from '../src/shared/api';
import { initialState, interact } from '../src/shared/game/engine';
import { compileLevel, type RawLevel } from '../src/shared/game/level-schema';
import { fromWireState, toWireEvent, toWireState } from '../src/shared/wire';
import type { Difficulty } from '../src/shared/season';

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn() }));
vi.mock('../src/client/api', () => mocks);

const rawLevel: RawLevel = {
  formatVersion: 1,
  id: 'daily-hook',
  revision: 1,
  title: 'Daily hook',
  width: 3,
  terrain: ['...'],
  startCell: 0,
  startValue: '2',
  spareLives: 0,
  tiles: [
    { id: 'add', kind: 'add', cell: 1, amount: '3' },
    { id: 'boss', kind: 'boss', cell: 2, value: '4' },
  ],
};
const level = compileLevel(rawLevel);
const startingState = initialState(level);
const addition = interact(level, startingState, 'add');
if (!addition.ok) throw new Error(addition.reason);

const puzzle: PuzzleResponse = {
  postDate: '2026-11-14',
  difficulty: 'easy',
  progress: {
    easy: { completed: false, started: false, bestSteps: null },
    medium: { completed: false, started: false, bestSteps: null },
    hard: { completed: false, started: false, bestSteps: null },
  },
  type: 'puzzle',
  date: '2026-11-14',
  level: rawLevel,
  state: toWireState(startingState),
  steps: 0,
  actions: 0,
  completed: false,
  parActions: 2,
  parSteps: 2,
  bestSteps: null,
  avatarUrl: null,
  hintSolution: ['add', 'boss'],
};
const move: MoveResponse = {
  type: 'move',
  state: toWireState(addition.state),
  event: toWireEvent(addition.event),
  path: [...addition.path],
  steps: 1,
  actions: 1,
  completed: false,
};
const refreshed: PuzzleResponse = {
  ...puzzle,
  date: '2026-11-15',
  level: { ...rawLevel, id: 'daily-refreshed', title: 'Refreshed daily' },
  state: move.state,
  steps: 1,
  actions: 1,
  parActions: 3,
  parSteps: 4,
  bestSteps: 5,
  avatarUrl: 'https://example.com/avatar.png',
  hintSolution: ['boss'],
};

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let current: ReturnType<typeof useDailyGame> | undefined;
function game() {
  if (!current) throw new Error('Hook is not mounted');
  return current;
}

function Probe({
  date,
  difficulty,
}: {
  date?: string;
  difficulty?: Difficulty;
}) {
  current = useDailyGame(date, difficulty);
  return createElement(
    'output',
    null,
    current.state?.value.toString() ?? 'pending'
  );
}

const container = document.createElement('div');
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  current = undefined;
  localStorage.clear();
  vi.resetAllMocks();
});

async function mount(data: PuzzleResponse = puzzle) {
  mocks.getJson.mockResolvedValueOnce(data);
  await act(async () => root.render(createElement(Probe)));
  expectPuzzle(data);
}

function expectPuzzle(data: PuzzleResponse) {
  expect(game()).toMatchObject({
    loading: false,
    error: null,
    date: data.date,
    level: compileLevel(data.level),
    state: fromWireState(data.state),
    steps: data.steps,
    actions: data.actions,
    completed: data.completed,
    parActions: data.parActions,
    parSteps: data.parSteps,
    bestSteps: data.bestSteps,
    avatarUrl: data.avatarUrl,
    hintSolution: data.hintSolution,
  });
}

describe('daily game loading lifecycle', () => {
  it('remembers a requested difficulty only after its retry succeeds', async () => {
    localStorage.setItem('outnumber-difficulty', 'medium');
    const retry = deferred<PuzzleResponse>();
    mocks.getJson
      .mockRejectedValueOnce(new Error('Offline'))
      .mockReturnValueOnce(retry.promise);
    await act(async () =>
      root.render(createElement(Probe, { difficulty: 'hard' }))
    );
    expect(game().error).toBe('Offline');
    expect(localStorage.getItem('outnumber-difficulty')).toBe('medium');
    await act(async () => game().retry());
    expect(localStorage.getItem('outnumber-difficulty')).toBe('medium');
    await act(async () => retry.resolve({ ...puzzle, difficulty: 'hard' }));
    expectPuzzle({ ...puzzle, difficulty: 'hard' });
    expect(localStorage.getItem('outnumber-difficulty')).toBe('hard');
  });

  it('ignores an old difficulty load after another difficulty opens', async () => {
    const pending = deferred<PuzzleResponse>();
    mocks.getJson.mockReturnValueOnce(pending.promise);
    await act(async () =>
      root.render(createElement(Probe, { difficulty: 'easy' }))
    );
    const hardPuzzle: PuzzleResponse = { ...refreshed, difficulty: 'hard' };
    mocks.getJson.mockResolvedValueOnce(hardPuzzle);
    await act(async () =>
      root.render(createElement(Probe, { difficulty: 'hard' }))
    );
    expectPuzzle(hardPuzzle);
    expect(localStorage.getItem('outnumber-difficulty')).toBe('hard');
    await act(async () => pending.resolve(puzzle));
    expectPuzzle(hardPuzzle);
    expect(localStorage.getItem('outnumber-difficulty')).toBe('hard');
  });

  it('exposes an initial failure and retries successfully', async () => {
    const retry = deferred<PuzzleResponse>();
    mocks.getJson
      .mockRejectedValueOnce(new Error('Offline'))
      .mockReturnValueOnce(retry.promise);
    await act(async () =>
      root.render(createElement(Probe, { date: puzzle.date }))
    );
    expect(game()).toMatchObject({
      loading: false,
      error: 'Offline',
      level: null,
      state: null,
    });

    await act(async () => game().retry());
    expect(game()).toMatchObject({ loading: true, error: null, state: null });
    await act(async () => retry.resolve(puzzle));

    expectPuzzle(puzzle);
    expect(mocks.getJson.mock.calls).toEqual([
      ['/api/puzzle?difficulty=easy&date=2026-11-14'],
      ['/api/puzzle?difficulty=easy&date=2026-11-14'],
    ]);
    expect(mocks.postJson).not.toHaveBeenCalled();
  });

  it('retains the board without an error when a background refresh fails', async () => {
    await mount();
    const previousState = game().state;
    const refresh = deferred<PuzzleResponse>();
    mocks.getJson.mockReturnValueOnce(refresh.promise);
    await act(async () => game().refresh());
    expectPuzzle(puzzle);
    await act(async () => refresh.reject(new Error('Offline')));

    expectPuzzle(puzzle);
    expect(game().state).toBe(previousState);
    expect(mocks.getJson).toHaveBeenCalledTimes(2);
  });

  it('does not let a delayed refresh overwrite a newer committed move', async () => {
    await mount();
    const refresh = deferred<PuzzleResponse>();
    mocks.getJson.mockReturnValueOnce(refresh.promise);
    await act(async () => game().refresh());
    mocks.postJson.mockResolvedValueOnce(move);
    await act(async () => {
      expect(await game().commit('add')).toEqual({
        result: addition,
        completed: false,
      });
    });
    const committedState = game().state;
    const committedPuzzle = { ...puzzle, ...move, type: puzzle.type };
    expectPuzzle(committedPuzzle);
    await act(async () => refresh.resolve(refreshed));

    expectPuzzle(committedPuzzle);
    expect(game().state).toBe(committedState);
    expect(mocks.postJson).toHaveBeenCalledExactlyOnceWith('/api/move', {
      date: puzzle.date,
      difficulty: 'easy',
      tileId: 'add',
    });
  });

  it.each<{ operation: 'undo' | 'restart' }>([
    { operation: 'undo' },
    { operation: 'restart' },
  ])(
    'does not let a delayed refresh overwrite $operation',
    async ({ operation }) => {
      const restored = { ...puzzle, completed: true, steps: 2, actions: 2 };
      await mount(restored);
      const refresh = deferred<PuzzleResponse>();
      mocks.getJson.mockReturnValueOnce(refresh.promise);
      await act(async () => game().refresh());
      const response: UndoResponse | RestartResponse = {
        type: operation,
        state: operation === 'undo' ? move.state : puzzle.state,
        steps: operation === 'undo' ? 1 : 0,
        actions: operation === 'undo' ? 1 : 0,
      };
      mocks.postJson.mockResolvedValueOnce(response);
      await act(async () => {
        expect(await game()[operation]()).toBe(true);
      });
      const updatedPuzzle = { ...puzzle, ...response, type: puzzle.type };
      const updatedState = game().state;
      expectPuzzle(updatedPuzzle);
      await act(async () => refresh.resolve(refreshed));

      expectPuzzle(updatedPuzzle);
      expect(game().state).toBe(updatedState);
      expect(mocks.postJson).toHaveBeenCalledExactlyOnceWith(
        `/api/${operation}`,
        {
          date: puzzle.date,
          difficulty: 'easy',
        }
      );
    }
  );

  it('applies the board and metadata from a successful refresh', async () => {
    await mount();
    const refresh = deferred<PuzzleResponse>();
    mocks.getJson.mockReturnValueOnce(refresh.promise);
    await act(async () => game().refresh());
    expectPuzzle(puzzle);
    await act(async () => refresh.resolve({ ...refreshed, completed: true }));

    expectPuzzle({ ...refreshed, completed: true });
    expect(container.textContent).toBe('5');
    expect(mocks.getJson.mock.calls).toEqual([
      ['/api/puzzle?difficulty=easy'],
      ['/api/puzzle?difficulty=easy'],
    ]);
  });

  it.each(['resolve', 'reject'])(
    'ignores a pending load that settles after unmount (%s)',
    async (settlement) => {
      const pending = deferred<PuzzleResponse>();
      mocks.getJson.mockReturnValueOnce(pending.promise);
      await act(async () => root.render(createElement(Probe)));
      expect(game()).toMatchObject({ loading: true, error: null, state: null });
      await act(async () => root.render(null));
      expect(container.textContent).toBe('');
      await mount(refreshed);
      const remountedState = game().state;
      await act(async () => {
        if (settlement === 'resolve') pending.resolve(puzzle);
        else pending.reject(new Error('Old request failed'));
      });

      expectPuzzle(refreshed);
      expect(game().state).toBe(remountedState);
      expect(container.textContent).toBe('5');
    }
  );
});
