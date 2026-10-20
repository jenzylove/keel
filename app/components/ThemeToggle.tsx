'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme as 'light' | 'dark' | undefined;
    setTheme(t ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('keel-theme', next);
    } catch {}
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={flip} aria-label="Switch colour theme">
      {theme === 'dark' ? 'light' : 'dark'}
    </button>
  );
}
