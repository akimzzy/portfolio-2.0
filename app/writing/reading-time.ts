// Estimate at 200 words per minute, rounded to the nearest minute rather than
// always up. Include code text; exclude link destinations, image markup, and
// fenced-code language labels.
export function estimateReadingMinutes(markdown: string): number {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^\n]*?\)/g, " ")
    .replace(/\[([^\]]+)\]\([^\n]*?\)/g, "$1")
    .replace(/^\s*\[[^\]]+\]:\s+.*$/gm, " ")
    .replace(/^\s*(?:`{3,}|~{3,}).*$/gm, " ")
    .replace(/https?:\/\/[^\s<>]+/g, " ")
    .replace(/<[^>]*>/g, " ");
  const words = text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return Math.max(1, Math.round(words / 200));
}
