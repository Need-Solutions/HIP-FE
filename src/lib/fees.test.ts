import { describe, expect, it } from 'vitest';
import { orderTotals, paystackFeeKobo } from './fees';

// Business rule 9: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000. Amounts in kobo.

describe('paystackFeeKobo', () => {
  it('adds 1.5% + ₦100 from ₦2,500 up', () => expect(paystackFeeKobo(2_200_000)).toBe(43_000));
  it('waives the ₦100 under ₦2,500', () => expect(paystackFeeKobo(200_000)).toBe(3_000));
  it('applies the ₦100 exactly at ₦2,500', () => expect(paystackFeeKobo(250_000)).toBe(3_750 + 10_000));
  it('caps at ₦2,000', () => expect(paystackFeeKobo(20_000_000)).toBe(200_000));
  it('charges nothing for free tickets', () => expect(paystackFeeKobo(0)).toBe(0));
  it('rounds to whole kobo', () => expect(Number.isInteger(paystackFeeKobo(123_457))).toBe(true));
});

describe('orderTotals', () => {
  it('puts the fee on top of the subtotal', () => expect(orderTotals(3_000_000)).toEqual({ subtotalKobo: 3_000_000, feeKobo: 55_000, totalKobo: 3_055_000 }));
});
