// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ShareResult } from '../src/client/components/ShareResult';
import { i18nReady } from '../src/client/i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('result comment composer', () => {
  it('requires an explicit submission and retries the same request', async () => {
    await i18nReady;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ type: 'share-result', commentId: 't1_test' }),
      });
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ShareResult, {
            date: '2026-11-16',
            steps: 28,
            onCancel: vi.fn(),
          })
        )
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(container.querySelector('label')!.textContent).toBe(
        "Comments on today's puzzle:"
      );
      expect(container.querySelector('textarea')!.placeholder).toBe(
        'Share your thoughts...'
      );
      expect(
        container.querySelector('textarea')!.nextElementSibling?.textContent
      ).toBe('Outnumber Daily · 2026-11-16 · Easy · 28 steps');
      expect(container.textContent).not.toContain('Reddit account');
      const textarea = container.querySelector('textarea')!;
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value'
        )!.set!.call(textarea, 'Hard one today');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true })
          );
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true })
          );
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
      expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
        date: '2026-11-16',
        message: 'Hard one today',
      });
      expect(container.textContent).toBe('Comment posted.');
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
