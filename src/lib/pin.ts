import { base64UrlToBytes, bytesToBase64Url } from './ticketQr';

// Supervisor PIN for re-entry (Admin / Check-in settings). The server stores a salted, slow hash; phones get only
// that hash with the offline download, never the PIN, and check a typed PIN against it with no signal.
// A 4–6 digit PIN can still be brute-forced from a stolen hash, so the hash is slow (PBKDF2, many iterations),
// phones stop after 5 wrong tries, and the PIN is per event and expires with the offline list.

export const PIN_PATTERN = /^\d{4,6}$/;
export const PIN_MAX_TRIES = 5;
const ITERATIONS = 150_000;

export interface PinHash {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url */
  salt: string;
  /** base64url, 32 bytes */
  hash: string;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Server side (the mock plays the server): salt and hash a new PIN. */
export async function hashPin(pin: string): Promise<PinHash> {
  if (!PIN_PATTERN.test(pin)) throw new Error('A PIN is 4 to 6 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { algorithm: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: bytesToBase64Url(salt), hash: bytesToBase64Url(await derive(pin, salt, ITERATIONS)) };
}

/** True when `pin` matches. Compares every byte, so timing doesn't reveal how close a guess was. */
export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!PIN_PATTERN.test(pin) || stored.algorithm !== 'PBKDF2-SHA256') return false;
  const actual = await derive(pin, base64UrlToBytes(stored.salt), stored.iterations);
  const expected = base64UrlToBytes(stored.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
