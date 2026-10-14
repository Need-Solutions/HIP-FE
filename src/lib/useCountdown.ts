import { useEffect, useState } from 'react';

/** Time left until `deadline` (ISO string), ticking every second. */
export function useCountdown(deadline: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const msLeft = deadline ? Math.max(0, new Date(deadline).getTime() - now) : 0;
  const totalSeconds = Math.ceil(msLeft / 1000);
  const label = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  return { msLeft, label, expired: !!deadline && msLeft === 0 };
}
