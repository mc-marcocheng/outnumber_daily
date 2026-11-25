import { useEffect, useState } from 'react';

function restoredPanel(key: string): boolean {
  try {
    const saved = Number(sessionStorage.getItem(key));
    const age = Date.now() - saved;
    return saved > 0 && age >= 0 && age < 30000;
  } catch {
    return false;
  }
}

export function useReloadablePanel(panel: string, scope: string) {
  const key = `outnumber-panel:${scope}:${panel}`;
  const [previousKey, setPreviousKey] = useState(key);
  const [open, setOpen] = useState(() => restoredPanel(key));
  if (previousKey !== key) {
    setPreviousKey(key);
    setOpen(restoredPanel(key));
  }

  useEffect(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      return;
    }
    const preserve = () => {
      try {
        if (open) sessionStorage.setItem(key, String(Date.now()));
        else sessionStorage.removeItem(key);
      } catch {
        return;
      }
    };
    window.addEventListener('pagehide', preserve);
    return () => window.removeEventListener('pagehide', preserve);
  }, [key, open]);

  return [open, setOpen] as const;
}
