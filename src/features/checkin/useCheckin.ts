import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { checkinApi, pinError } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthContext';
import { deviceId, deviceLabel } from './device';
import { eventTickets, getManifest, getMeta, listManifests, localCheckIns, markTicketCheckedIn, purgeExpired, unsyncedCheckIns } from './offline/db';
import { downloadForOffline } from './offline/download';
import { NotDownloadedError, PinError, admitFlagged, approveReentryOffline, checkInOfflineByCode, clearPinLocks, scanOffline, type ScanStaff } from './offline/scan';
import { LAST_SYNC_KEY, syncPendingCheckIns } from './offline/sync';
import { useOnlineStatus } from './useOnlineStatus';
import type { ScanOutcome } from '@/types/domain';

// Shared state for the check-in screens. Everything read from IndexedDB uses networkMode "always", because
// TanStack Query otherwise pauses queries while the phone is offline, which is exactly when they matter.

/** NFR-003: a result within 2 seconds. Online scans that take longer fall back to the offline check. */
export const ONLINE_SCAN_TIMEOUT_MS = 1500;
const AUTO_SYNC_MS = 20_000;

export const checkinKeys = {
  all: ['checkin'] as const,
  events: ['checkin', 'events'] as const,
  manifests: ['checkin', 'manifests'] as const,
  local: (eventId: string) => ['checkin', 'local', eventId] as const,
  stats: (eventId: string) => ['checkin', 'stats', eventId] as const,
  roster: (eventId: string, online: boolean) => ['checkin', 'roster', eventId, online] as const,
  conflicts: (eventId: string) => ['checkin', 'conflicts', eventId] as const,
};

/** "Kunle Adeyemi" → "Kunle A.", as the frames show staff. */
export const shortName = (fullName: string) => {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

export function useStaff(gate?: string): ScanStaff {
  const { user } = useAuth();
  return { id: user?.id ?? 'staff_dev', name: user ? shortName(user.fullName) : 'Staff', gate };
}

/** Events to check in. Offline, falls back to the events saved on this phone. */
export function useCheckinEvents() {
  const online = useOnlineStatus();
  // Silent: offline, the screens fall back to events saved on the phone and the offline banner explains why.
  const events = useQuery({ queryKey: checkinKeys.events, queryFn: checkinApi.events, networkMode: 'always', retry: online ? 1 : 0, meta: { silentError: true } });
  // Re-read on every screen: cheap, and listManifests() wipes lists that have expired.
  const manifests = useQuery({ queryKey: checkinKeys.manifests, queryFn: listManifests, networkMode: 'always', staleTime: 0, refetchOnMount: 'always' });
  return { events, manifests, online };
}

export const DEFAULT_GATE = 'Gate A';
const gateKey = (eventId: string) => `hip.gate.${eventId}`;

function storedGate(eventId: string) {
  try {
    return localStorage.getItem(gateKey(eventId)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The gate this phone scans at: the admin's assignment if there is one, else the one staff picked on Select
 * event (kept on this phone), else Gate A.
 */
export function useGate(eventId: string, assigned?: string) {
  const [picked, setPicked] = useState(() => storedGate(eventId));
  const choose = (gate: string) => {
    try {
      localStorage.setItem(gateKey(eventId), gate);
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    setPicked(gate);
  };
  return { gate: assigned ?? picked ?? DEFAULT_GATE, assigned: !!assigned, choose };
}

/** One event's title and gate, from the server when possible, else from the download. */
export function useCheckinEvent(eventId: string) {
  const { events, manifests } = useCheckinEvents();
  const fromServer = events.data?.find((e) => e.event.id === eventId);
  const saved = manifests.data?.find((m) => m.eventId === eventId);
  const { gate } = useGate(eventId, fromServer?.gate);
  return {
    title: fromServer?.event.title ?? saved?.eventTitle ?? '',
    gate,
    event: fromServer,
    manifest: saved,
    /** Admin policy: from the server when online, else as downloaded. */
    admitNotInList: saved?.policy.admitNotInList ?? true,
    requireSupervisorPin: fromServer?.reentry.pinRequired ?? saved?.policy.requireSupervisorPin ?? false,
    /** A PIN exists for this event: per the server when online, else per the download. */
    supervisorPinSet: fromServer?.reentry.pinSet ?? !!saved?.policy.supervisorPin,
    offlineAllowed: fromServer?.offline.allowed ?? !!saved,
    loading: events.isLoading && manifests.isLoading,
  };
}

export interface LocalState {
  downloaded: boolean;
  downloadedAt?: string;
  ticketCount: number;
  /** Checked in as far as this phone knows: from the download, online scans here, and local scans. */
  checkedIn: number;
  unsynced: number;
  localTotal: number;
  lastSyncAt?: string;
}

async function readLocal(eventId: string): Promise<LocalState> {
  const [manifest, tickets, mine, lastSyncAt] = await Promise.all([getManifest(eventId), eventTickets(eventId), localCheckIns(eventId), getMeta(LAST_SYNC_KEY)]);
  const checked = new Set(tickets.filter((t) => t.checkedIn).map((t) => t.code));
  for (const c of mine) checked.add(c.ticketCode);
  return {
    downloaded: !!manifest,
    downloadedAt: manifest?.downloadedAt,
    ticketCount: tickets.filter((t) => t.status === 'confirmed').length,
    checkedIn: checked.size,
    unsynced: mine.filter((c) => !c.synced).length,
    localTotal: mine.length,
    lastSyncAt,
  };
}

export function useLocalState(eventId: string) {
  return useQuery({ queryKey: checkinKeys.local(eventId), queryFn: () => readLocal(eventId), networkMode: 'always', staleTime: 0, refetchOnMount: 'always' });
}

/** Server counts. Only while online; offline screens use useLocalState. */
export function useServerStats(eventId: string, enabled = true) {
  const online = useOnlineStatus();
  return useQuery({
    queryKey: checkinKeys.stats(eventId),
    queryFn: () => checkinApi.stats(eventId),
    enabled: online && enabled,
    networkMode: 'always',
    retry: 0,
    meta: { silentError: true }, // the scanner falls back to the phone's own counts
  });
}

const isNetworkFailure = (err: unknown) => !(err instanceof ApiError) || err.status >= 500;

const timeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new TypeError('Timed out')), ms))]);

