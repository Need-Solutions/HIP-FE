import { Link, useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Alert, ButtonLink } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import type { WelcomeState } from '@/features/auth/flowState';

// Figma: "Auth / Account verified" (AUTH-006). Shown after the code is accepted.

export default function AccountVerified() {
  const { user } = useAuth();
  const state = useLocation().state as WelcomeState | null;
  const firstName = state?.firstName ?? user?.fullName.split(' ')[0];
  const merged = state?.mergedTickets ?? 0;

  return (
    <div>
      <span className="grid size-14 place-items-center rounded-full bg-mint text-forest"><Check size={28} aria-hidden /></span>
      <h1 className="mt-6 text-[28px] md:text-[32px]">You’re in{firstName ? `, ${firstName}` : ''}!</h1>
      <p className="mt-2 text-[15px] text-slate">Your account is verified. Time to pick your first trail.</p>

      {merged > 0 && (
        <Alert tone="success" title={`We added ${merged} past guest ${merged === 1 ? 'ticket' : 'tickets'} to your account`} className="mt-6">
          Your hiking history from those hikes is here too. <Link to="/account/tickets" className="font-bold text-forest underline">See my tickets</Link>
        </Alert>
      )}

      <div className="mt-7 space-y-3">
        <ButtonLink to="/events" block size="lg">Browse upcoming hikes</ButtonLink>
        <ButtonLink to="/account/profile" block size="lg" variant="secondary">Complete my profile</ButtonLink>
      </div>
    </div>
  );
}
