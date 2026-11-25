// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useReloadablePanel } from '../src/client/hooks/useReloadablePanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('panel reload recovery', () => {
  it('restores a clicked panel after a webview reload and clears it on close', () => {
    sessionStorage.clear();
    const container = document.createElement('div');
    let root = createRoot(container);
    function Panel() {
      const [open, setOpen] = useReloadablePanel('tutorials', 'test-post');
      return createElement(
        'button',
        { onClick: () => setOpen(!open) },
        open ? 'Tutorials' : 'Puzzle'
      );
    }
    const mount = () =>
      act(() =>
        root.render(createElement(StrictMode, null, createElement(Panel)))
      );
    mount();
    act(() => container.querySelector('button')!.click());
    act(() => window.dispatchEvent(new Event('pagehide')));
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(container.textContent).toBe('Tutorials');
    act(() => container.querySelector('button')!.click());
    act(() => window.dispatchEvent(new Event('pagehide')));
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(container.textContent).toBe('Puzzle');
    act(() => root.unmount());
  });
});
