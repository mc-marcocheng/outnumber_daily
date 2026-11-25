import { useCallback, useEffect, useRef, useState } from 'react';
import { compileLevel } from '../../shared/game/level-schema';
import type {
  GameState,
  InteractionResult,
  Level,
} from '../../shared/game/model';
import { fromWireEvent, fromWireState } from '../../shared/wire';
import type {
  MoveResponse,
  PuzzleResponse,
  RestartResponse,
  UndoResponse,
} from '../../shared/api';
import { getJson, postJson } from '../api';
import { type Difficulty } from '../../shared/season';
import type { DifficultyProgress } from '../../shared/api';
import { rememberDifficulty } from '../app/difficulty-preference';

export type CommitOutcome = {
  result: Extract<InteractionResult, { ok: true }>;
  completed: boolean;
};

export function useDailyGame(
  selectedDate?: string,
  difficulty: Difficulty = 'easy'
) {
  const [loadVersion, setLoadVersion] = useState(0);
  const revision = useRef(0);
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [postDate, setPostDate] = useState('');
  const [progress, setProgress] = useState<Record<
    Difficulty,
    DifficultyProgress
  > | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [steps, setSteps] = useState(0);
  const [actions, setActions] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [parActions, setParActions] = useState(0);
  const [parSteps, setParSteps] = useState<number | null>(null);
  const [bestSteps, setBestSteps] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hintSolution, setHintSolution] = useState<readonly string[] | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const requestRevision = revision.current;
    const load = async () => {
      try {
        const query = `?difficulty=${difficulty}${selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : ''}`;
        const data = await getJson<PuzzleResponse>(`/api/puzzle${query}`);
        if (cancelled || revision.current !== requestRevision) return;
        setLevel(compileLevel(data.level));
        setState(fromWireState(data.state));
        setDate(data.date);
        setProgress(data.progress);
        setPostDate(data.postDate);
        rememberDifficulty(difficulty);
        setSteps(data.steps);
        setActions(data.actions);
        setCompleted(data.completed);
        setParActions(data.parActions);
        setParSteps(data.parSteps);
        setBestSteps(data.bestSteps);
        setAvatarUrl(data.avatarUrl);
        setHintSolution(data.hintSolution);
        setError(null);
        loaded.current = true;
        setLoading(false);
      } catch (err) {
        if (!cancelled && revision.current === requestRevision) {
          if (!loaded.current)
            setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, difficulty, loadVersion]);

  const commit = useCallback(
    async (tileId: string): Promise<CommitOutcome | null> => {
      if (!level || !state) return null;
      revision.current++;
      try {
        const data = await postJson<MoveResponse>('/api/move', {
          date,
          difficulty,
          tileId,
        });
        const next = fromWireState(data.state);
        setState(next);
        setSteps(data.steps);
        setActions(data.actions);
        setCompleted(data.completed);
        setProgress((previous) => {
          if (!previous) return previous;
          const current = previous[difficulty];
          return {
            ...previous,
            [difficulty]: {
              ...current,
              started: true,
              completed: current.completed || data.completed,
              bestSteps: data.completed
                ? current.bestSteps === null
                  ? data.steps
                  : Math.min(current.bestSteps, data.steps)
                : current.bestSteps,
            },
          };
        });
        if (data.completed) {
          setBestSteps((prev) =>
            prev === null ? data.steps : Math.min(prev, data.steps)
          );
        }
        return {
          result: {
            ok: true,
            state: next,
            path: data.path,
            event: fromWireEvent(data.event),
          },
          completed: data.completed,
        };
      } catch {
        return null;
      }
    },
    [level, state, date, difficulty]
  );

  const undo = useCallback(async (): Promise<boolean> => {
    revision.current++;
    try {
      const data = await postJson<UndoResponse>('/api/undo', {
        date,
        difficulty,
      });
      setState(fromWireState(data.state));
      setSteps(data.steps);
      setActions(data.actions);
      setCompleted(false);
      return true;
    } catch {
      return false;
    }
  }, [date, difficulty]);

  const restart = useCallback(async (): Promise<boolean> => {
    revision.current++;
    try {
      const data = await postJson<RestartResponse>('/api/restart', {
        date,
        difficulty,
      });
      setState(fromWireState(data.state));
      setSteps(data.steps);
      setActions(data.actions);
      setCompleted(false);
      return true;
    } catch {
      return false;
    }
  }, [date, difficulty]);

  return {
    loading,
    error,
    date,
    postDate,
    difficulty,
    progress,
    level,
    state,
    steps,
    actions,
    completed,
    parActions,
    parSteps,
    bestSteps,
    avatarUrl,
    hintSolution,
    commit,
    undo,
    restart,
    refresh: () => setLoadVersion((version) => version + 1),
    retry: () => {
      setLoading(true);
      setError(null);
      setLoadVersion((version) => version + 1);
    },
  } as const;
}
