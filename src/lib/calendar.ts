import type { HikeEvent } from '@/types/domain';

// "Add to calendar": a standard .ics file that Google, Apple and Outlook calendars all open.

/** Rough end time from labels like "About 6 hrs" or "2 days". Falls back to 4 hours. */
function durationMs(label: string): number {
  const m = label.match(/(\d+(?:\.\d+)?)\s*(day|hr|hour)/i);
  if (!m) return 4 * 3_600_000;
  return Number(m[1]) * (m[2].toLowerCase().startsWith('day') ? 86_400_000 : 3_600_000);
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

export function downloadEventIcs(
  event: Pick<HikeEvent, 'id' | 'title' | 'startsAt' | 'durationLabel' | 'meetingPoint'>,
  note?: string,
) {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + durationMs(event.durationLabel));
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HIP//Hikers Integrated Platform//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@${window.location.hostname}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.meetingPoint)}`,
    note ? `DESCRIPTION:${escape(note)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
