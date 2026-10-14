// Everything about the ticket QR payload lives here, so the format can change in one place.
//
// Proposed format (CLAUDE.md, not yet confirmed by the backend):
//   <ticketCode>.<eventId>.<signature>
// where <signature> is the base64url ECDSA P-256 / SHA-256 signature of "<ticketCode>.<eventId>",
// made with the event's private key on the server. Phones verify it offline with the public key.
// The payload holds no personal data (TKT-018).

const SEP = '.';
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface TicketQrPayload {
  code: string;
  eventId: string;
  /** base64url signature */
  signature: string;
}

/** The exact bytes the server signs and the scanner verifies. */
export const signedMessage = (code: string, eventId: string) => `${code}${SEP}${eventId}`;

export function encodeTicketQr({ code, eventId, signature }: TicketQrPayload): string {
  if ([code, eventId].some((p) => !p || p.includes(SEP))) throw new Error('Ticket code and event ID must be non-empty and contain no "."');
  if (!BASE64URL.test(signature)) throw new Error('Signature must be base64url');
  return [code, eventId, signature].join(SEP);
}

/** Splits a scanned string into its parts, or returns null if it isn't a HIP ticket payload. Doesn't verify the signature. */
export function parseTicketQr(payload: string): TicketQrPayload | null {
  const parts = payload.trim().split(SEP);
  if (parts.length !== 3) return null;
  const [code, eventId, signature] = parts;
  if (!code || !eventId || !BASE64URL.test(signature)) return null;
  return { code, eventId, signature };
}

export function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Checks the payload's ECDSA signature with the event's public key (JWK). Returns the parsed payload when valid. */
export async function verifyTicketQr(payload: string, publicKeyJwk: JsonWebKey): Promise<TicketQrPayload | null> {
  const parsed = parseTicketQr(payload);
  if (!parsed) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(parsed.signature),
      new TextEncoder().encode(signedMessage(parsed.code, parsed.eventId)),
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}
