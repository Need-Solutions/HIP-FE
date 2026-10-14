import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CheckInMethod, ManifestTicket } from '@/types/domain';
import type { PinHash } from '@/lib/pin';

// Local store for offline check-in on staff phones. See CLAUDE.md "Offline check-in".
//   manifests  one row per downloaded event: the public key and download time
//   tickets    the downloaded ticket list (names only, no contact details: TKT-018)
//   checkins   scans made on this phone; `synced` flips once the server has them
//   meta       small values such as the last sync time

export interface StoredManifest {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  downloadedAt: string;
  generatedAt: string;
  salesCloseAt: string;
  /** Wiped automatically after this (see purgeExpired). */
  expiresAt: string;
  policy: { admitNotInList: boolean; requireSupervisorPin: boolean; supervisorPin?: PinHash };
  publicKeyJwk: JsonWebKey;
  ticketCount: number;
}

export interface LocalCheckIn {
  localId: string;
  eventId: string;
  ticketCode: string;
  holderName: string;
  ticketTypeName: string;
  checkedInAt: string;
  method: CheckInMethod;
  staffUserId: string;
  staffName: string;
  gate?: string;
  deviceId: string;
  /** Admitted although the ticket wasn't in the offline list; an admin reviews it after sync. */
  flagged: boolean;
  /** Re-entry approved with the supervisor PIN (the hiker was already checked in). */
  reentry?: boolean;
  /** 0 = waiting, 1 = on the server (IndexedDB can't index booleans). */
  synced: 0 | 1;
}

interface HipOfflineDB extends DBSchema {
  manifests: { key: string; value: StoredManifest };
  tickets: { key: string; value: ManifestTicket; indexes: { byEvent: string } };
  checkins: { key: string; value: LocalCheckIn; indexes: { byEvent: string; bySynced: number; byTicket: string } };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<HipOfflineDB>> | null = null;

export const offlineDb = () =>
  (dbPromise ??= openDB<HipOfflineDB>('hip-offline', 2, {
    upgrade(db, oldVersion) {
      // v1 was an unused draft schema; start clean.
      if (oldVersion < 2) {
        for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
        db.createObjectStore('manifests', { keyPath: 'eventId' });
        db.createObjectStore('tickets', { keyPath: 'code' }).createIndex('byEvent', 'eventId');
        const c = db.createObjectStore('checkins', { keyPath: 'localId' });
        c.createIndex('byEvent', 'eventId');
        c.createIndex('bySynced', 'synced');
        c.createIndex('byTicket', 'ticketCode');
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  }));

const expired = (m: StoredManifest, now = Date.now()) => new Date(m.expiresAt).getTime() <= now;

/** The event's saved list, unless it has expired (an expired list is wiped on the spot). */
export async function getManifest(eventId: string) {
  const m = await (await offlineDb()).get('manifests', eventId);
  if (m && expired(m)) {
    await forgetEventTickets(eventId);
    return undefined;
  }
  return m;
}

export async function listManifests() {
  await purgeExpired();
  return (await offlineDb()).getAll('manifests');
}

/**
 * Wipes ticket lists past their expiry (default 24 hours after download), with the synced scans that carry
 * names. Unsynced scans stay until they reach the server. Returns how many events were wiped.
 */
export async function purgeExpired(): Promise<number> {
  const all = await (await offlineDb()).getAll('manifests');
  const old = all.filter((m) => expired(m));
  for (const m of old) await forgetEventTickets(m.eventId);
  return old.length;
}

export async function eventTickets(eventId: string) {
  return (await offlineDb()).getAllFromIndex('tickets', 'byEvent', eventId);
}

export async function localCheckIns(eventId: string) {
  return (await offlineDb()).getAllFromIndex('checkins', 'byEvent', eventId);
}

export async function unsyncedCheckIns(eventId?: string) {
  const all = await (await offlineDb()).getAllFromIndex('checkins', 'bySynced', 0);
  return eventId ? all.filter((c) => c.eventId === eventId) : all;
}

export async function getMeta(key: string) {
  return (await (await offlineDb()).get('meta', key))?.value;
}

export async function setMeta(key: string, value: string) {
  await (await offlineDb()).put('meta', { key, value });
}

/** Records that a ticket was checked in (e.g. by an online scan), so a later offline scan sees it as used. */
export async function markTicketCheckedIn(code: string, checkedIn: ManifestTicket['checkedIn']) {
  const db = await offlineDb();
  const t = await db.get('tickets', code);
  if (t && !t.checkedIn) await db.put('tickets', { ...t, checkedIn });
}

/**
 * Removes an event's ticket list (names) from the phone: when attendance closes or the list expires. Synced scans
 * go too; scans that haven't reached the server are never deleted (closing is blocked while any exist).
 */
export async function forgetEventTickets(eventId: string) {
  const db = await offlineDb();
  const tx = db.transaction(['tickets', 'manifests', 'checkins'], 'readwrite');
  for (const t of await tx.objectStore('tickets').index('byEvent').getAll(eventId)) await tx.objectStore('tickets').delete(t.code);
  for (const c of await tx.objectStore('checkins').index('byEvent').getAll(eventId)) if (c.synced) await tx.objectStore('checkins').delete(c.localId);
  await tx.objectStore('manifests').delete(eventId);
  await tx.done;
}
