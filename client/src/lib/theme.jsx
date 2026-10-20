import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

// Two looks: 'light' (clinic: white cards, teal accent) and 'dark' (ONE: dark glass, gold).
// index.html applies the saved one before React starts so the page never flashes the wrong colours.
export const THEMES = ['light', 'dark'];
const COLORS = { light: '#0b7f78', dark: '#101010' };

const read = () => {
  try {
    const v = localStorage.getItem('theme');
    return THEMES.includes(v) ? v : 'light';
  } catch {
    return 'light';
  }
};

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* private mode */
  }
}

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [theme, setState] = useState(read);

  // the account remembers the choice, so the same look follows the user to their phone
  useEffect(() => {
    if (user?.theme && THEMES.includes(user.theme)) setState(user.theme);
  }, [user?.id, user?.theme]);

  useEffect(() => apply(theme), [theme]);

  // paper is white: print (cashier, reports) always in the light look, then switch back
  useEffect(() => {
    const before = () => (document.documentElement.dataset.theme = 'light');
    const after = () => (document.documentElement.dataset.theme = theme);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [theme]);

  const setTheme = useCallback(
    (next) => {
      if (!THEMES.includes(next)) return;
      setState(next);
      if (user) api('/auth/me', { method: 'PATCH', body: { theme: next } }).catch(() => {});
    },
    [user],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
