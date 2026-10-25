'use client';

import { useEffect } from 'react';

/** The red line down the landing page. It fills as you scroll and lights
 *  each section's node once the line reaches it. */
export function Spine() {
  useEffect(() => {
    const wrap = document.querySelector<HTMLElement>('.spine-wrap');
    if (!wrap) return;
    const nodes = [...wrap.querySelectorAll<HTMLElement>('.node')];
    let raf = 0;
    const update = () => {
      raf = 0;
      const b = wrap.getBoundingClientRect();
      const reach = window.innerHeight * 0.6 - b.top;
      const p = Math.max(0, Math.min(1, reach / b.height));
      wrap.style.setProperty('--fill', `${(p * 100).toFixed(2)}%`);
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        n.classList.toggle('lit', r.top < window.innerHeight * 0.6);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
