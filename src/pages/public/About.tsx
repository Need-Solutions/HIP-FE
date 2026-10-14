import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, HeartPulse, Mail, MapPinned, MessageCircle, Phone, UsersRound } from 'lucide-react';
import { aboutApi } from '@/api/endpoints';
import { Button, Card, CountUp, Input, Skeleton, Textarea } from '@/components/ui';
import { useBranding } from '@/features/branding/BrandingContext';
import { errorMessage, notifyError } from '@/lib/notify';

// Figma: "Web / About & contact" (WEB-005). Story, stats, safety cards and a contact form. The group's name and
// contact details come from the brand (Admin / Branding); the stats come from GET /api/about/stats. The form posts to
// /api/contact; the success message replaces the form, and failures toast.

const safety = [
  { icon: HeartPulse, title: 'First aid on every hike', body: 'A trained medic and a stocked kit travel with every group.' },
  { icon: MapPinned, title: 'Guides who know the trail', body: 'Every route is scouted before it goes on sale.' },
  { icon: UsersRound, title: 'Headcount by check-in', body: 'We know exactly who started and who finished.' },
];

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'Keep your name under 80 characters'),
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email, like you@example.com'),
  message: z.string().trim().min(10, 'Write a message of at least 10 characters').max(2000, 'Keep your message under 2,000 characters'),
  website: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export default function About() {
  const brand = useBranding();
  const { data: stats } = useQuery({ queryKey: ['about', 'stats'], queryFn: aboutApi.stats, staleTime: 10 * 60_000, meta: { silentError: true } });
  const { contact } = brand;

  return (
    <>
      <section className="bg-pine text-white">
        <div className="container-page py-16 md:py-24">
          <h1 className="max-w-3xl text-4xl leading-[1.05] text-white md:text-6xl">We walk every weekend.</h1>
          <p className="mt-5 max-w-xl text-lg text-mist-light">An Abuja hiking group, run by hikers, for hikers.</p>
        </div>
      </section>

      <section id="story" className="container-page grid gap-10 py-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-16">
        <div>
          <h2 className="text-3xl md:text-4xl">Our story</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate">
            {brand.name} started in 2023 as twelve friends and a bus. Today we run weekly hikes around Abuja and beyond, with trained guides, a medic on every trip and a simple rule: leave the trail better than you found it.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          {stats
            ? [
                { value: stats.hikesRun, label: 'Hikes run' },
                { value: stats.members, label: 'Members' },
                { value: stats.guides, label: 'Trained guides' },
                { value: stats.seriousIncidents, label: 'Serious incidents' },
              ].map(({ value, label }) => (
                <div key={label} className="flex flex-col-reverse rounded-2xl border border-line bg-white p-6">
                  <dt className="mt-1 text-sm text-slate">{label}</dt>
                  <dd className="text-4xl font-extrabold text-forest"><CountUp value={value} /></dd>
                </div>
              ))
            : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)}
        </dl>
      </section>

      <section id="safety" className="bg-sand py-16 md:py-20">
        <div className="container-page">
          <h2 className="text-3xl md:text-4xl">Safety first</h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {safety.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Card className="h-full p-6">
                  <span aria-hidden className="grid size-12 place-items-center rounded-xl bg-mint text-forest"><Icon size={22} /></span>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate">{body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="contact" className="container-page scroll-mt-6 py-16 md:py-20" aria-labelledby="contact-heading">
        <Card className="grid gap-10 p-6 md:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h2 id="contact-heading" className="text-3xl">Get in touch</h2>
            <p className="mt-2 text-slate">Questions about a hike, group bookings or partnerships.</p>
            <ul className="mt-8 space-y-5 text-sm">
              <ContactRow icon={Mail} label="Email"><a href={`mailto:${contact.email}`} className="font-semibold text-forest hover:underline">{contact.email}</a></ContactRow>
              <ContactRow icon={Phone} label="Phone"><a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="font-semibold text-forest hover:underline">{contact.phone}</a></ContactRow>
              {contact.whatsapp && (
                <ContactRow icon={MessageCircle} label="WhatsApp">
                  <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest hover:underline">Join the community chat<span className="sr-only"> (opens in a new tab)</span></a>
                </ContactRow>
              )}
            </ul>
          </div>
          <ContactForm />
        </Card>
      </section>
    </>
  );
}

function ContactRow({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint text-forest"><Icon size={17} /></span>
      <div>
        <p className="text-slate">{label}</p>
        {children}
      </div>
    </li>
  );
}

function ContactForm() {
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', message: '', website: '' } });

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start justify-center rounded-2xl bg-mint p-8">
        <CheckCircle2 size={32} aria-hidden className="text-forest" />
        <h3 className="mt-4 text-xl font-bold">Thanks, {sent.name.split(' ')[0]}. Your message is on its way.</h3>
        <p className="mt-2 text-sm text-slate">We reply to {sent.email} within two working days.</p>
        <Button variant="secondary" className="mt-6" onClick={() => { reset(); setSent(null); }}>Send another message</Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-label="Contact form"
      onSubmit={handleSubmit(async (v) => {
        try {
          await aboutApi.contact({ name: v.name.trim(), email: v.email.trim(), message: v.message.trim(), website: v.website });
          setSent({ name: v.name.trim(), email: v.email.trim() });
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t send your message. Please try again, or email us.'), { id: 'contact' });
        }
      })}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Name" autoComplete="name" placeholder="Your name" {...register('name')} error={errors.name?.message} />
        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} error={errors.email?.message} />
        <Textarea label="Message" className="sm:col-span-2" rows={5} placeholder="How can we help?" {...register('message')} error={errors.message?.message} />
      </div>
      {/* Honeypot: hidden from people and assistive tech, filled in by some bots. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>
      <Button type="submit" className="mt-6" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send message'}</Button>
    </form>
  );
}
