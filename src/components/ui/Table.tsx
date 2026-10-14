import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Data table for admin screens (Figma "Admin / *" tables): uppercase grey header row, dividers, comfortable rows.
// The wrapper scrolls sideways on narrow screens so the page itself never does.

export function Table({ caption, children, className, minWidth = 720 }: { caption: string; children: ReactNode; className?: string; minWidth?: number }) {
  return (
    // Focusable and named so keyboard users can scroll it sideways on phones (WCAG 2.1.1).
    <div role="region" aria-label={caption} tabIndex={0} className={cn('overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest/40', className)}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-y border-line bg-canvas text-[11px] font-bold uppercase tracking-wide text-slate">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('whitespace-nowrap px-5 py-3 first:pl-6 last:pr-6', className)} {...props} />;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('align-middle', className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-5 py-3.5 text-ink first:pl-6 last:pr-6', className)} {...props} />;
}
