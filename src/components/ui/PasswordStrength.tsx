import { passwordScore } from '@/lib/passwordScore';
import { cn } from '@/lib/cn';

const levels = [
  { label: 'Too weak', text: 'text-danger', bar: 'bg-danger' },
  { label: 'Weak', text: 'text-danger', bar: 'bg-danger' },
  { label: 'Good password', text: 'text-warn', bar: 'bg-warn' },
  { label: 'Good password', text: 'text-forest', bar: 'bg-forest' },
  { label: 'Strong password', text: 'text-forest', bar: 'bg-forest' },
];

/** Four-segment meter under a new password (Figma "Auth / Reset password"). The label carries the meaning, not just colour. */
export function PasswordStrength({ password, className }: { password: string; className?: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  const level = levels[score];
  return (
    <div className={cn('mt-2', className)}>
      <div aria-hidden className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cn('h-1 rounded-full', n <= score ? level.bar : 'bg-line')} />
        ))}
      </div>
      <p aria-live="polite" className={cn('mt-1.5 text-xs font-bold', level.text)}>{level.label}</p>
    </div>
  );
}
