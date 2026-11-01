import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
/** Mesma chave usada antes pela tela inicial, para preservar a escolha de quem já alternou. */
const KEY = 'oliveira-home-theme';

function read(): Theme {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

let current: Theme = read();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0e' : '#ffffff');
}
if (typeof document !== 'undefined') apply(current);

export function setTheme(next: Theme) {
  current = next;
  apply(next);
  try { localStorage.setItem(KEY, next); } catch { /* O tema muda nesta visita mesmo sem armazenamento. */ }
  listeners.forEach(fn => fn());
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => current,
    () => 'dark' as Theme,
  );
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
