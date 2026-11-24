import { useEffect, useState } from 'react';

/** Remaining seconds until `deadline` (server epoch ms), corrected by the server clock offset. */
export function useRemainingSeconds(deadline: number | null, clockOffset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
}
