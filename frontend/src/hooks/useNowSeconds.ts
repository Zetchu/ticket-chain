import { useSyncExternalStore } from 'react';

/**
 * The current wall-clock time in Unix seconds, as a value React can render.
 *
 * Reading `Date.now()` during render is impure: the component only picks up the
 * new time when something *else* happens to re-render it, so a ticket whose
 * event starts while the page is open keeps claiming it is on sale until the
 * user clicks something. Subscribing to a ticking clock makes expiry a normal
 * piece of reactive state.
 *
 * The contract remains the authoritative guard — this only decides what the UI
 * offers, and a few seconds of drift against `block.timestamp` is harmless.
 */

const TICK_MS = 15_000;

let now = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // One shared interval for every subscriber, started with the first and
  // stopped with the last.
  timer ??= setInterval(() => {
    now = Math.floor(Date.now() / 1000);
    listeners.forEach((notify) => notify());
  }, TICK_MS);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;

export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
