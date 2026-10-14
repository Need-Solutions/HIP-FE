import { ShieldCheck } from 'lucide-react';
import { Button, Dialog } from '@/components/ui';
import { formatNaira } from '@/lib/format';

/**
 * Stand-in for the Paystack popup when running on mock data without a pk_test_ key
 * (see features/checkout/paystack.ts). Never shown against the real backend.
 */
export function SimulatedPaystackDialog({
  open,
  amountKobo,
  email,
  onResult,
}: {
  open: boolean;
  amountKobo: number;
  email: string;
  onResult: (outcome: 'success' | 'cancelled') => void;
}) {
  return (
    <Dialog open={open} onClose={() => onResult('cancelled')} title="Simulated Paystack payment">
      <div className="p-6">
        <p className="inline-flex rounded-full bg-warn-light px-2.5 py-1 text-xs font-bold text-warn">TEST MODE · no money moves</p>
        <h2 className="mt-4 text-xl">Simulated Paystack payment</h2>
        <p className="mt-1 text-sm text-slate">
          Mock data is on and no Paystack test key is set, so this stands in for the Paystack popup.
        </p>
        <div className="mt-5 rounded-xl bg-canvas p-4">
          <p className="text-sm text-slate">{email}</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{formatNaira(amountKobo)}</p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button block onClick={() => onResult('success')}>
            <ShieldCheck size={18} aria-hidden /> Simulate successful payment
          </Button>
          <Button block variant="secondary" onClick={() => onResult('cancelled')}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
