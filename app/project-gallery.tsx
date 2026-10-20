"use client";

import Image from "next/image";
import { ImageViewer } from "./image-viewer";
import { useEffect, useId, useRef, useState } from "react";
import type { ProjectScreenshot } from "./portfolio-data";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]";

export function ProjectGallery({ title, screenshots, hint }: { title: string; screenshots: ProjectScreenshot[]; hint?: string }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const instructions = useId();
  const [position, setPosition] = useState({ first: 1, last: 1, previous: false, next: false });

  function measure() {
    const element = track.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const visible = Array.from(element.children).flatMap((child, index) => {
      const box = child.getBoundingClientRect();
      return box.right > bounds.left + 4 && box.left < bounds.right - 4 ? [index + 1] : [];
    });
    const next = { first: visible[0] ?? 1, last: visible.at(-1) ?? 1, previous: element.scrollLeft > 1, next: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 };
    setPosition(current => Object.keys(next).every(key => current[key as keyof typeof current] === next[key as keyof typeof next]) ? current : next);
  }

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function move(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * (element.clientWidth - 32), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <section aria-label={`${title} screenshots`} className="mt-3">
    <p id={instructions} className="sr-only">Scroll horizontally, use the arrow buttons, or press the left and right arrow keys to explore.</p>
    <p aria-live="polite" aria-atomic="true" className="sr-only">Images {position.first} to {position.last} of {screenshots.length}</p>
    <ul ref={track} tabIndex={0} aria-label="Screenshot gallery" aria-describedby={instructions} onScroll={measure} onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        event.currentTarget.scrollTo({ left: event.key === "Home" ? 0 : event.currentTarget.scrollWidth, behavior: "instant" });
      }
    }} className={`flex snap-x snap-proximity gap-2 pb-2 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg ${focus}`}>
      {screenshots.map((screenshot, index) => <li key={screenshot.src} className="shrink-0 snap-start">
        <figure className="relative">
          <button type="button" aria-label={`Enlarge ${screenshot.label}`} aria-haspopup="dialog" onClick={() => setViewerIndex(index)} className={`block cursor-zoom-in rounded-lg ${focus}`}>
          <Image src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} sizes={screenshot.width < screenshot.height ? "128px" : "456px"} className="h-56 w-auto max-w-none rounded-lg sm:h-64" />
          </button>
          <figcaption className="sr-only left-0 top-0">{screenshot.label}</figcaption>
        </figure>
      </li>)}
    </ul>
    <div className="mt-1 flex items-center justify-between gap-3">
      {hint && <p className="text-xs leading-5 text-[#686d63] dark:text-[#a4a89c]">{hint}</p>}
      <div className="ml-auto flex shrink-0 gap-1">
      {[-1, 1].map(direction => <button key={direction} type="button" aria-label={direction < 0 ? "Previous screenshots" : "Next screenshots"} disabled={direction < 0 ? !position.previous : !position.next} onClick={() => move(direction)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/5 ${focus}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d={direction < 0 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
      </button>)}
      </div>
    </div>
    {viewerIndex !== null && <ImageViewer title={title} screenshots={screenshots} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
  </section>;
}
