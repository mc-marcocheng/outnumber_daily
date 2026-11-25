import { useEffect, useRef, useState } from 'react';
import type { CompleteResponse, EndCard } from '../../shared/api';
import { postJson } from '../api';
import type { Difficulty } from '../../shared/season';

/**
 * Finalize a won run exactly once: the server recomputes the score,
 * records the leaderboard entry, advances the streak, and returns the
 * end card. Resets when the player starts a fresh run.
 */
export function useEndCard(
  date: string,
  won: boolean,
  difficulty: Difficulty = 'easy'
) {
  const identity = `${date}:${difficulty}`;
  const [endCard, setEndCard] = useState<EndCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [inputs, setInputs] = useState({ identity, won });
  if (inputs.identity !== identity || inputs.won !== won) {
    setInputs({ identity, won });
    setEndCard(null);
    setFailed(false);
  }
  const requestRef = useRef<{
    date: string;
    promise: Promise<CompleteResponse>;
  } | null>(null);

  useEffect(() => {
    if (!won) {
      requestRef.current = null;
      return;
    }
    if (!date) return;
    if (requestRef.current?.date !== identity) {
      requestRef.current = {
        date: identity,
        promise: postJson<CompleteResponse>('/api/complete', {
          date,
          difficulty,
        }),
      };
    }
    const request = requestRef.current;

    let cancelled = false;
    request.promise
      .then((data) => {
        if (!cancelled) setEndCard(data.endCard);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
        if (requestRef.current === request) requestRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [won, date, difficulty, identity, attempt]);

  return {
    endCard: won ? endCard : null,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((value) => value + 1);
    },
  };
}
