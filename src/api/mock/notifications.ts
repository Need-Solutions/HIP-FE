import { ApiError } from '../client';
import { mockStaff } from './data';
import { pushAudit, update, type MockState } from './store';
import { can } from '@/lib/permissions';
import type { DeliveryPage, DeliveryQuery, DeliveryRecord, MessageSetting, MessageType, NotificationChannel, NotificationSettings, ProviderInput } from '../endpoints';
import { lagosDay } from '@/lib/analytics';

// Mock notification settings (Admin / Notifications). Rules the backend must keep:
//   - Transactional messages always go by email and can't be turned off (NOT-011). Promotional messages go only to
//     hikers who opted in (NOT-010).
//   - A channel only sends through a connected provider; switches for other channels stay off.
//   - Provider API keys are write-only: only the last four characters come back.
//   - Changes to messages and providers are audit-logged.

export const CHANNEL_LABEL: Record<NotificationChannel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };

function seed(s: MockState): NotificationSettings {
  return (s.notifications ??= {
    messages: [
      { type: 'registration', label: 'Registration confirmation', category: 'transactional', channels: { email: true, sms: false, whatsapp: false } },
      { type: 'verification', label: 'Verification code', category: 'transactional', channels: { email: true, sms: true, whatsapp: false } },
      { type: 'ticket', label: 'Ticket confirmation + QR', category: 'transactional', channels: { email: true, sms: false, whatsapp: false } },
      { type: 'reminder', label: 'Event reminder (24 hrs before)', category: 'transactional', channels: { email: true, sms: true, whatsapp: false } },
      { type: 'event_change', label: 'Event rescheduled or cancelled', category: 'transactional', channels: { email: true, sms: true, whatsapp: false } },
      { type: 'payment', label: 'Payment and refund updates', category: 'transactional', channels: { email: true, sms: false, whatsapp: false } },
      { type: 'promotions', label: 'New hikes and partner offers', category: 'promotional', channels: { email: true, sms: false, whatsapp: false } },
    ],
    providers: [
      { channel: 'email', provider: 'Resend', sender: 'hello@hip.ng', status: 'connected', keyLast4: '9f2c', updatedAt: '2026-06-02T10:00:00Z' },
      { channel: 'sms', provider: 'Termii', sender: 'HIP', status: 'connected', keyLast4: 'a71d', updatedAt: '2026-06-02T10:00:00Z' },
      { channel: 'whatsapp', provider: 'Meta Business', sender: '+234 801 234 5678', status: 'pending', keyLast4: '33be', updatedAt: '2026-10-09T15:00:00Z' },
    ],
  });
}

function guard(s: MockState) {
  if (!can(s.sessionUser ?? mockStaff[0], 'manage_settings')) throw new ApiError(403, 'Only admins can change notifications.');
}

// --- Delivery log (NOT-009): a month of sample deliveries, plus every test send. ---

const LOG_KEY = 'hip.mock.deliveries';
const PEOPLE = ['Adaeze Okafor', 'Tobi Martins', 'Kemi Adeleke', 'Chinedu Eze', 'Ngozi Okonkwo', 'Femi Balogun', 'Bisi Bello', 'Emeka Nwosu', 'Funke Afolabi', 'Yemi Okeke', 'Halima Ibrahim', 'Segun Lawal'];
const TYPES: MessageType[] = ['ticket', 'ticket', 'reminder', 'reminder', 'verification', 'registration', 'payment', 'event_change', 'promotions'];
const ERRORS: Record<NotificationChannel, string[]> = {
  email: ['Mailbox full', 'Address does not exist'],
  sms: ['Number unreachable', 'DND (do not disturb) list'],
  whatsapp: ['Not a WhatsApp number'],
};

function seededLog(): DeliveryRecord[] {
  let x = 42;
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const out: DeliveryRecord[] = [];
  for (let i = 0; i < 180; i++) {
    const name = PEOPLE[Math.floor(r() * PEOPLE.length)];
    const type = TYPES[Math.floor(r() * TYPES.length)];
    const channel: NotificationChannel = type === 'verification' && r() < 0.5 ? 'sms' : type === 'reminder' && r() < 0.4 ? 'sms' : 'email';
    const roll = r();
    const status: DeliveryRecord['status'] = roll < 0.05 ? 'failed' : roll < 0.08 ? 'bounced' : roll < 0.12 ? 'sent' : 'delivered';
    const handle = name.toLowerCase().replace(/\s+/g, '.');
    out.push({
      id: `dlv_${i}`,
      at: new Date(Date.now() - Math.floor(r() * 30 * 24 * 60) * 60_000).toISOString(),
      recipientName: name,
      recipient: channel === 'email' ? `${handle}@example.com` : `+234 80${Math.floor(10000000 + r() * 89999999)}`,
      type,
      channel,
      status,
      error: status === 'failed' || status === 'bounced' ? ERRORS[channel][Math.floor(r() * ERRORS[channel].length)] : undefined,
      reference: type === 'ticket' || type === 'reminder' ? `HIP-${Math.floor(1000 + r() * 8999)}` : type === 'payment' ? `PSK_${Math.floor(1000000 + r() * 8999999)}` : undefined,
    });
  }
  return out;
}

function readLog(): DeliveryRecord[] {
  try {
    const extra = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]') as DeliveryRecord[];
    return [...extra, ...seededLog()];
  } catch {
    return seededLog();
  }
}

