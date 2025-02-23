import { useState, useEffect } from 'react';

const THEME_KEY = 'theme';

export function useTheme() {
  const getInitialTheme = () => {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem(THEME_KEY);
      if (storedTheme) return storedTheme;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return 'light';
  };

  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggleTheme };
}
