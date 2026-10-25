"use client";

import Image from "next/image";
import { ImageViewer } from "./image-viewer";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ProjectScreenshot } from "./portfolio-data";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]";

export function ProjectGallery({ title, screenshots, hint }: { title: string; screenshots: ProjectScreenshot[]; hint?: string }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const instructions = useId();
  const targetScrollLeft = useRef(0);
  const activeIndex = useRef(0);
  const programmaticScroll = useRef(false);
  const scrollEndFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState({ active: 0, previous: false, next: screenshots.length > 1 });

  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const items = Array.from(element.children) as HTMLElement[];
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    if (!programmaticScroll.current) {
      targetScrollLeft.current = element.scrollLeft;
      if (items.length <= 1 || maxScroll <= 1) {
        activeIndex.current = 0;
      } else if (element.scrollLeft >= maxScroll - 1) {
        activeIndex.current = items.length - 1;
      } else {
        const trackLeft = element.getBoundingClientRect().left;
        const offsets = items.map(item => element.scrollLeft + item.getBoundingClientRect().left - trackLeft);
        activeIndex.current = offsets.reduce((closest, offset, index) => Math.abs(offset - element.scrollLeft) < Math.abs(offsets[closest] - element.scrollLeft) ? index : closest, 0);
      }
    }
    const hasOverflow = maxScroll > 1;
    const next = { active: activeIndex.current, previous: hasOverflow && activeIndex.current > 0, next: hasOverflow && activeIndex.current < items.length - 1 };
    setPosition(current => current.active === next.active && current.previous === next.previous && current.next === next.next ? current : next);
  }, []);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (scrollEndFallback.current) clearTimeout(scrollEndFallback.current);
    };
  }, [measure]);

  function finishProgrammaticScroll() {
    if (scrollEndFallback.current) {
      clearTimeout(scrollEndFallback.current);
      scrollEndFallback.current = null;
    }
    programmaticScroll.current = false;
    measure();
  }

  function cancelProgrammaticScroll() {
    if (scrollEndFallback.current) {
      clearTimeout(scrollEndFallback.current);
      scrollEndFallback.current = null;
    }
    programmaticScroll.current = false;
  }

  function move(direction: number) {
    const element = track.current;
    if (!element) return;
    const items = Array.from(element.children) as HTMLElement[];
    if (!items.length) return;
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    if (maxScroll <= 1) {
      measure();
      return;
    }
    const trackLeft = element.getBoundingClientRect().left;
    const itemScrollLefts = items.map(item => element.scrollLeft + item.getBoundingClientRect().left - trackLeft);
    const targetIndex = Math.max(0, Math.min(items.length - 1, activeIndex.current + direction));
    activeIndex.current = targetIndex;
    const target = Math.max(0, Math.min(maxScroll, itemScrollLefts[targetIndex]));
    setPosition({ active: targetIndex, previous: targetIndex > 0, next: targetIndex < items.length - 1 });
    if (Math.abs(target - targetScrollLeft.current) < 1) return;
    targetScrollLeft.current = target;
    programmaticScroll.current = true;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: target, behavior: reducedMotion ? "instant" : "smooth" });
    if (reducedMotion) {
      finishProgrammaticScroll();
    } else {
      if (scrollEndFallback.current) clearTimeout(scrollEndFallback.current);
      scrollEndFallback.current = setTimeout(finishProgrammaticScroll, 1000);
    }
  }

  return <section aria-label={`${title} screenshots`} className="mt-3">
    <p id={instructions} className="sr-only">Scroll horizontally, use the arrow buttons, or press the left and right arrow keys to explore.</p>
    <p aria-live="polite" aria-atomic="true" className="sr-only">Image {position.active + 1} of {screenshots.length}</p>
    <ul ref={track} tabIndex={0} aria-label="Screenshot gallery" aria-describedby={instructions} onScroll={measure} onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : Math.max(0, event.currentTarget.scrollWidth - event.currentTarget.clientWidth);
        targetScrollLeft.current = target;
        activeIndex.current = event.key === "Home" ? 0 : screenshots.length - 1;
        setPosition({ active: activeIndex.current, previous: activeIndex.current > 0, next: activeIndex.current < screenshots.length - 1 });
        programmaticScroll.current = true;
        event.currentTarget.scrollTo({ left: target, behavior: "instant" });
        programmaticScroll.current = false;
        measure();
      }
    }} onPointerDown={cancelProgrammaticScroll} onWheel={cancelProgrammaticScroll} onScrollEnd={finishProgrammaticScroll} className={`flex snap-x snap-mandatory gap-2 pb-2 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg ${focus}`}>
      {screenshots.map((screenshot, index) => {
        const isLandscape = screenshot.width > screenshot.height;
        return <li key={screenshot.src} className="shrink-0 snap-start">
        <figure className="relative">
          <button type="button" aria-label={`Enlarge ${screenshot.label}`} aria-haspopup="dialog" onClick={() => setViewerIndex(index)} className={`relative flex h-56 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg sm:h-64 ${isLandscape ? "w-[min(80vw,398px)] sm:w-[455px]" : "w-32 sm:w-36"} ${focus}`}>
          <Image src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} sizes={isLandscape ? "(max-width: 640px) 80vw, 455px" : "144px"} quality={90} className="h-full w-full object-contain" />
          </button>
          <figcaption className="sr-only left-0 top-0">{screenshot.label}</figcaption>
        </figure>
      </li>;
      })}
    </ul>
    <div className="mt-1 flex items-center justify-between gap-3">
      {hint && <p className="text-xs leading-5 text-[#686d63] dark:text-[#a4a89c]">{hint}</p>}
      <div className="ml-auto flex shrink-0 gap-1">
      <span aria-hidden="true" className="flex min-w-12 items-center justify-center text-xs tabular-nums text-[#686d63] dark:text-[#a4a89c]">{position.active + 1} / {screenshots.length}</span>
      {[-1, 1].map(direction => <button key={direction} type="button" aria-label={direction < 0 ? "Previous screenshot" : "Next screenshot"} disabled={direction < 0 ? !position.previous : !position.next} onClick={() => move(direction)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/5 ${focus}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d={direction < 0 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
      </button>)}
      </div>
    </div>
    {viewerIndex !== null && <ImageViewer title={title} screenshots={screenshots} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
  </section>;
}
