'use client';

import { useEffect } from 'react';

/** Gives the floating bar a dark backing once the page has scrolled. */
export function BarShade() {
  useEffect(() => {
    const el = document.documentElement;
    const on = () => el.classList.toggle('scrolled', window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return null;
}
