import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getClockSnapshot, subscribeClock } from '../shared/clock-store';

type CountdownProps = Readonly<{
  deadline: number;
  clockOffset: number;
  context: string;
  urgent?: boolean;
  onExpire?: () => void;
}>;

/** Shared countdown display for turn, reconnect, room, and series deadlines. */
export function Countdown({ deadline, clockOffset, context, urgent = false, onExpire }: CountdownProps) {
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockSnapshot);
  const seconds = Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1_000));
  const expiryHandled = useRef(false);

  useEffect(() => {
    if (seconds > 0) expiryHandled.current = false;
    else if (!expiryHandled.current) {
      expiryHandled.current = true;
      onExpire?.();
    }
  }, [onExpire, seconds]);

  return (
    <span
      className={`countdown-indicator${urgent && seconds <= 10 ? ' is-urgent' : ''}`}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds ${context}`}
    >
      {seconds}s
    </span>
  );
}
