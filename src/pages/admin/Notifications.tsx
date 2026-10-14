import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bell, KeyRound, Lock, Mail, MessageCircle, MessageSquare, Send, Settings2 } from 'lucide-react';
import { notificationsApi, type MessageSetting, type NotificationChannel, type NotificationProvider, type NotificationSettings } from '@/api/endpoints';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Input, Select, Skeleton, Switch, Table, Tabs, TBody, Td, Th, THead, Tr, type BadgeTone } from '@/components/ui';
import { useSearchParams } from 'react-router-dom';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { DeliveryLog } from '@/components/admin/DeliveryLog';
import { useAuth } from '@/features/auth/AuthContext';
import { formatDate } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';

// Figma: "Admin / Notifications" (NOT-001..NOT-011). Transactional messages always go by email and that switch is
// locked (NOT-011); promotional messages reach only hikers who opted in (NOT-010). A channel can be switched on only
// when its provider is connected. Changes are audit-logged by the server.

const CHANNELS: NotificationChannel[] = ['email', 'sms', 'whatsapp'];
const CHANNEL_LABEL: Record<NotificationChannel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
const CHANNEL_ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle } as const;
const PROVIDERS: Record<NotificationChannel, string[]> = {
  email: ['Resend', 'Postmark', 'Amazon SES', 'SendGrid'],
  sms: ['Termii', 'Africa’s Talking', 'Twilio'],
  whatsapp: ['Meta Business', 'Twilio'],
};
const SENDER: Record<NotificationChannel, { label: string; placeholder: string; hint: string }> = {
  email: { label: 'From address', placeholder: 'hello@yourgroup.ng', hint: 'Emails come from this address. Verify the domain with your provider first.' },
  sms: { label: 'Sender ID', placeholder: 'HIP', hint: '3–11 letters or numbers, registered with your provider.' },
  whatsapp: { label: 'Business number', placeholder: '+234 801 234 5678', hint: 'Meta reviews new numbers, usually within 2 working days.' },
};
const STATUS: Record<NotificationProvider['status'], { label: string; tone: BadgeTone }> = {
  connected: { label: 'Connected', tone: 'green' },
  pending: { label: 'Pending approval', tone: 'amber' },
  not_connected: { label: 'Not connected', tone: 'gray' },
};

type Matrix = { messages: MessageSetting[] };

