import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const sizes = { sm: 'size-9 text-[13px]', md: 'size-12 text-base', lg: 'size-[120px] text-[40px]' };

/** Profile photo, or initials on the brand colour when there's no photo. Decorative: the name is shown beside it. */
export function Avatar({ name, photoUrl, size = 'sm', tone = 'forest', className }: { name: string; photoUrl?: string; size?: keyof typeof sizes; tone?: 'forest' | 'sun'; className?: string }) {
  return photoUrl ? (
    <img src={photoUrl} alt="" className={cn('shrink-0 rounded-full object-cover', sizes[size], className)} />
  ) : (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full font-bold', tone === 'sun' ? 'bg-sun text-on-secondary' : 'bg-forest text-on-primary', sizes[size], className)}>
      {initials(name)}
    </span>
  );
}
