'use client';

import { useEffect, useState } from 'react';

export type Step = { name: string; title: string; body: string; figure: string; caption: string };

/** How a loan works, as a stack: one step open at a time, with its live
 *  number beside it. Advances on its own until someone picks a step. */
export function Steps({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setOpen((o) => (o + 1) % steps.length), 4200);
    return () => clearInterval(id);
  }, [held, steps.length]);

  const s = steps[open];
  return (
    <div className="steps-x">
      <ol className="stack">
        {steps.map((st, i) => (
          <li key={st.name} className={i === open ? 'on' : ''}>
            <button
              onClick={() => {
                setOpen(i);
                setHeld(true);
              }}
              aria-expanded={i === open}
            >
              <span className="k">{String(i + 1).padStart(2, '0')}</span>
              {st.name}
            </button>
            <div className="stack-body">
              <h3>{st.title}</h3>
              <p>{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="readout" key={open}>
        <span className="readout-k">{s.name}</span>
        <strong>{s.figure}</strong>
        <span className="readout-c">{s.caption}</span>
      </div>
    </div>
  );
}
