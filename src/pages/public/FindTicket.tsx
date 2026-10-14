import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck, Ticket } from 'lucide-react';
import { ticketsApi } from '@/api/endpoints';
import { Button, Input } from '@/components/ui';
import { emailSchema, isPhone, normalisePhone, ticketCodeSchema } from '@/lib/validation';
import { notifyError } from '@/lib/notify';

// Figma: "Web / Find my ticket". Guests recover their QR ticket with the email or phone used at checkout.
// The backend sends a one-time link to /tickets/:code?token=…. The page always gives the same answer,
// so it can't be used to find out whether someone bought a ticket.

const RESEND_COOLDOWN_S = 30;

const schema = z.object({
  contact: z
    .string()
    .trim()
    .min(1, 'Enter the email or phone number you used at checkout')
    .refine((v) => emailSchema.safeParse(v).success || isPhone(v), 'Enter a valid email address or phone number'),
  code: z.union([z.literal(''), ticketCodeSchema]),
});
type Values = z.infer<typeof schema>;

export default function FindTicket() {
  const [sentTo, setSentTo] = useState<Values | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { contact: '', code: '' } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (values: Values) => {
    const contact = values.contact.includes('@') ? values.contact.trim() : normalisePhone(values.contact);
    try {
      await ticketsApi.requestGuestLink(contact, values.code || undefined);
      setSentTo(values);
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      notifyError('We couldn’t send the link just now. Please try again in a moment.', { id: 'find-ticket' });
    }
  };

  return (
    <div className="bg-sand py-10 md:py-16">
      <div className="container-page">
        <div className="card mx-auto max-w-[500px] p-6 md:p-8">
          {sentTo ? (
            <div role="status">
              <span className="grid size-12 place-items-center rounded-xl bg-mint text-forest"><MailCheck size={22} aria-hidden /></span>
              <h1 className="mt-5 text-[26px] md:text-[28px]">Check your email or WhatsApp</h1>
              <p className="mt-2 text-[15px] text-slate">
                If we find a ticket for <span className="font-semibold text-ink">{sentTo.contact}</span>, we’ll send a link that opens it. It can take a
                minute to arrive. The link works once.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button block size="lg" disabled={cooldown > 0 || isSubmitting} onClick={() => send(sentTo)}>
                  {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the link again'}
                </Button>
                <Button block size="lg" variant="ghost" onClick={() => setSentTo(null)}>Use different details</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(send)} noValidate>
              <span className="grid size-12 place-items-center rounded-xl bg-mint text-forest"><Ticket size={20} aria-hidden /></span>
              <h1 className="mt-5 text-[26px] md:text-[28px]">Find my ticket</h1>
              <p className="mt-1 text-[15px] text-slate">Bought as a guest? Get your QR ticket back here.</p>

              <div className="mt-6 space-y-4">
                <Input label="Email or phone used at checkout" autoComplete="email" {...register('contact')} error={errors.contact?.message} />
                <Input
                  label="Ticket ID (optional)"
                  placeholder="HIP-XXXX-XXXX"
                  autoCapitalize="characters"
                  hint="It’s in your confirmation email."
                  {...register('code')}
                  error={errors.code?.message}
                />
              </div>


              <Button type="submit" block size="lg" className="mt-6" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send me a one-time link'}
              </Button>
              <p className="mt-4 text-center text-[13px] text-slate">We’ll email or WhatsApp a link that opens your ticket.</p>
              <p className="mt-3 text-center">
                <Link to="/login" className="text-sm font-bold text-forest hover:underline">Have an account? Log in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
