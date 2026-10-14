import { USE_MOCKS } from '@/api/client';
import { confirmPaystackPayment } from '@/api/mock/store';
import type { PaymentChannel } from '@/types/domain';

// Paystack Inline (v2). The popup only *collects* payment. Tickets are issued after the backend verifies the
// transaction (webhook or verify call), so the checkout page always polls checkoutApi.status afterwards (TKT-010).
//
// Modes:
//   live       Real backend. It initialised the transaction; we resume it with the access code.
//   test-popup Mock backend + a pk_test_ key. Opens Paystack's real test popup (use Paystack test cards);
//              the mock backend then plays the webhook.
//   simulated  Mock backend without a test key (or with a live key, which we never use against mocks):
//              the checkout page shows a stand-in dialog instead.

const SCRIPT_URL = 'https://js.paystack.co/v2/inline.js';
const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? '';

export type PaystackMode = 'live' | 'test-popup' | 'simulated';

export const paystackMode: PaystackMode = !USE_MOCKS ? 'live' : PUBLIC_KEY.startsWith('pk_test_') ? 'test-popup' : 'simulated';

export type PaystackResult = { outcome: 'success'; reference: string } | { outcome: 'cancelled' } | { outcome: 'error'; message: string };

interface PaystackCallbacks {
  onSuccess: (tx: { reference: string }) => void;
  onCancel: () => void;
  onError?: (err: { message?: string }) => void;
}
interface PaystackPopInstance {
  newTransaction: (opts: { key: string; email: string; amount: number; reference: string; currency: 'NGN'; channels: string[] } & PaystackCallbacks) => void;
  resumeTransaction: (accessCode: string, callbacks: PaystackCallbacks) => void;
}
declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopInstance;
  }
}

const channelNames: Record<PaymentChannel, string> = { card: 'card', bank_transfer: 'bank_transfer', ussd: 'ussd' };

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Paystack. Check your connection and try again."));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** Opens the Paystack popup. Not used in `simulated` mode, where the page shows its own dialog. */
export async function openPaystack(opts: {
  accessCode?: string;
  reference: string;
  email: string;
  amountKobo: number;
  channel: PaymentChannel;
}): Promise<PaystackResult> {
  try {
    await loadScript();
  } catch (err) {
    return { outcome: 'error', message: (err as Error).message };
  }
  const Pop = window.PaystackPop;
  if (!Pop) return { outcome: 'error', message: "Couldn't start Paystack. Please try again." };

  return new Promise<PaystackResult>((resolve) => {
    const callbacks: PaystackCallbacks = {
      onSuccess: (tx) => {
        // Against mocks there is no webhook, so tell the mock backend the charge went through.
        if (paystackMode === 'test-popup') confirmPaystackPayment(opts.reference);
        resolve({ outcome: 'success', reference: tx.reference });
      },
      onCancel: () => resolve({ outcome: 'cancelled' }),
      onError: (err) => resolve({ outcome: 'error', message: err.message ?? 'Payment failed. Please try again.' }),
    };
    const popup = new Pop();
    if (paystackMode === 'live') {
      if (!opts.accessCode) return resolve({ outcome: 'error', message: 'Missing payment session. Please try again.' });
      popup.resumeTransaction(opts.accessCode, callbacks);
    } else {
      popup.newTransaction({
        key: PUBLIC_KEY,
        email: opts.email,
        amount: opts.amountKobo,
        reference: opts.reference,
        currency: 'NGN',
        channels: [channelNames[opts.channel]],
        ...callbacks,
      });
    }
  });
}

/** `simulated` mode: what the stand-in dialog calls when the tester picks an outcome. */
export function simulatePaystack(reference: string, outcome: 'success' | 'cancelled'): PaystackResult {
  if (outcome === 'cancelled') return { outcome };
  confirmPaystackPayment(reference);
  return { outcome: 'success', reference };
}
