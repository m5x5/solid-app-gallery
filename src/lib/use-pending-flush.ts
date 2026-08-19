import { useEffect, useState } from "react";
import { useSolid } from "./solid-context";
import { submitApp } from "./solid-data";
import { readPending, removePending, subscribePending } from "./pending-submissions";

export type FlushState = { sending: number; sent: number; failed: number };

// Deliver anything submitted while logged out, once a session exists. Mounted
// once in App so it runs no matter which page the user lands on after login.
export function usePendingSubmissionFlush(): FlushState {
  const { isLoggedIn, webId } = useSolid();
  const [state, setState] = useState<FlushState>({ sending: 0, sent: 0, failed: 0 });

  useEffect(() => {
    if (!isLoggedIn || !webId) return;
    const queue = readPending();
    if (queue.length === 0) return;

    let cancelled = false;
    setState({ sending: queue.length, sent: 0, failed: 0 });
    (async () => {
      let sent = 0;
      let failed = 0;
      for (const p of queue) {
        try {
          await submitApp(p.sub, webId);
          // Only drop it once the pod actually accepted it, so a failure keeps
          // the submission queued for the next login instead of losing it.
          removePending(p.id);
          sent++;
        } catch {
          failed++;
        }
      }
      if (!cancelled) setState({ sending: 0, sent, failed });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, webId]);

  return state;
}

// Live view of the queue for pages that display it.
export function usePendingSubmissions() {
  const [list, setList] = useState(() => readPending());
  useEffect(() => subscribePending(() => setList(readPending())), []);
  return list;
}
