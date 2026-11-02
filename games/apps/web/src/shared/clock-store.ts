let now = Date.now();
let timer: number | null = null;
const listeners = new Set<() => void>();

export function getClockSnapshot() {
  return now;
}

export function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const subscriber of listeners) subscriber();
    }, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
