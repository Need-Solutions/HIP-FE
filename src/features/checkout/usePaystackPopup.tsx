import { useState } from 'react';
import type { CheckoutResponse } from '@/api/endpoints';
import { SimulatedPaystackDialog } from '@/components/checkout/SimulatedPaystackDialog';
import { openPaystack, paystackMode, simulatePaystack, type PaystackResult } from './paystack';
import type { PaymentChannel } from '@/types/domain';

/**
 * Opens Paystack for a checkout the server has created (new or resumed). In `simulated` mode it shows the
 * stand-in dialog instead, so render `dialog` somewhere in the page. A success here still isn't a paid
 * ticket: the caller must poll checkoutApi.status (TKT-010).
 */
export function usePaystackPopup() {
  const [simulated, setSimulated] = useState<{ checkout: CheckoutResponse; email: string; resolve: (r: PaystackResult) => void } | null>(null);

  const pay = (checkout: CheckoutResponse, email: string, channel: PaymentChannel): Promise<PaystackResult> => {
    if (paystackMode === 'simulated') return new Promise((resolve) => setSimulated({ checkout, email, resolve }));
    return openPaystack({ accessCode: checkout.paystackAccessCode, reference: checkout.reference, email, amountKobo: checkout.amountKobo, channel });
  };

  const dialog = (
    <SimulatedPaystackDialog
      open={!!simulated}
      amountKobo={simulated?.checkout.amountKobo ?? 0}
      email={simulated?.email ?? ''}
      onResult={(outcome) => {
        if (!simulated) return;
        setSimulated(null);
        simulated.resolve(simulatePaystack(simulated.checkout.reference, outcome));
      }}
    />
  );

  return { pay, dialog };
}
