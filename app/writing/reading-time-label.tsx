import { estimateReadingMinutes } from "./reading-time";

export function ReadingTimeLabel({ content }: { content: string }) {
  const minutes = estimateReadingMinutes(content);
  return <span aria-label={`About ${minutes} ${minutes === 1 ? "minute" : "minutes"} to read`}>{`About ${minutes} min read`}</span>;
}
