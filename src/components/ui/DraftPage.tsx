import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { useBranding } from '@/features/branding/BrandingContext';

/** Public page whose copy isn't written yet (Terms, Privacy). Keeps the URL live so links never 404. */
export function DraftPage({ title, children }: { title: string; children?: ReactNode }) {
  const { contact } = useBranding();
  return (
    <div className="container-page max-w-3xl py-12 md:py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-mint text-forest"><FileText size={22} aria-hidden /></span>
      <h1 className="mt-5 text-[28px] md:text-[34px]">{title}</h1>
      <p className="mt-3 text-[15px] text-slate">
        This page is being written. Contact{' '}
        <a href={`mailto:${contact.email}`} className="font-bold text-forest underline">{contact.email}</a> with questions.
      </p>
      {children}
    </div>
  );
}
