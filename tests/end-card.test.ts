// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompleteResponse } from '../src/shared/api';
import { useEndCard } from '../src/client/hooks/useEndCard';

const mocks = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock('../src/client/api', () => ({ postJson: mocks.postJson }));

function Probe({ date, won }: { date: string; won: boolean }) {
  const { endCard: card, failed, retry } = useEndCard(date, won);
  return createElement(
    'button',
    { onClick: retry, 'data-failed': failed },
    card ? `${card.rank}:${card.streak}` : 'pending'
  );
}

const response: CompleteResponse = {
  type: 'complete',
  endCard: {
    steps: 3,
    parSteps: 3,
    parActions: 2,
    actions: 2,
    bestSteps: 3,
    rank: 1,
    streak: 7,
    flairMilestone: null,
  },
};
const container = document.createElement('div');
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  vi.resetAllMocks();
});

describe('completion lifecycle', () => {
  it('retries verification for the same winning run', async () => {
    mocks.postJson
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response);
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    expect(container.querySelector('button')?.dataset.failed).toBe('true');
    await act(async () => container.querySelector('button')?.click());
    expect(container.textContent).toBe('1:7');
    expect(mocks.postJson).toHaveBeenCalledTimes(2);
  });
  it('can complete a later run after a request fails', async () => {
    mocks.postJson
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response);
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    expect(container.textContent).toBe('pending');
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: false }))
    );
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    expect(container.textContent).toBe('1:7');
    expect(mocks.postJson).toHaveBeenCalledTimes(2);
  });

  it('ignores a response after the consumer unmounts', async () => {
    let resolveRequest: (value: CompleteResponse) => void = () => {};
    mocks.postJson.mockReturnValue(
      new Promise<CompleteResponse>((resolve) => {
        resolveRequest = resolve;
      })
    );
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    await act(async () => root.render(null));
    await act(async () => resolveRequest(response));
    expect(container.textContent).toBe('');
  });

  it('delivers a restored win through Strict Mode without duplicate requests', async () => {
    mocks.postJson.mockResolvedValue(response);
    await act(async () =>
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(Probe, { date: '2026-11-14', won: true })
        )
      )
    );
    expect(container.textContent).toBe('1:7');
    expect(mocks.postJson).toHaveBeenCalledTimes(1);
  });

  it("does not expose the previous run's rewards after restart", async () => {
    mocks.postJson.mockResolvedValue(response);
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    expect(container.textContent).toBe('1:7');
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: false }))
    );
    expect(container.textContent).toBe('pending');
  });

  it("ignores a previous date's late response", async () => {
    let resolveOld: (value: CompleteResponse) => void = () => {};
    mocks.postJson
      .mockReturnValueOnce(
        new Promise<CompleteResponse>((resolve) => {
          resolveOld = resolve;
        })
      )
      .mockResolvedValueOnce({
        ...response,
        endCard: { ...response.endCard, rank: 2 },
      });
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-14', won: true }))
    );
    await act(async () =>
      root.render(createElement(Probe, { date: '2026-11-15', won: true }))
    );
    await act(async () => resolveOld(response));
    expect(container.textContent).toBe('2:7');
    expect(mocks.postJson).toHaveBeenCalledTimes(2);
  });
});