/** Remembers an online result on the phone, so a later offline scan of the same ticket shows "already used". */
async function rememberOnline(outcome: ScanOutcome) {
  if (outcome.kind === 'valid') await markTicketCheckedIn(outcome.code, outcome.scan);
  if (outcome.kind === 'already_used') await markTicketCheckedIn(outcome.code, outcome.firstScan);
}

/**
 * Checks a scanned QR payload. Online: the server decides. No signal, or no answer within
 * ONLINE_SCAN_TIMEOUT_MS: the phone checks it against the download (lib/ticketQr.ts via offline/scan.ts).
 * Throws NotDownloadedError when it can't do either.
 */
export async function checkTicket(payload: string, eventId: string, staff: ScanStaff): Promise<ScanOutcome> {
  if (navigator.onLine) {
    try {
      const outcome = await timeout(checkinApi.scan(eventId, payload, deviceId(), staff.gate), ONLINE_SCAN_TIMEOUT_MS);
      await rememberOnline(outcome).catch(() => undefined);
      return outcome;
    } catch (err) {
      if (!isNetworkFailure(err)) throw err;
      // Fall through to the offline check.
    }
  }
  return scanOffline(payload, eventId, staff, deviceId());
}

/** Manual search check-in, online or from the download. */
export async function checkInByCode(code: string, eventId: string, staff: ScanStaff): Promise<ScanOutcome> {
  if (navigator.onLine) {
    try {
      const outcome = await timeout(checkinApi.manualCheckIn(eventId, code, deviceId(), staff.gate), ONLINE_SCAN_TIMEOUT_MS);
      await rememberOnline(outcome).catch(() => undefined);
      return outcome;
    } catch (err) {
      if (!isNetworkFailure(err)) throw err;
    }
  }
  return checkInOfflineByCode(code, eventId, staff, deviceId());
}

