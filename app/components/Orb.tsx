'use client';

import { useEffect, useRef } from 'react';

/** The hero object: Bitcoin held as a sphere of points, with a red ring
 *  turning around it, the line redemptions can't cross. Canvas 2D, pauses
 *  off screen, draws one still frame with reduced motion. */
export function Orb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Points on a sphere (Fibonacci spiral), a few of them red.
    const N = 1100;
    const pts: { x: number; y: number; z: number; red: boolean }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, red: Math.random() < 0.07 });
    }
    // The ring, a little wider than the sphere.
    const RING = 260;
    const ring = Array.from({ length: RING }, (_, i) => {
      const a = (i / RING) * Math.PI * 2;
      const jitter = 1.32 + (Math.random() - 0.5) * 0.05;
      return { a, r: jitter };
    });

    let w = 0;
    let h = 0;
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const b = canvas.getBoundingClientRect();
      w = b.width;
      h = b.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);

    let mx = 0;
    let my = 0;
    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    let tiltX = 0;
    let tiltY = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.34;
      const cx = w / 2;
      const cy = h / 2;
      tiltX += (my * 0.25 - tiltX) * 0.04;
      tiltY += (mx * 0.35 - tiltY) * 0.04;
      const rot = t * 0.00012 + tiltY;
      const ax = -0.32 + tiltX;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const cxr = Math.cos(ax);
      const sxr = Math.sin(ax);
      const persp = 2.6;

      // A low red glow behind the sphere.
      const g = ctx.createRadialGradient(cx, cy + R * 0.2, 0, cx, cy + R * 0.2, R * 1.7);
      g.addColorStop(0, 'rgba(229, 20, 27, 0.22)');
      g.addColorStop(0.5, 'rgba(229, 20, 27, 0.06)');
      g.addColorStop(1, 'rgba(229, 20, 27, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const project = (x: number, y: number, z: number) => {
        const x1 = x * cr + z * sr;
        const z1 = -x * sr + z * cr;
        const y2 = y * cxr - z1 * sxr;
        const z2 = y * sxr + z1 * cxr;
        const s = persp / (persp - z2);
        return { px: cx + x1 * R * s, py: cy + y2 * R * s, z: z2, s };
      };

      const drawRing = (front: boolean) => {
        const spin = t * 0.0004;
        for (const p of ring) {
          const a = p.a + spin;
          // The ring sits tilted against the sphere's own axis.
          const x = Math.cos(a) * p.r;
          const z = Math.sin(a) * p.r;
          const y = z * 0.28;
          const q = project(x, y, z * 0.96);
          if (front !== q.z > 0) continue;
          const alpha = front ? 0.95 : 0.35;
          ctx.fillStyle = `rgba(255, 46, 46, ${alpha})`;
          ctx.beginPath();
          ctx.arc(q.px, q.py, 1.5 * q.s, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      drawRing(false);
      for (const p of pts) {
        const q = project(p.x, p.y, p.z);
        const depth = (q.z + 1) / 2; // 0 back, 1 front
        const alpha = 0.12 + depth * 0.78;
        ctx.fillStyle = p.red ? `rgba(255, 46, 46, ${alpha})` : `rgba(244, 244, 242, ${alpha})`;
        ctx.beginPath();
        ctx.arc(q.px, q.py, (0.6 + depth * 1.1) * q.s, 0, Math.PI * 2);
        ctx.fill();
      }
      drawRing(true);
    };

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    const loop = (t: number) => {
      draw(t);
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    if (still) draw(4000);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={ref} className="orb" aria-hidden="true" />;
}
