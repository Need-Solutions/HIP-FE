import { getManifest, getMeta, localCheckIns, offlineDb, setMeta, type LocalCheckIn } from './db';
import { PIN_MAX_TRIES, verifyPin } from '@/lib/pin';
import { parseTicketQr, verifyTicketQr } from '@/lib/ticketQr';
import type { CheckInMethod, ManifestTicket, ScanOutcome } from '@/types/domain';

// Offline validation on the phone (CLAUDE.md "Offline check-in" 2 and 3). Nothing here touches the network:
// the signature is checked with the event's public key from the manifest (lib/ticketQr.ts), then the ticket's
// event, status and local duplicates. A valid scan is saved as unsynced and uploaded later by sync.ts.

export interface ScanStaff {
  id: string;
  name: string;
  gate?: string;
}

export class NotDownloadedError extends Error {
  constructor() {
    super('This event isn’t saved on this phone. Connect to the internet and download it first.');
  }
}

/** First scan of a ticket that this phone knows about: from the download, or a scan made here. */
async function priorScan(ticket: ManifestTicket | undefined, code: string, eventId: string) {
  const local = (await localCheckIns(eventId)).filter((c) => c.ticketCode === code).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))[0];
  if (local) return { at: local.checkedInAt, staffName: local.staffName, gate: local.gate };
  return ticket?.checkedIn;
}

async function save(eventId: string, ticket: Pick<ManifestTicket, 'code' | 'holderName' | 'ticketTypeName'>, staff: ScanStaff, deviceId: string, method: CheckInMethod, flagged: boolean, reentry = false) {
  const record: LocalCheckIn = {
    localId: crypto.randomUUID(),
    eventId,
    ticketCode: ticket.code,
    holderName: ticket.holderName,
    ticketTypeName: ticket.ticketTypeName,
    checkedInAt: new Date().toISOString(),
    method,
    staffUserId: staff.id,
    staffName: staff.name,
    gate: staff.gate,
    deviceId,
    flagged,
    reentry: reentry || undefined,
    synced: 0,
  };
  await (await offlineDb()).put('checkins', record);
  return record;
}

/** Validates a scanned QR payload without network and records the check-in when it's valid. */
export async function scanOffline(payload: string, eventId: string, staff: ScanStaff, deviceId: string): Promise<ScanOutcome> {
  const manifest = await getManifest(eventId);
  if (!manifest) throw new NotDownloadedError();

  const parsed = parseTicketQr(payload);
  if (!parsed) return { kind: 'invalid', reason: 'not_hip' };
  if (!(await verifyTicketQr(payload, manifest.publicKeyJwk))) return { kind: 'invalid', reason: 'bad_signature', code: parsed.code };
  if (parsed.eventId !== eventId) return { kind: 'invalid', reason: 'wrong_event', code: parsed.code };

  const ticket = await (await offlineDb()).get('tickets', parsed.code);
  if (!ticket || ticket.eventId !== eventId) return { kind: 'not_in_offline_list', code: parsed.code };
  return admit(ticket, eventId, staff, deviceId, 'qr_offline');
}

/** Manual search while offline: the hiker is found by name, so there's no signature to check. */
export async function checkInOfflineByCode(code: string, eventId: string, staff: ScanStaff, deviceId: string): Promise<ScanOutcome> {
  if (!(await getManifest(eventId))) throw new NotDownloadedError();
  const ticket = await (await offlineDb()).get('tickets', code);
  if (!ticket || ticket.eventId !== eventId) return { kind: 'invalid', reason: 'unknown_ticket', code };
  return admit(ticket, eventId, staff, deviceId, 'manual');
}

