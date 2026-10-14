import { checkinApi } from '@/api/endpoints';
import { offlineDb } from './db';

// "Download for offline" (CLAUDE.md "Offline check-in" 1): fetch the manifest while online and save it in
// IndexedDB. The manifest row is written last, so a download that stops halfway is never treated as ready.

export interface DownloadProgress {
  key: boolean;
  savedTickets: number;
  totalTickets: number;
  names: boolean;
  done: boolean;
  sizeBytes?: number;
}

const BATCH = 25;

export async function downloadForOffline(eventId: string, onProgress: (p: DownloadProgress) => void) {
  const manifest = await checkinApi.manifest(eventId);
  const total = manifest.tickets.length;
  const sizeBytes = new Blob([JSON.stringify(manifest)]).size;
  const progress: DownloadProgress = { key: true, savedTickets: 0, totalTickets: total, names: false, done: false, sizeBytes };
  onProgress({ ...progress });

  const db = await offlineDb();
  // Drop tickets from an earlier download that are no longer on the list (refunded and removed, etc.).
  const keep = new Set(manifest.tickets.map((t) => t.code));
  const old = await db.getAllFromIndex('tickets', 'byEvent', eventId);
  if (old.some((t) => !keep.has(t.code))) {
    const tx = db.transaction('tickets', 'readwrite');
    for (const t of old) if (!keep.has(t.code)) await tx.store.delete(t.code);
    await tx.done;
  }

  for (let i = 0; i < total; i += BATCH) {
    const tx = db.transaction('tickets', 'readwrite');
    for (const t of manifest.tickets.slice(i, i + BATCH)) await tx.store.put(t);
    await tx.done;
    progress.savedTickets = Math.min(total, i + BATCH);
    onProgress({ ...progress });
  }
  progress.names = true;

  await db.put('manifests', {
    eventId,
    eventTitle: manifest.eventTitle,
    eventStartsAt: manifest.eventStartsAt,
    downloadedAt: new Date().toISOString(),
    generatedAt: manifest.generatedAt,
    salesCloseAt: manifest.salesCloseAt,
    expiresAt: manifest.expiresAt,
    policy: manifest.policy,
    publicKeyJwk: manifest.publicKeyJwk,
    ticketCount: total,
  });
  progress.done = true;
  onProgress({ ...progress });
  return manifest;
}
