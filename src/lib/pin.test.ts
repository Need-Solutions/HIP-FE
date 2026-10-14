import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin';

// Supervisor PIN (business rule 14): salted PBKDF2; phones only ever see the hash.

describe('supervisor PIN', () => {
  it('verifies the right PIN', async () => expect(await verifyPin('4821', await hashPin('4821'))).toBe(true));
  it('rejects a wrong PIN', async () => expect(await verifyPin('4822', await hashPin('4821'))).toBe(false));
  it('salts every hash, so the same PIN never looks the same', async () => {
    const [a, b] = await Promise.all([hashPin('123456'), hashPin('123456')]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
  it('never stores the PIN itself', async () => expect(JSON.stringify(await hashPin('4821'))).not.toContain('4821'));
  it('only accepts 4–6 digits', async () => {
    await expect(hashPin('12a4')).rejects.toThrow();
    await expect(hashPin('123')).rejects.toThrow();
    expect(await verifyPin('12a4', await hashPin('1234'))).toBe(false);
  });
});
