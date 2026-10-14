import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Ticket, UserRound, X } from 'lucide-react';
import { adminPeopleApi } from '@/api/endpoints';
import { Badge } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { cn } from '@/lib/cn';

// Admin top-bar search (Figma "Search hikers, tickets…", SRCH-008): hikers by name, email or phone, and tickets by ID.
// Each section appears only for staff allowed to see it, and the server filters the same way. ARIA combobox:
// arrow keys move through results, Enter opens one, Escape closes.

interface Option {
  key: string;
  to: string;
  label: string;
  detail: string;
  kind: 'hiker' | 'ticket';
  guest?: boolean;
}

export function AdminSearch({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const allowHikers = useCan('view_hikers');
  const allowTickets = useCan('check_in');
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const term = useDebouncedValue(text.trim(), 250);

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'search', term],
    queryFn: () => adminPeopleApi.search(term),
    enabled: term.length >= 2 && (allowHikers || allowTickets),
    staleTime: 30_000,
    meta: { silentError: true },
  });

  const options: Option[] = [
    ...(data?.hikers ?? []).map((h) => ({ key: `h-${h.id}`, to: `/admin/hikers/${encodeURIComponent(h.id)}`, label: h.name, detail: h.email ?? '', kind: 'hiker' as const, guest: h.isGuest })),
    ...(data?.tickets ?? []).map((t) => ({ key: `t-${t.code}`, to: `/admin/tickets/${encodeURIComponent(t.code)}`, label: t.code, detail: `${t.holderName} · ${t.eventTitle}`, kind: 'ticket' as const })),
  ];

  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    const close = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!allowHikers && !allowTickets) return null;

  const go = (o: Option) => {
    navigate(o.to);
    setOpen(false);
    setText('');
    onDone?.();
  };
  const placeholder = allowHikers && allowTickets ? 'Search hikers, tickets…' : allowHikers ? 'Search hikers…' : 'Search ticket IDs…';
  const showList = open && term.length >= 2;
  const status = term.length < 2 ? '' : isFetching && !data ? 'Searching…' : options.length ? `${options.length} results` : 'No matches';

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-sm focus-within:border-forest focus-within:ring-2 focus-within:ring-forest/20">
        <Search size={16} aria-hidden className="shrink-0 text-slate-mute" />
        <span className="sr-only">{placeholder}</span>
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-slate-mute"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && options[active]) {
              e.preventDefault();
              go(options[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              onDone?.();
            }
          }}
        />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => setText('')} className="grid size-6 place-items-center rounded text-slate-mute hover:text-ink">
            <X size={14} aria-hidden />
          </button>
        )}
      </label>
      <p className="sr-only" aria-live="polite">{status}</p>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Search results" className="absolute right-0 z-40 mt-2 max-h-[70vh] w-full min-w-[300px] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl">
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate" role="presentation">{isFetching ? 'Searching…' : 'No hikers or tickets match.'}</li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(o);
                }}
                className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5', i === active && 'bg-canvas')}
              >
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint text-forest">
                  {o.kind === 'hiker' ? <UserRound size={15} /> : <Ticket size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-semibold text-ink', o.kind === 'ticket' && 'font-mono')}>{o.label}</span>
                  <span className="block truncate text-xs text-slate">{o.detail}</span>
                </span>
                {o.guest && <Badge tone="gray">Guest</Badge>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
