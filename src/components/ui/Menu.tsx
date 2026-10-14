import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface MenuItem {
  label: string;
  /** A route to open, or an action. */
  to?: string;
  onSelect?: () => void;
  tone?: 'danger';
  icon?: ReactNode;
}

/**
 * Row actions ("⋯" in Figma tables). ARIA menu button: Enter, Space or ↓ opens and focuses the first item, arrow keys
 * move, Escape closes and returns focus. The list is placed with fixed positioning in a portal, so a table that
 * scrolls sideways doesn't clip it.
 */
export function Menu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const navigate = useNavigate();

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 56 + items.length * 40;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), up });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'mousedown' && (list.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, pos]);

  const focusItem = (delta: number | 'first' | 'last') => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    const n = delta === 'first' ? 0 : delta === 'last' ? els.length - 1 : (i + delta + els.length) % els.length;
    els[n]?.focus();
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') focusItem(1);
    else if (e.key === 'ArrowUp') focusItem(-1);
    else if (e.key === 'Home') focusItem('first');
    else if (e.key === 'End') focusItem('last');
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') button.current?.focus();
      return;
    } else return;
    e.preventDefault();
  };

  const choose = (item: MenuItem) => {
    setOpen(false);
    button.current?.focus();
    if (item.to) navigate(item.to);
    item.onSelect?.();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn('grid size-9 place-items-center rounded-lg text-slate hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40', className)}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onListKey}
            style={{ top: pos.top, right: pos.right }}
            className={cn('fixed z-50 min-w-[200px] rounded-xl border border-line bg-white p-1.5 shadow-xl', pos.up && '-translate-y-full')}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(item)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-canvas focus:bg-canvas focus:outline-none',
                  item.tone === 'danger' ? 'text-danger' : 'text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
