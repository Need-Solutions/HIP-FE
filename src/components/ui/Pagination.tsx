import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Pages to show: always the first and last, the current one and its neighbours; null is a gap ("…"). */
function pageWindow(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const keep = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => keep.add(p));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

/** Numbered pagination (SRCH-007). Hidden when everything fits on one page; long ranges collapse with "…". */
export function Pagination({ page, pageCount, onChange, className }: { page: number; pageCount: number; onChange: (page: number) => void; className?: string }) {
  if (pageCount <= 1) return null;
  const btn = 'grid size-10 place-items-center rounded-xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-center gap-2', className)}>
      <button type="button" className={cn(btn, 'border-line bg-white hover:bg-canvas')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft size={18} />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-slate">…</span>
        ) : (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          aria-label={`Page ${p}`}
          className={cn(btn, p === page ? 'border-forest bg-forest text-on-primary' : 'border-line bg-white text-ink hover:bg-canvas')}
        >
          {p}
        </button>
        ),
      )}
      <button type="button" className={cn(btn, 'border-line bg-white hover:bg-canvas')} disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}
