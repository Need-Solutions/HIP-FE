import type { ReactNode } from 'react';
import { Check, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

const tones = {
  error: { box: 'bg-danger-light', title: 'text-danger', icon: TriangleAlert, iconClass: 'text-danger' },
  warning: { box: 'bg-warn-light', title: 'text-warn', icon: TriangleAlert, iconClass: 'text-warn' },
  success: { box: 'bg-mint', title: 'text-forest', icon: Check, iconClass: 'text-forest' },
  info: { box: 'bg-info-light', title: 'text-info', icon: Info, iconClass: 'text-info' },
};

/** Banner for form-level messages (Figma "Auth / Log in – error", "Auth / Forgot password"). */
export function Alert({ tone, title, children, className }: { tone: keyof typeof tones; title?: string; children?: ReactNode; className?: string }) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl p-4', t.box, className)}>
      <Icon size={18} aria-hidden className={cn('mt-0.5 shrink-0', t.iconClass)} />
      <div className="min-w-0 text-[13px] text-ink">
        {title && <p className={cn('text-sm font-bold', t.title)}>{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
    </div>
  );
}
