import { beforeAll, describe, expect, it } from 'vitest';
import { bytesToBase64Url, encodeTicketQr, parseTicketQr, signedMessage, verifyTicketQr } from './ticketQr';

// Ticket QR (TKT-014, TKT-018, ATT-006/007): <code>.<eventId>.<ECDSA P-256 signature>, verified offline with the
// event's public key. A fresh key pair is made for the test; the app never holds a private key.

let publicJwk: JsonWebKey;
let otherPublicJwk: JsonWebKey;
let sign: (code: string, eventId: string) => Promise<string>;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  otherPublicJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
  sign = async (code, eventId) => {
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(signedMessage(code, eventId)));
    return encodeTicketQr({ code, eventId, signature: bytesToBase64Url(new Uint8Array(sig)) });
  };
});

describe('parseTicketQr', () => {
  it('reads code, event and signature', () => expect(parseTicketQr('HIP-7Q4K-2291.evt_1.abc_-9')).toEqual({ code: 'HIP-7Q4K-2291', eventId: 'evt_1', signature: 'abc_-9' }));
  it('rejects anything that isn’t a HIP payload', () => {
    expect(parseTicketQr('https://example.com')).toBeNull();
    expect(parseTicketQr('HIP-7Q4K-2291.evt_1')).toBeNull();
    expect(parseTicketQr('')).toBeNull();
  });
  it('holds no personal data', async () => {
    const payload = await sign('HIP-7Q4K-2291', 'evt_1');
    expect(payload).not.toMatch(/@|\+234|Adaeze/);
  });
});

describe('verifyTicketQr', () => {
  it('accepts a payload signed by the event key', async () => expect(await verifyTicketQr(await sign('HIP-7Q4K-2291', 'evt_1'), publicJwk)).toMatchObject({ code: 'HIP-7Q4K-2291', eventId: 'evt_1' }));
  it('rejects a payload moved to another event', async () => {
    const [code, , sig] = (await sign('HIP-7Q4K-2291', 'evt_1')).split('.');
    expect(await verifyTicketQr(`${code}.evt_2.${sig}`, publicJwk)).toBeNull();
  });
  it('rejects an edited ticket code', async () => {
    const [, eventId, sig] = (await sign('HIP-7Q4K-2291', 'evt_1')).split('.');
    expect(await verifyTicketQr(`HIP-7Q4K-2292.${eventId}.${sig}`, publicJwk)).toBeNull();
  });
  it('rejects a signature from another key', async () => expect(await verifyTicketQr(await sign('HIP-7Q4K-2291', 'evt_1'), otherPublicJwk)).toBeNull());
  it('rejects garbage signatures without throwing', async () => expect(await verifyTicketQr('HIP-7Q4K-2291.evt_1.AAAA', publicJwk)).toBeNull());
});