function appendLog(rec: DeliveryRecord) {
  try {
    const extra = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]') as DeliveryRecord[];
    sessionStorage.setItem(LOG_KEY, JSON.stringify([rec, ...extra].slice(0, 100)));
  } catch {
    // The test still "sends"; it just won't be listed.
  }
}

const connected = (n: NotificationSettings, c: NotificationChannel) => n.providers.find((p) => p.channel === c)?.status === 'connected';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ]{7,16}$/;

export const mockNotifications = {
  get: (): NotificationSettings =>
    update((s) => {
      guard(s);
      return seed(s);
    }),

  saveMessages: (incoming: MessageSetting[]): NotificationSettings =>
    update((s) => {
      guard(s);
      const n = seed(s);
      const changes: string[] = [];
      for (const m of n.messages) {
        const next = incoming.find((x) => x.type === m.type)?.channels;
        if (!next) continue;
        for (const c of ['email', 'sms', 'whatsapp'] as const) {
          let v = next[c];
          if (c === 'email' && m.category === 'transactional') v = true; // NOT-011
          if (v && !connected(n, c)) v = false;
          if (v !== m.channels[c]) changes.push(`${m.label} by ${CHANNEL_LABEL[c]} ${v ? 'on' : 'off'}`);
          m.channels[c] = v;
        }
      }
      if (changes.length) pushAudit(s, { action: 'notifications.updated', recordType: 'settings', recordId: 'notifications', details: changes.join('; ') });
      return n;
    }),

  configure: (channel: NotificationChannel, input: ProviderInput): NotificationSettings =>
    update((s) => {
      guard(s);
      const n = seed(s);
      const p = n.providers.find((x) => x.channel === channel)!;
      if (!input.provider.trim()) throw new ApiError(400, 'Choose a provider.');
      if (channel === 'email' && !EMAIL.test(input.sender)) throw new ApiError(400, 'Enter the address emails come from.');
      if (channel === 'sms' && !/^[A-Za-z0-9 ]{3,11}$/.test(input.sender)) throw new ApiError(400, 'Sender IDs are 3–11 letters or numbers.');
      if (channel === 'whatsapp' && !PHONE.test(input.sender)) throw new ApiError(400, 'Enter the WhatsApp business number.');
      const key = input.apiKey?.trim();
      if (!key && !p.keyLast4) throw new ApiError(400, 'Paste the API key from your provider.');
      if (key && key.length < 12) throw new ApiError(400, 'That API key looks too short.');
      const providerChanged = p.provider !== input.provider || p.sender !== input.sender;
      Object.assign(p, {
        provider: input.provider,
        sender: input.sender.trim(),
        ...(key ? { keyLast4: key.slice(-4) } : {}),
        // Meta reviews every new WhatsApp sender; email and SMS connect at once in the mock.
        status: channel === 'whatsapp' && (providerChanged || key || p.status !== 'connected') ? 'pending' : 'connected',
        updatedAt: new Date().toISOString(),
      });
      if (p.status !== 'connected') for (const m of n.messages) m.channels[channel] = false;
      pushAudit(s, { action: 'notifications.provider_configured', recordType: 'settings', recordId: `provider_${channel}`, details: `${CHANNEL_LABEL[channel]} provider: ${p.provider} · ${p.sender}${key ? ' · new API key' : ''}${p.status === 'pending' ? ' · pending approval' : ''}` });
      return n;
    }),

  sendTest: (channel: NotificationChannel, to: string): { sentTo: string } =>
    update((s) => {
      guard(s);
      const n = seed(s);
      const p = n.providers.find((x) => x.channel === channel)!;
      if (p.status === 'pending') throw new ApiError(409, `${p.provider} is still reviewing your ${CHANNEL_LABEL[channel]} sender, so tests can’t be sent yet.`);
      if (p.status !== 'connected') throw new ApiError(409, `Connect a ${CHANNEL_LABEL[channel]} provider first.`);
      const target = to.trim();
      if (channel === 'email' ? !EMAIL.test(target) : !PHONE.test(target)) throw new ApiError(400, channel === 'email' ? 'Enter an email address.' : 'Enter a phone number with the country code.');
      appendLog({ id: `dlv_t${Date.now()}`, at: new Date().toISOString(), recipientName: (s.sessionUser ?? mockStaff[0]).fullName, recipient: target, type: 'test', channel, status: 'delivered' });
      return { sentTo: target };
    }),

  log: (q: DeliveryQuery): DeliveryPage =>
    update((s) => {
      guard(s);
      let rows = readLog().sort((a, b) => b.at.localeCompare(a.at));
      if (q.from) rows = rows.filter((r) => lagosDay(new Date(r.at)) >= q.from!);
      if (q.to) rows = rows.filter((r) => lagosDay(new Date(r.at)) <= q.to!);
      if (q.type) rows = rows.filter((r) => r.type === q.type);
      if (q.channel) rows = rows.filter((r) => r.channel === q.channel);
      const term = q.q?.trim().toLowerCase();
      if (term) rows = rows.filter((r) => [r.recipient, r.recipientName ?? '', r.reference ?? ''].some((v) => v.toLowerCase().includes(term)));
      const summary = { queued: 0, sent: 0, delivered: 0, failed: 0, bounced: 0 } as DeliveryPage['summary'];
      for (const r of rows) summary[r.status]++;
      if (q.status) rows = rows.filter((r) => r.status === q.status);
      const pageSize = 15;
      const page = Math.max(1, q.page);
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, summary };
    }),
};
