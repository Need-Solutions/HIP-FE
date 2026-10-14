import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { checkoutApi, type CheckoutRequest, type CheckoutResponse } from '@/api/endpoints';
import { Button, RadioCard } from '@/components/ui';
import { paystackMode, type PaystackResult } from '@/features/checkout/paystack';
import { usePaystackPopup } from '@/features/checkout/usePaystackPopup';
import { formatNaira } from '@/lib/format';
import type { PaymentChannel } from '@/types/domain';
import { errorMessage, notifyError } from '@/lib/notify';
import { useBranding } from '@/features/branding/BrandingContext';

const channels: { value: PaymentChannel; title: string; description: string }[] = [
  { value: 'card', title: 'Card', description: 'Visa, Mastercard, Verve' },
  { value: 'bank_transfer', title: 'Bank transfer', description: 'Pay to a one-time account number' },
  { value: 'ussd', title: 'USSD', description: 'Dial a code from any phone' },
];

/**
 * Step 3 (Figma "Hiker / Checkout – payment"). Creates the checkout on the server, then opens Paystack.
 * It hands over to the confirmation step only after the popup reports success, and that step still waits
 * for the backend to verify the payment before showing a ticket (TKT-010).
 */
export function PaymentStep({
  request,
  totalKobo,
  disabled,
  onPaid,
  onBack,
}: {
  /** Everything except the payment channel, which is chosen here. */
  request: Omit<CheckoutRequest, 'paymentChannel'>;
  totalKobo: number;
  disabled?: boolean;
  onPaid: (checkoutId: string) => void;
  onBack: () => void;
}) {
  const { name: brand } = useBranding();
  const [channel, setChannel] = useState<PaymentChannel>('card');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  const paystack = usePaystackPopup();
  const free = totalKobo === 0;

  const handleResult = (checkout: CheckoutResponse, result: PaystackResult) => {
    setBusy(false);
    if (result.outcome === 'success') onPaid(checkout.checkoutId);
    else if (result.outcome === 'cancelled') setNotice('Payment cancelled. Your seats are still held, so you can try again.');
    else notifyError(result.message, { id: 'payment' });
    // The pay button was disabled while the popup was open, so the browser couldn't give focus back to it.
    if (result.outcome !== 'success') setTimeout(() => payRef.current?.focus(), 0);
  };

  const pay = async () => {
    setNotice(null);
    setBusy(true);
    let checkout: CheckoutResponse;
    try {
      checkout = await checkoutApi.start({ ...request, paymentChannel: channel });
    } catch (err) {
      setBusy(false);
      notifyError(errorMessage(err, 'We couldn’t start your payment. Please try again.'), { id: 'payment' });
      return;
    }
    // Free orders need no payment: the server confirms them and the next step shows the ticket.
    if (!checkout.paystackAccessCode && checkout.amountKobo === 0) return onPaid(checkout.checkoutId);
    handleResult(checkout, await paystack.pay(checkout, request.buyer.email, channel));
  };

  return (
    <div>
      <h2 className="text-xl">{free ? 'Confirm your free ticket' : 'Payment'}</h2>
      <p className="mt-1 text-sm text-slate">
        {free ? 'This hike is free. Confirm and we’ll send your QR ticket straight away.' : 'You’ll complete payment securely with Paystack.'}
      </p>

      {!free && (
        <>
          <fieldset className="mt-5 space-y-3">
            <legend className="sr-only">Payment method</legend>
            {channels.map((c) => (
              <RadioCard
                key={c.value}
                name="paymentChannel"
                value={c.value}
                checked={channel === c.value}
                onChange={(v) => setChannel(v as PaymentChannel)}
                title={c.title}
                description={c.description}
              />
            ))}
          </fieldset>
          <p className="mt-5 flex items-start gap-3 rounded-xl bg-canvas p-4 text-[13px] text-ink">
            <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-slate" />
            Secured by Paystack. {brand} never sees or stores your card details.
          </p>
          {paystackMode === 'test-popup' && (
            <p className="mt-3 text-xs text-slate">Paystack test mode: use one of Paystack’s test cards. No real money is charged.</p>
          )}
        </>
      )}

      {notice && (
        <p role="status" className="mt-5 rounded-xl bg-info-light p-3 text-sm text-info">
          {notice}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button ref={payRef} size="lg" variant="accent" onClick={pay} disabled={busy || disabled}>
          {busy ? (free ? 'Confirming…' : 'Opening Paystack…') : free ? 'Get my free ticket' : `Pay ${formatNaira(totalKobo)}`}
        </Button>
        <Button variant="ghost" size="lg" onClick={onBack} disabled={busy}>Back</Button>
      </div>

      {paystack.dialog}
    </div>
  );
}
