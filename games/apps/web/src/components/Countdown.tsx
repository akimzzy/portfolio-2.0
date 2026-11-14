import { useEffect, useRef, useSyncExternalStore } from "react";
import { getClockSnapshot, subscribeClock } from "../shared/clock-store";

type CountdownProps = Readonly<{
  deadline: number;
  clockOffset: number;
  context: string;
  urgent?: boolean;
  showMinutes?: boolean;
  onExpire?: () => void;
}>;

/** Shared countdown display for turn, reconnect, room, and series deadlines. */
export function Countdown({
  deadline,
  clockOffset,
  context,
  urgent = false,
  showMinutes = false,
  onExpire,
}: CountdownProps) {
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockSnapshot);
  const seconds = Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3_600) % 24;
  const minutes = Math.floor(seconds / 60);
  const clockMinutes = Math.floor(seconds / 60) % 60;
  const remainingSeconds = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const displayTime =
    !showMinutes || seconds < 60
      ? `${seconds}s`
      : days > 0
        ? `${days}d ${pad(hours)}:${pad(clockMinutes)}:${pad(remainingSeconds)}`
        : hours > 0
          ? `${hours}:${pad(clockMinutes)}:${pad(remainingSeconds)}`
          : `${minutes}:${pad(remainingSeconds)}`;
  const accessibleTime =
    !showMinutes || seconds < 60
      ? `${seconds} second${seconds === 1 ? "" : "s"}`
      : [
          days > 0 && `${days} day${days === 1 ? "" : "s"}`,
          (days > 0 || hours > 0) && `${hours} hour${hours === 1 ? "" : "s"}`,
          `${clockMinutes} minute${clockMinutes === 1 ? "" : "s"}`,
          `${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(", ");
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
      className={`countdown-indicator${urgent && seconds <= 10 ? " is-urgent" : ""}`}
      role="timer"
      aria-live="off"
      aria-label={`${accessibleTime} ${context}`}
    >
      {displayTime}
    </span>
  );
}
