import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Gap between the trigger and the menu — the old `top-[calc(100%+6px)]`. */
const OFFSET_Y = 6;
/** Minimum distance kept between the menu and the viewport's left/right edges. */
const VIEWPORT_MARGIN = 8;

/**
 * Positions a header dropdown with `position: fixed` under its trigger, clamped inside the
 * viewport. Used by `SortMenu` and `ExchangeFilterMenu`, which render the menu (and its
 * outside-click catcher) in a PORTAL on `<body>`, at `z-[60]`: above the notifications panel
 * (z-50) and handle (z-40), below the Settings modal (z-[100]).
 *
 * Why outside the header: the header's control row scrolls horizontally on narrow screens
 * (`overflow-x: auto` in `DashboardHeader`) and is a sticky stacking context. An `absolute`
 * menu inside it is clipped by that overflow, and while the spec says a `fixed` descendant
 * escapes it, WebKit (Safari) can still clip fixed descendants of a scrolling container once
 * it actually overflows — the menu then disappears only at narrow widths. A portal takes the
 * menu out of the header's subtree, so no browser's overflow or stacking rules apply to it.
 *
 * Where everything fits (desktop) the result is the old placement exactly: 6 px below the
 * trigger, left-aligned with it. The menu is measured in a layout effect before paint, and
 * re-placed on resize and on any scroll (including the header's own horizontal scroll).
 */
export function useAnchoredMenu(open: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const maxLeft = window.innerWidth - menu.offsetWidth - VIEWPORT_MARGIN;
      const top = anchor.bottom + OFFSET_Y;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));
      // Page scroll doesn't move the sticky header: keep the same state, skip the re-render.
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true); // capture: catches the header's own scroll
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Until measured (one layout pass, before paint) the menu is laid out but invisible.
  const menuStyle: CSSProperties = pos
    ? { position: 'fixed', top: pos.top, left: pos.left }
    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

  return { anchorRef, menuRef, menuStyle };
}
