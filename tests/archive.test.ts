// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveResponse } from '../src/shared/api';
import { PuzzleArchive } from '../src/client/components/PuzzleArchive';

const mocks = vi.hoisted(() => ({
  today: '2026-11-14',
  getRun: vi.fn(),
  getDaily: vi.fn(),
  getPostDate: vi.fn(),
  saveRun: vi.fn(),
  saveUser: vi.fn(),
  getArchive: vi.fn(),
}));

vi.mock('../src/client/api', () => ({ getJson: mocks.getArchive }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en' },
  }),
}));

vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_player', postId: 't3_old' },
  reddit: {},
  realtime: {},
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => mocks.today,
  getDaily: mocks.getDaily,
}));
vi.mock('../src/server/storage', () => ({
  getRun: mocks.getRun,
  getPostDate: mocks.getPostDate,
  saveRun: mocks.saveRun,
  saveUser: mocks.saveUser,
}));

import { api } from '../src/server/routes/api';

const blankRun = {
  actions: [],
  steps: 0,
  completed: false,
  bestSteps: null,
  bestActions: null,
};

describe('archive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.today = '2026-11-14';
    mocks.getRun.mockResolvedValue(blankRun);
  });

  it('defaults to the current UTC month and returns only bounded status fields', async () => {
    mocks.getRun.mockImplementation(async (date: string) => {
      if (date === '2026-11-12')
        return { ...blankRun, actions: ['walk:1'], steps: 1 };
      if (date === '2026-11-13')
        return {
          ...blankRun,
          actions: ['boss'],
          steps: 3,
          completed: true,
          bestSteps: 3,
          bestActions: 1,
        };
      if (date === '2026-11-14')
        return { ...blankRun, bestSteps: 2, bestActions: 1 };
      return blankRun;
    });
    const expected: ArchiveResponse = {
      difficulty: 'easy',
      type: 'archive',
      today: '2026-11-14',
      firstDate: '2026-11-11',
      month: '2026-11',
      days: [
        {
          date: '2026-11-11',
          completed: false,
          started: false,
          bestSteps: null,
        },
        {
          date: '2026-11-12',
          completed: false,
          started: true,
          bestSteps: null,
        },
        { date: '2026-11-13', completed: true, started: true, bestSteps: 3 },
        { date: '2026-11-14', completed: true, started: true, bestSteps: 2 },
      ],
    };
    const response = await api.request('/archive');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
    expect(mocks.getRun.mock.calls).toEqual(
      expected.days.map(({ date }) => [date, 't2_player', 'easy'])
    );
    expect(mocks.getDaily).not.toHaveBeenCalled();
    expect(mocks.getPostDate).not.toHaveBeenCalled();
    expect(mocks.saveRun).not.toHaveBeenCalled();
    expect(mocks.saveUser).not.toHaveBeenCalled();
  });

  it.each(['2026-10', '2026-12', '2027-01'])(
    'returns no days or run lookups outside the archive: %s',
    async (month) => {
      const response = await api.request(`/archive?month=${month}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        type: 'archive',
        difficulty: 'easy',
        today: mocks.today,
        firstDate: '2026-11-11',
        month,
        days: [],
      });
      expect(mocks.getRun).not.toHaveBeenCalled();
    }
  );

  it('limits a selected historical month to its last calendar day', async () => {
    mocks.today = '2026-12-02';
    const response = await api.request('/archive?month=2026-11');
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.days).toHaveLength(20);
    expect(result.days[0].date).toBe('2026-11-11');
    expect(result.days.at(-1).date).toBe('2026-11-30');
    expect(mocks.getRun).toHaveBeenCalledTimes(20);
  });

  it('includes leap day in a historical February', async () => {
    mocks.today = '2028-03-01';
    const response = await api.request('/archive?month=2028-02');
    const result = await response.json();
    expect(result.days).toHaveLength(29);
    expect(result.days.at(-1).date).toBe('2028-02-29');
  });

  it('uses today as firstDate before the season anchor', async () => {
    mocks.today = '2026-11-09';
    expect(await (await api.request('/archive')).json()).toEqual({
      type: 'archive',
      difficulty: 'easy',
      today: '2026-11-09',
      firstDate: '2026-11-09',
      month: '2026-11',
      days: [
        {
          date: '2026-11-09',
          completed: false,
          started: false,
          bestSteps: null,
        },
      ],
    });
  });

  it.each([
    '',
    '2026-00',
    '2026-13',
    '2026-1',
    '26-11',
    '2026-11-01',
    'invalid',
  ])('rejects invalid months before reading runs: %s', async (month) => {
    expect((await api.request(`/archive?month=${month}`)).status).toBe(400);
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.saveRun).not.toHaveBeenCalled();
  });
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('archive controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.getArchive.mockImplementation(
      async (path: string): Promise<ArchiveResponse> => {
        const params = new URL(path, 'https://example.com').searchParams;
        const difficulty = params.get('difficulty');
        if (
          difficulty !== 'easy' &&
          difficulty !== 'medium' &&
          difficulty !== 'hard'
        ) {
          throw new Error('Invalid difficulty');
        }
        const month = params.get('month') ?? '2026-11';
        return {
          type: 'archive',
          difficulty,
          month,
          today: '2026-12-02',
          firstDate: '2026-11-11',
          days: [
            {
              date: `${month}-12`,
              completed: true,
              started: true,
              bestSteps: 3,
            },
          ],
        };
      }
    );
  });

  it('keeps completed dates available across all three toolbar difficulties and retains the month', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onSelect = vi.fn();
    try {
      await act(async () =>
        root.render(
          createElement(PuzzleArchive, {
            selectedDate: '2026-12-02',
            difficulty: 'hard',
            onSelect,
          })
        )
      );
      expect(
        container.querySelector('.puzzle-archive > .difficulty-selector')
      ).toBeNull();
      expect(
        container.querySelectorAll('.archive-toolbar input[type="radio"]')
      ).toHaveLength(3);
      expect(
        container.querySelector('.archive-toolbar legend')?.textContent
      ).toBe('difficulty.label');
      expect(
        container.querySelector('.archive-toolbar .archive-today')
      ).not.toBeNull();
      expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
      expect(container.textContent).not.toMatch(/ui\.(all|unfinished)/);
      const previous = container.querySelector<HTMLButtonElement>(
        '[aria-label="ui.previousMonth"]'
      );
      expect(previous?.disabled).toBe(false);
      await act(async () => previous!.click());

      for (const difficulty of ['easy', 'medium', 'hard']) {
        const radio = container.querySelector<HTMLInputElement>(
          `input[value="${difficulty}"]`
        );
        await act(async () => radio!.click());
        expect(radio?.checked).toBe(true);
        expect(container.querySelector('.archive-month')?.textContent).toBe(
          'November 2026'
        );
        expect(mocks.getArchive).toHaveBeenLastCalledWith(
          `/api/archive?month=2026-11&difficulty=${difficulty}`
        );
        const completed = container.querySelector<HTMLButtonElement>(
          '.archive-day[aria-label*="levels.completed"]'
        );
        expect(completed?.disabled).toBe(false);
        expect(
          completed?.querySelector('.archive-day-status svg')
        ).not.toBeNull();
        expect(
          completed?.querySelector('.archive-day-status')?.textContent
        ).toBe('3');
        expect(completed?.getAttribute('aria-label')).toContain(
          `difficulty.${difficulty}`
        );
        act(() => completed!.click());
        expect(onSelect).toHaveBeenLastCalledWith('2026-11-12', difficulty);
        const unavailable = container.querySelector<HTMLButtonElement>(
          '.archive-day[aria-label*="ui.unavailable"]'
        );
        expect(unavailable?.disabled).toBe(true);
      }
      act(() =>
        container.querySelector<HTMLButtonElement>('.archive-today')!.click()
      );
      expect(onSelect).toHaveBeenLastCalledWith('2026-12-02', 'hard');
    } finally {
      act(() => root.unmount());
    }
  });

  it('discards archive difficulty previews on cancel without selecting a puzzle or changing preference', async () => {
    localStorage.setItem('outnumber-difficulty', 'hard');
    const container = document.createElement('div');
    const root = createRoot(container);
    const onSelect = vi.fn();
    const props = {
      selectedDate: '2026-12-02',
      difficulty: 'hard',
      onSelect,
    } satisfies Parameters<typeof PuzzleArchive>[0];
    try {
      await act(async () => root.render(createElement(PuzzleArchive, props)));
      for (const difficulty of ['easy', 'medium']) {
        await act(async () =>
          container
            .querySelector<HTMLInputElement>(`input[value="${difficulty}"]`)!
            .click()
        );
        expect(onSelect).not.toHaveBeenCalled();
        expect(localStorage.getItem('outnumber-difficulty')).toBe('hard');
      }
      act(() => root.render(null));
      await act(async () => root.render(createElement(PuzzleArchive, props)));
      expect(
        container.querySelector<HTMLInputElement>('input[value="hard"]')
          ?.checked
      ).toBe(true);
      expect(mocks.getArchive).toHaveBeenLastCalledWith(
        '/api/archive?month=2026-12&difficulty=hard'
      );
      expect(onSelect).not.toHaveBeenCalled();
      expect(localStorage.getItem('outnumber-difficulty')).toBe('hard');
    } finally {
      act(() => root.unmount());
    }
  });
});
