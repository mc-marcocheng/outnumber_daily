import type { RawLevel } from './game/level-schema';
import type { WireEvent, WireState } from './wire';
import type { Difficulty } from './season';

export type DifficultyProgress = {
  completed: boolean;
  started: boolean;
  bestSteps: number | null;
};

export type DailyMeta = {
  date: string;
  difficulty: Difficulty;
  levelId: string;
  title: string;
  parActions: number;
  parSteps: number | null;
  completed: boolean;
  bestSteps: number | null;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  postDate: string;
  difficulty: Difficulty;
  username: string;
  avatarUrl: string | null;
  date: string;
  streak: number;
  today: DailyMeta;
};

export type ArchiveResponse = {
  type: 'archive';
  difficulty: Difficulty;
  today: string;
  firstDate: string;
  month: string;
  days: {
    date: string;
    completed: boolean;
    started: boolean;
    bestSteps: number | null;
  }[];
};

export type PuzzleResponse = {
  type: 'puzzle';
  date: string;
  postDate: string;
  difficulty: Difficulty;
  progress: Record<Difficulty, DifficultyProgress>;
  level: RawLevel;
  parActions: number;
  parSteps: number | null;
  state: WireState;
  steps: number;
  actions: number;
  completed: boolean;
  bestSteps: number | null;
  avatarUrl: string | null;
  /** Step-optimal witness from the certificate; the progressive-hint source. */
  hintSolution: readonly string[] | null;
};

export type MoveResponse = {
  type: 'move';
  state: WireState;
  event: WireEvent;
  path: number[];
  steps: number;
  actions: number;
  completed: boolean;
};

export type UndoResponse = {
  type: 'undo';
  state: WireState;
  steps: number;
  actions: number;
};

export type RestartResponse = {
  type: 'restart';
  state: WireState;
  steps: number;
  actions: number;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export type LeaderboardRow = {
  userId: string;
  username: string;
  steps: number;
  rank: number;
};

export type EndCard = {
  steps: number;
  parSteps: number | null;
  parActions: number;
  actions: number;
  bestSteps: number | null;
  rank: number | null;
  streak: number;
  flairMilestone: string | null;
};

export type CompleteResponse = {
  type: 'complete';
  endCard: EndCard;
};

export type ShareResultResponse = {
  type: 'share-result';
  commentId: string;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  date: string;
  difficulty: Difficulty;
  rows: LeaderboardRow[];
};

export type LeaderboardRealtimeMessage = {
  type: 'lb-update';
  date: string;
  difficulty: Difficulty;
  userId: string;
  steps: number;
};
