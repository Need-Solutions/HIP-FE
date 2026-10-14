import { bytesToBase64Url, encodeTicketQr, signedMessage } from '@/lib/ticketQr';

// MOCK ONLY. A fixed P-256 test key pair so mock tickets carry real signatures and the check-in scanner can verify
// them offline with lib/ticketQr.ts. It protects nothing: the real backend keeps one private key per event on the
// server, and phones only ever receive the public key. Delete this file with the rest of api/mock.

const TEST_PRIVATE_JWK: JsonWebKey = {"kty": "EC", "x": "X0AP8j157XAY6xCh67E2XT0rmzPWjYRYXal8PBccz-U", "y": "NftO5cutb598ReCziIBdoPbixZ2J9A6LjInog5_sKz4", "crv": "P-256", "d": "JwCA6ZHHL3XlTC6xArbwn1_cq0IfNPJbNP4giRR_1Ww"};

export const MOCK_PUBLIC_JWK: JsonWebKey = {"kty": "EC", "x": "X0AP8j157XAY6xCh67E2XT0rmzPWjYRYXal8PBccz-U", "y": "NftO5cutb598ReCziIBdoPbixZ2J9A6LjInog5_sKz4", "crv": "P-256"};

let keyPromise: Promise<CryptoKey> | null = null;
const privateKey = () =>
  (keyPromise ??= crypto.subtle.importKey('jwk', TEST_PRIVATE_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']));

/** A signed QR payload, as the backend would put in a ticket. */
export async function signTicketQr(code: string, eventId: string): Promise<string> {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await privateKey(), new TextEncoder().encode(signedMessage(code, eventId)));
  return encodeTicketQr({ code, eventId, signature: bytesToBase64Url(new Uint8Array(sig)) });
}
