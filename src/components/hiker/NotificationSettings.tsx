import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '@/api/endpoints';
import { Card, Select, Switch } from '@/components/ui';
import type { HikerProfile, NotificationPrefs, ReminderChannel } from '@/types/domain';

// NOT-010: ticket confirmations and receipts are required, so their switch is locked on. Event reminders can be
// turned off or moved to one channel. News, offers and partner promotions are opt-in: off until the hiker turns
// them on. Each change saves straight away.

const channels: { value: ReminderChannel; label: string }[] = [
  { value: 'email_whatsapp', label: 'Email + WhatsApp' },
  { value: 'email', label: 'Email only' },
  { value: 'whatsapp', label: 'WhatsApp only' },
];

type Editable = Omit<NotificationPrefs, 'ticketConfirmations'>;

export function NotificationSettings({ prefs }: { prefs: NotificationPrefs }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<Editable>({ reminders: prefs.reminders, reminderChannel: prefs.reminderChannel, promotions: prefs.promotions });
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: profileApi.updateNotifications,
    // A failure shows as a toast through the global listener (api/queryClient.ts).
    meta: { errorMessage: 'We couldn’t save that change. Please try again.' },
    onSuccess: (prefs) => {
      setSaved(true);
      queryClient.setQueryData<HikerProfile>(['profile'], (p) => (p ? { ...p, notifications: prefs } : p));
    },
  });

  const change = (patch: Partial<Editable>) => {
    const previous = value;
    const next = { ...value, ...patch };
    setValue(next);
    setSaved(false);
    save.mutate(next, { onError: () => setValue(previous) });
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">Notifications</h2>
        <p aria-live="polite" className="text-[13px] font-semibold text-forest">{saved && !save.isPending ? 'Saved' : ''}</p>
      </div>

      <ul className="mt-3 divide-y divide-line">
        <Row id="n-confirm" label="Ticket confirmations and receipts" middle={<span className="text-[13px] text-slate">Required</span>}>
          <Switch checked locked aria-labelledby="n-confirm-label" aria-describedby="n-confirm-middle" />
        </Row>
        <Row
          id="n-remind"
          label="Event reminders (24 hrs before)"
          middle={
            <Select
              label="Reminder channel"
              hideLabel
              value={value.reminderChannel}
              disabled={!value.reminders}
              onChange={(e) => change({ reminderChannel: e.target.value as ReminderChannel })}
              className="w-full md:w-[200px]"
            >
              {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          }
        >
          <Switch checked={value.reminders} onChange={(reminders) => change({ reminders })} aria-labelledby="n-remind-label" />
        </Row>
        <Row id="n-promo" label="News, offers and partner promotions" middle={<span className="text-[13px] text-slate">Optional</span>}>
          <Switch checked={value.promotions} onChange={(promotions) => change({ promotions })} aria-labelledby="n-promo-label" aria-describedby="n-promo-middle" />
        </Row>
      </ul>
    </Card>
  );
}

function Row({ id, label, middle, children }: { id: string; label: string; middle: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[minmax(0,420px)_1fr_auto]">
      <span id={`${id}-label`} className="text-[15px] font-medium text-ink">{label}</span>
      <div id={`${id}-middle`} className="col-start-1 row-start-2 md:col-start-2 md:row-start-1">{middle}</div>
      <div className="col-start-2 row-span-2 row-start-1 md:col-start-3 md:row-span-1">{children}</div>
    </li>
  );
}
