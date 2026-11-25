import { useCallback, useEffect, useState } from 'react';
import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import type {
  LeaderboardRealtimeMessage,
  LeaderboardResponse,
  LeaderboardRow,
} from '../../shared/api';
import { getJson } from '../api';
import { leaderboardChannel } from '../../shared/leaderboard-channel';
import type { Difficulty } from '../../shared/season';

export function useLeaderboard(date: string, difficulty: Difficulty = 'easy') {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<LeaderboardResponse>(
        `/api/leaderboard?date=${date}&difficulty=${difficulty}`
      );
      setRows(data.rows);
    } catch {
      // Keep the previous rows on a transient failure.
    } finally {
      setLoading(false);
    }
  }, [date, difficulty]);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await getJson<LeaderboardResponse>(
          `/api/leaderboard?date=${date}&difficulty=${difficulty}`
        );
        if (!cancelled) setRows(data.rows);
      } catch {
        // Keep the previous rows on a transient failure.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    const channel = leaderboardChannel(date, difficulty);
    try {
      connectRealtime<LeaderboardRealtimeMessage>({
        channel,
        onMessage: (msg) => {
          if (
            msg.type === 'lb-update' &&
            msg.date === date &&
            msg.difficulty === difficulty
          )
            void refresh();
        },
      });
    } catch {
      // Realtime is a bonus; the leaderboard still loads over HTTP.
    }

    return () => {
      cancelled = true;
      disconnectRealtime(channel);
    };
  }, [date, difficulty, refresh]);

  return { rows, loading, refresh };
}
