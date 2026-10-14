import { checkinApi } from '@/api/endpoints';
import { offlineDb, setMeta, unsyncedCheckIns } from './db';
import { deviceId, deviceLabel } from '../device';

// Uploads scans saved on this phone (CLAUDE.md "Offline check-in" 4). The server keeps the earliest scan per
// ticket and turns clashes into conflicts for an admin. Safe to call any time and repeatedly: the server
// de-duplicates by localId, and only one upload runs at once on this phone.

export const LAST_SYNC_KEY = 'lastSyncAt';

let running: Promise<SyncOutcome> | null = null;

export interface SyncOutcome {
  uploaded: number;
  conflicts: number;
}

export function syncPendingCheckIns(): Promise<SyncOutcome> {
  running ??= (async () => {
    try {
      const pending = await unsyncedCheckIns();
      if (pending.length === 0) {
        if (navigator.onLine) await setMeta(LAST_SYNC_KEY, new Date().toISOString());
        return { uploaded: 0, conflicts: 0 };
      }
      if (!navigator.onLine) throw new TypeError('Offline');
      const result = await checkinApi.sync(pending, { deviceId: deviceId(), label: deviceLabel() });
      const done = new Set(result.synced);
      const db = await offlineDb();
      const tx = db.transaction('checkins', 'readwrite');
      for (const c of pending) if (done.has(c.localId)) await tx.store.put({ ...c, synced: 1 });
      await tx.done;
      await setMeta(LAST_SYNC_KEY, new Date().toISOString());
      return { uploaded: done.size, conflicts: result.conflicts };
    } finally {
      running = null;
    }
  })();
  return running;
}
