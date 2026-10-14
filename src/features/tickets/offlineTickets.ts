import type { TicketDetails } from '@/types/domain';

// Copies of tickets the hiker has opened, kept on their device so the QR still shows at a trailhead with no
// signal. The service worker caches the app itself; this caches the ticket data. Per-device convenience only:
// the server stays the source of truth, and a cached copy is shown only when the network request fails.

const PREFIX = 'hip.ticket.';

export function saveTicketOffline(ticket: TicketDetails): boolean {
  try {
    localStorage.setItem(PREFIX + ticket.code.toUpperCase(), JSON.stringify({ savedAt: new Date().toISOString(), ticket }));
    return true;
  } catch {
    return false;
  }
}

export function loadOfflineTicket(code: string): { savedAt: string; ticket: TicketDetails } | null {
  try {
    const raw = localStorage.getItem(PREFIX + code.toUpperCase());
    return raw ? (JSON.parse(raw) as { savedAt: string; ticket: TicketDetails }) : null;
  } catch {
    return null;
  }
}
