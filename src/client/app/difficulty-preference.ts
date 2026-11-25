import { z } from 'zod';
import {
  DIFFICULTIES,
  isDifficulty,
  type Difficulty,
  type PuzzleIdentity,
} from '../../shared/season';

const handoffSchema = z.object({
  date: z.iso
    .date()
    .refine((date) => date <= new Date().toISOString().slice(0, 10)),
  difficulty: z.enum(DIFFICULTIES),
});

export function rememberDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem('outnumber-difficulty', difficulty);
  } catch {
    return;
  }
}

export function restoredDifficulty(): Difficulty {
  try {
    const value = localStorage.getItem('outnumber-difficulty');
    return isDifficulty(value) ? value : 'easy';
  } catch {
    return 'easy';
  }
}

export function rememberIdentity(
  postId: string,
  identity: PuzzleIdentity
): void {
  try {
    sessionStorage.setItem(
      `outnumber-expand:${postId}`,
      JSON.stringify(identity)
    );
  } catch {
    return;
  }
}

export function restoredIdentity(postId: string): PuzzleIdentity | undefined {
  try {
    const key = `outnumber-expand:${postId}`;
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    const parsed = handoffSchema.safeParse(JSON.parse(value ?? 'null'));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
