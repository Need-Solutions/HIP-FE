import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { cn } from '@/lib/cn';

export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && <span className="grid size-14 place-items-center rounded-2xl bg-mint text-forest"><Icon size={22} aria-hidden /></span>}
      <p className="mt-5 text-lg font-bold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-slate">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}
