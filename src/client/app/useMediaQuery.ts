import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a media query so appearance reacts to system changes
 * live (dark mode, reduced motion) instead of being read once.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);

      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
