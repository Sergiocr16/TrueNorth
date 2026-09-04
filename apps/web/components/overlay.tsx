'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Anything that has to sit above the whole app: sheets, dialogs, the voice
 * flow.
 *
 * Rendered through a portal into <body> rather than in place. z-index alone is
 * not enough, because a sheet rendered inside the screen competes with the
 * glass chrome around it, and any ancestor that establishes a stacking context
 * (a backdrop-filter, a transform, an animation) can trap it underneath. A
 * portal removes the question entirely.
 *
 * It also holds the background still while it is open, so scrolling the sheet
 * does not scroll the page behind it.
 */
export function Overlay({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const { style } = document.body;
    const previous = style.overflow;
    style.overflow = 'hidden';
    return () => {
      style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="tn-overlay-root">{children}</div>,
    document.body,
  );
}