async function admit(ticket: ManifestTicket, eventId: string, staff: ScanStaff, deviceId: string, method: CheckInMethod): Promise<ScanOutcome> {
  if (ticket.status !== 'confirmed') {
    return { kind: 'invalid', reason: ticket.status, code: ticket.code, holderName: ticket.holderName, detail: ticket.statusChangedAt };
  }
  const prior = await priorScan(ticket, ticket.code, eventId);
  if (prior) return { kind: 'already_used', code: ticket.code, holderName: ticket.holderName, ticketTypeName: ticket.ticketTypeName, firstScan: prior };
  const saved = await save(eventId, ticket, staff, deviceId, method, false);
  return {
    kind: 'valid',
    offline: true,
    code: ticket.code,
    holderName: ticket.holderName,
    ticketTypeName: ticket.ticketTypeName,
    scan: { at: saved.checkedInAt, staffName: staff.name, gate: staff.gate },
  };
}

/**
 * "Admit & flag" (CLAUDE.md "Offline check-in" 3): the signature was valid but the ticket isn't in the list.
 * Staff have checked ID; the scan is saved flagged so an admin reviews it after sync.
 */
export async function admitFlagged(code: string, eventId: string, staff: ScanStaff, deviceId: string): Promise<ScanOutcome> {
  const prior = await priorScan(undefined, code, eventId);
  if (prior) return { kind: 'already_used', code, holderName: 'Name not on this phone', firstScan: prior };
  const saved = await save(eventId, { code, holderName: 'Not in offline list', ticketTypeName: '' }, staff, deviceId, 'qr_offline', true);
  return {
    kind: 'valid',
    offline: true,
    flagged: true,
    code,
    holderName: 'Admitted and flagged',
    ticketTypeName: '',
    scan: { at: saved.checkedInAt, staffName: staff.name, gate: staff.gate },
  };
}

/** A refused supervisor PIN. Same shape as the server's PinErrorBody, so the screen shows either the same way. */
export class PinError extends Error {
  constructor(
    public code: 'invalid_pin' | 'pin_locked' | 'pin_not_set',
    message: string,
    public attemptsLeft?: number,
  ) {
    super(message);
  }
}

const pinKey = (eventId: string) => `pinFails.${eventId}`;

/** Lifts offline PIN lockouts once the phone is back online (where the server checks PINs instead). */
export async function clearPinLocks(eventIds: string[]) {
  for (const id of eventIds) await setMeta(pinKey(id), JSON.stringify({ fails: 0, locked: false }));
}

/**
 * Re-entry with no signal: checks the PIN against the salted hash in the download (lib/pin.ts) and saves the scan
 * as a re-entry for sync. After 5 wrong tries, re-entry is locked on this phone until it's back online.
 */
export async function approveReentryOffline(
  ticket: Pick<ManifestTicket, 'code' | 'holderName' | 'ticketTypeName'>,
  eventId: string,
  staff: ScanStaff,
  deviceId: string,
  pin: string,
): Promise<ScanOutcome> {
  const manifest = await getManifest(eventId);
  if (!manifest) throw new NotDownloadedError();
  const stored = manifest.policy.supervisorPin;
  if (!stored) throw new PinError('pin_not_set', 'No supervisor PIN is set for this event. Ask an admin.');
  const state = JSON.parse((await getMeta(pinKey(eventId))) ?? '{"fails":0,"locked":false}') as { fails: number; locked: boolean };
  if (state.locked) throw new PinError('pin_locked', 'Too many wrong PINs. Re-entry is locked on this phone until it’s back online.');
  if (!(await verifyPin(pin, stored))) {
    state.fails += 1;
    state.locked = state.fails >= PIN_MAX_TRIES;
    await setMeta(pinKey(eventId), JSON.stringify(state));
    if (state.locked) throw new PinError('pin_locked', 'Too many wrong PINs. Re-entry is locked on this phone until it’s back online.');
    throw new PinError('invalid_pin', 'Wrong PIN.', PIN_MAX_TRIES - state.fails);
  }
  await setMeta(pinKey(eventId), JSON.stringify({ fails: 0, locked: false }));
  const saved = await save(eventId, ticket, staff, deviceId, 'qr_offline', false, true);
  return {
    kind: 'valid',
    offline: true,
    reentry: true,
    code: ticket.code,
    holderName: ticket.holderName,
    ticketTypeName: ticket.ticketTypeName,
    scan: { at: saved.checkedInAt, staffName: staff.name, gate: staff.gate },
  };
}