export const admitAndFlag = (code: string, eventId: string, staff: ScanStaff) => admitFlagged(code, eventId, staff, deviceId());

/**
 * "Allow re-entry" on an already-used result, with the supervisor PIN. Online the server checks the PIN; with no
 * signal (or no answer in time) the phone checks it against the downloaded hash. Throws PinError when refused.
 */
export async function approveReentry(
  ticket: { code: string; holderName: string; ticketTypeName: string },
  eventId: string,
  staff: ScanStaff,
  pin: string,
): Promise<ScanOutcome> {
  if (navigator.onLine) {
    try {
      const outcome = await timeout(checkinApi.reentry(eventId, ticket.code, pin, deviceId(), staff.gate), ONLINE_SCAN_TIMEOUT_MS * 2);
      await clearPinLocks([eventId]).catch(() => undefined);
      return outcome;
    } catch (err) {
      const e = pinError(err);
      if (e) throw new PinError(e.code, e.message, e.attemptsLeft);
      if (!isNetworkFailure(err)) throw err;
    }
  }
  return approveReentryOffline(ticket, eventId, staff, deviceId(), pin);
}

export { PinError };

export { NotDownloadedError };

/** Tells the server what this phone holds, for Admin / Check-in settings → Staff devices. */
async function reportDevice(staffGate?: string) {
  const [manifests, waiting] = await Promise.all([listManifests(), unsyncedCheckIns()]);
  const latest = manifests.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0];
  await checkinApi.heartbeat({
    deviceId: deviceId(),
    label: deviceLabel(),
    gate: latest ? storedGate(latest.eventId) ?? staffGate : staffGate,
    list: latest ? { eventId: latest.eventId, eventTitle: latest.eventTitle, downloadedAt: latest.downloadedAt } : undefined,
    unsynced: waiting.length,
  });
}

/** Check-in opens this long before the start; auto-download refreshes lists from then (Admin / Check-in settings). */
const AUTO_DOWNLOAD_HOURS_BEFORE = 3;

/**
 * Keeps the phone in step whenever it has signal (mounted once, in CheckinLayout): uploads offline scans on
 * start, when the connection returns and every 20 s; wipes expired offline lists; reports the phone's state;
 * and, when the admin turned on auto-download, refreshes the list of an event whose check-in has opened.
 */
export function useAutoSync() {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const { events } = useCheckinEvents();
  const eventList = events.data;

  useEffect(() => {
    if (!online || !eventList) return;
    const now = Date.now();
    void (async () => {
      for (const e of eventList) {
        if (!e.offline.allowed || !e.offline.autoDownload || e.attendanceClosedAt) continue;
        const start = new Date(e.event.startsAt).getTime();
        if (start - now > AUTO_DOWNLOAD_HOURS_BEFORE * 3_600_000 || start < now - 12 * 3_600_000) continue;
        const saved = await getManifest(e.event.id);
        // Refresh once check-in has opened, so late sales are on the phone.
        if (saved && new Date(saved.downloadedAt).getTime() > start - AUTO_DOWNLOAD_HOURS_BEFORE * 3_600_000) continue;
        await downloadForOffline(e.event.id, () => undefined).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
      }
    })();
  }, [online, eventList, queryClient]);

  useEffect(() => {
    let cancelled = false;
    const tidy = () =>
      purgeExpired()
        .then((n) => {
          if (!cancelled && n > 0) void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
        })
        .catch(() => undefined);
    void tidy();
    const t = setInterval(tidy, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const run = () =>
      syncPendingCheckIns()
        .then((r) => {
          if (!cancelled && r.uploaded > 0) void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
        })
        .then(() => reportDevice())
        .catch(() => undefined); // retried on the next tick; the Sync screen shows what's waiting
    // Back online: offline PIN lockouts end straight away (the server checks PINs now).
    void listManifests()
      .then((ms) => clearPinLocks(ms.map((m) => m.eventId)))
      .catch(() => undefined);
    void run();
    const t = setInterval(run, AUTO_SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [online, queryClient]);
}
