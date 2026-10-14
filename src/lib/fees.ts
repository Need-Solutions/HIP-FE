// Paystack processing fee, added on top of the ticket price at checkout (Figma "Hiker / Checkout").
// Nigerian local cards: 1.5% + ₦100. The ₦100 is waived under ₦2,500, and the fee is capped at ₦2,000.
// This is an ESTIMATE for display. The backend recalculates the real amount before charging.
//
// Examples (amounts in kobo):
//   paystackFeeKobo(2_200_000)  === 43_000    // ₦22,000  → ₦330 + ₦100 = ₦430
//   paystackFeeKobo(200_000)    === 3_000     // ₦2,000   → ₦30 (₦100 waived under ₦2,500)
//   paystackFeeKobo(20_000_000) === 200_000   // ₦200,000 → ₦3,100, capped at ₦2,000
//   paystackFeeKobo(0)          === 0         // free tickets skip Paystack

const PERCENT = 0.015;
const FLAT_KOBO = 10_000; // ₦100
const FLAT_WAIVED_BELOW_KOBO = 250_000; // ₦2,500
const CAP_KOBO = 200_000; // ₦2,000

export function paystackFeeKobo(amountKobo: number): number {
  if (amountKobo <= 0) return 0;
  const flat = amountKobo < FLAT_WAIVED_BELOW_KOBO ? 0 : FLAT_KOBO;
  return Math.min(Math.round(amountKobo * PERCENT) + flat, CAP_KOBO);
}

/** Subtotal, estimated fee and total for an order, all in kobo. */
export function orderTotals(subtotalKobo: number) {
  const feeKobo = paystackFeeKobo(subtotalKobo);
  return { subtotalKobo, feeKobo, totalKobo: subtotalKobo + feeKobo };
}
