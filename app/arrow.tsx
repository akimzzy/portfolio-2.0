export function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className={`h-3.5 w-3.5 shrink-0 ${direction === "left" ? "rotate-180" : ""}`}><path d="M4 10h12m-5-5 5 5-5 5" /></svg>;
}