export default function Notifications() {
  useAdminTitle('Notifications', 'Which messages go out, and on which channels.');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'log' ? 'log' : 'settings';
  const { data, isLoading, refetch } = useQuery({ queryKey: ['admin', 'notifications'], queryFn: notificationsApi.get, enabled: tab === 'settings' });

  return (
    <div>
      <Tabs
        idPrefix="notif"
        label="Notifications"
        value={tab}
        onChange={(t) => setParams(t === 'log' ? { tab: 'log' } : {}, { replace: true })}
        options={[{ value: 'settings', label: 'Messages & providers' }, { value: 'log', label: 'Delivery log' }]}
      />
      <div id="notif-panel" role="tabpanel" aria-labelledby={`notif-tab-${tab}`} className="mt-5">
        {tab === 'log' ? (
          <DeliveryLog />
        ) : isLoading ? (
          <Skeleton className="h-[640px]" />
        ) : !data ? (
          <EmptyState icon={Bell} title="We couldn’t load notification settings" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : (
          <NotificationsForm settings={data} />
        )}
      </div>
    </div>
  );
}

function NotificationsForm({ settings }: { settings: NotificationSettings }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<NotificationProvider | null>(null);
  const [testing, setTesting] = useState<NotificationProvider | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<Matrix>({ defaultValues: { messages: settings.messages } });
  useEffect(() => reset({ messages: settings.messages }), [settings, reset]);

  const connected = (c: NotificationChannel) => settings.providers.find((p) => p.channel === c)?.status === 'connected';
  const providerNote = (c: NotificationChannel) => {
    const p = settings.providers.find((x) => x.channel === c);
    return p?.status === 'pending' ? 'provider pending approval' : p?.status === 'not_connected' ? 'no provider' : null;
  };

  const save = handleSubmit(async ({ messages }) => {
    setNotice(null);
    try {
      const next = await notificationsApi.saveMessages(messages);
      queryClient.setQueryData(['admin', 'notifications'], next);
      setNotice('Notification settings saved. Saved to the audit log.');
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save the settings. Please try again.'), { id: 'notifications' });
    }
  });

  return (
    <>
    <form noValidate onSubmit={save}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate">Hikers can turn off reminders and promotions in their profile. Ticket confirmations always send.</p>
        <Button type="submit" disabled={!isDirty || isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</Button>
      </div>
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}

      <Card className="mt-5 overflow-hidden">
        <div className="px-6 py-5">
          <h2 className="text-lg">Messages and channels</h2>
          <p className="mt-1 text-sm text-slate">Transactional messages always send by email. SMS and WhatsApp need a connected provider.</p>
        </div>
        <Table caption="Messages and the channels they’re sent on" minWidth={760}>
          <THead>
            <Th>Message</Th>
            <Th>Type</Th>
            {CHANNELS.map((c) => (
              <Th key={c} className="text-center">
                <span id={`col-${c}`}>{CHANNEL_LABEL[c]}</span>
                {providerNote(c) && <span className="block text-[10px] font-medium normal-case tracking-normal text-slate-mute">{providerNote(c)}</span>}
              </Th>
            ))}
          </THead>
          <TBody>
            {settings.messages.map((m, i) => (
              <Tr key={m.type}>
                <Td>
                  <p id={`msg-${m.type}`} className="font-semibold">{m.label}</p>
                  {m.category === 'promotional' && <p className="text-xs text-slate">Only to hikers who opted in</p>}
                </Td>
                <Td>{m.category === 'transactional' ? <Badge tone="dark">Transactional</Badge> : <Badge tone="orange">Promotional · opt-in</Badge>}</Td>
                {CHANNELS.map((c) => {
                  const locked = c === 'email' && m.category === 'transactional';
                  const off = !connected(c);
                  return (
                    <Td key={c} className="text-center">
                      <Controller
                        control={control}
                        name={`messages.${i}.channels.${c}`}
                        render={({ field }) => (
                          <span className="inline-flex flex-col items-center gap-1">
                            <Switch
                              checked={locked ? true : off ? false : !!field.value}
                              locked={locked}
                              disabled={!locked && off}
                              onChange={field.onChange}
                              aria-label={`${m.label} by ${CHANNEL_LABEL[c]}${locked ? ', always on' : off ? `, unavailable: ${providerNote(c)}` : ''}`}
                            />
                            {locked && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate"><Lock size={10} aria-hidden />Always</span>}
                          </span>
                        )}
                      />
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <h2 className="mt-8 text-lg">Providers</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {settings.providers.map((p) => {
          const Icon = CHANNEL_ICON[p.channel];
          return (
            <Card key={p.channel} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-mint text-forest"><Icon size={17} /></span>
                  <h3 className="text-base font-bold">{CHANNEL_LABEL[p.channel]}</h3>
                </div>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </div>
              <p className="mt-3 text-sm text-ink">{p.provider} · {p.sender}</p>
              <p className="mt-1 text-xs text-slate">
                {p.keyLast4 ? <><KeyRound size={12} aria-hidden className="mr-1 inline align-[-1px]" />API key ending {p.keyLast4}</> : 'No API key saved'}
                {p.updatedAt && ` · updated ${formatDate(p.updatedAt, { day: 'numeric', month: 'short' })}`}
              </p>
              <div className="mt-auto flex gap-4 pt-4 text-sm font-bold">
                <button type="button" className="inline-flex items-center gap-1 text-forest hover:underline" onClick={() => setConfiguring(p)}><Settings2 size={14} aria-hidden /> Configure</button>
                <button type="button" className="inline-flex items-center gap-1 text-forest hover:underline" onClick={() => setTesting(p)}><Send size={14} aria-hidden /> Send test</button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate">API keys are stored on the server and never shown again; only their last four characters appear here.</p>
    </form>

      <ConfigureDialog
        provider={configuring}
        onClose={() => setConfiguring(null)}
        onDone={(next, channel) => {
          setConfiguring(null);
          queryClient.setQueryData(['admin', 'notifications'], next);
          const p = next.providers.find((x) => x.channel === channel)!;
          setNotice(p.status === 'pending' ? `${CHANNEL_LABEL[channel]} provider saved. ${p.provider} is reviewing the sender; WhatsApp messages stay off until it’s approved.` : `${CHANNEL_LABEL[channel]} provider saved and connected. Saved to the audit log.`);
        }}
      />
      <SendTestDialog provider={testing} onClose={() => setTesting(null)} />
    </>
  );
}

function ConfigureDialog({ provider, onClose, onDone }: { provider: NotificationProvider | null; onClose: () => void; onDone: (s: NotificationSettings, c: NotificationChannel) => void }) {
  return (
    <Dialog open={!!provider} onClose={onClose} title="Configure provider" className="max-w-lg">
      {provider && <ConfigureForm key={provider.channel} provider={provider} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function configSchema(channel: NotificationChannel, hasKey: boolean) {
  return z.object({
    provider: z.string().min(1, 'Choose a provider'),
    sender:
      channel === 'email'
        ? z.string().trim().email('Enter the address emails come from')
        : channel === 'sms'
          ? z.string().trim().regex(/^[A-Za-z0-9 ]{3,11}$/, 'Use 3–11 letters or numbers')
          : z.string().trim().regex(/^\+?[0-9][0-9 ]{7,16}$/, 'Enter the number with the country code'),
    apiKey: hasKey ? z.string().trim().refine((v) => !v || v.length >= 12, 'That API key looks too short') : z.string().trim().min(12, 'Paste the API key from your provider'),
  });
}

function ConfigureForm({ provider, onClose, onDone }: { provider: NotificationProvider; onClose: () => void; onDone: (s: NotificationSettings, c: NotificationChannel) => void }) {
  const c = provider.channel;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ provider: string; sender: string; apiKey: string }>({ resolver: zodResolver(configSchema(c, !!provider.keyLast4)), defaultValues: { provider: provider.provider, sender: provider.sender, apiKey: '' } });
  return (
    <form
      noValidate
      className="p-6"
      onSubmit={handleSubmit(async (v) => {
        try {
          onDone(await notificationsApi.configure(c, { provider: v.provider, sender: v.sender, apiKey: v.apiKey || undefined }), c);
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t save the provider. Please try again.'), { id: 'provider' });
        }
      })}
    >
      <h2 className="text-xl">{CHANNEL_LABEL[c]} provider</h2>
      <div className="mt-5 grid gap-4">
        <Select label="Provider" {...register('provider')} error={errors.provider?.message}>
          {PROVIDERS[c].map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input label={SENDER[c].label} placeholder={SENDER[c].placeholder} hint={SENDER[c].hint} {...register('sender')} error={errors.sender?.message} />
        <Input
          label="API key"
          type="password"
          autoComplete="off"
          placeholder={provider.keyLast4 ? `Saved key ending ${provider.keyLast4}` : 'Paste the key'}
          hint={provider.keyLast4 ? 'Leave empty to keep the saved key.' : 'From your provider’s dashboard. It’s never shown again.'}
          {...register('apiKey')}
          error={errors.apiKey?.message}
        />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save provider'}</Button>
      </div>
    </form>
  );
}

function SendTestDialog({ provider, onClose }: { provider: NotificationProvider | null; onClose: () => void }) {
  return (
    <Dialog open={!!provider} onClose={onClose} title="Send a test message" className="max-w-md">
      {provider && <SendTestForm key={provider.channel} provider={provider} onClose={onClose} />}
    </Dialog>
  );
}

function SendTestForm({ provider, onClose }: { provider: NotificationProvider; onClose: () => void }) {
  const { user } = useAuth();
  const email = provider.channel === 'email';
  const [sent, setSent] = useState<string | null>(null);
  const schema = z.object({ to: email ? z.string().trim().email('Enter an email address') : z.string().trim().regex(/^\+?[0-9][0-9 ]{7,16}$/, 'Enter a phone number with the country code') });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ to: string }>({ resolver: zodResolver(schema), defaultValues: { to: (email ? user?.email : user?.phone) ?? '' } });
  return (
    <form
      noValidate
      className="p-6"
      onSubmit={handleSubmit(async ({ to }) => {
        setSent(null);
        try {
          const r = await notificationsApi.sendTest(provider.channel, to);
          setSent(r.sentTo);
        } catch (err) {
          notifyError(errorMessage(err, 'We couldn’t send the test. Please try again.'), { id: 'send-test' });
        }
      })}
    >
      <h2 className="text-xl">Test {CHANNEL_LABEL[provider.channel]}</h2>
      <p className="mt-1 text-sm text-slate">Sends a short test through {provider.provider} from {provider.sender}.</p>
      <Input className="mt-4" label={email ? 'Send to email' : 'Send to phone'} type={email ? 'email' : 'tel'} {...register('to')} error={errors.to?.message} />
      {sent && <Alert tone="success" className="mt-4">Test sent to {sent}. It can take a minute to arrive.</Alert>}
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>{sent ? 'Done' : 'Cancel'}</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : sent ? 'Send again' : 'Send test'}</Button>
      </div>
    </form>
  );
}
