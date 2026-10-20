"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectScreenshot } from "./portfolio-data";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]";

export function ImageViewer({ title, screenshots, initialIndex, onClose }: { title: string; screenshots: ProjectScreenshot[]; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(initialIndex);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    const wasLocked = document.body.classList.contains("overflow-hidden");
    document.body.classList.add("overflow-hidden");
    const resize = () => {
      const container = track.current;
      if (container) container.scrollTo({ left: container.clientWidth * Number(container.dataset.active), behavior: "instant" });
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (track.current) observer.observe(track.current);
    return () => {
      observer.disconnect();
      element?.close();
      if (!wasLocked) document.body.classList.remove("overflow-hidden");
      previous?.focus();
    };
  }, []);

  function move(index: number) {
    const container = track.current;
    if (!container) return;
    container.scrollTo({ left: Math.max(0, Math.min(screenshots.length - 1, index)) * container.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return createPortal(<dialog ref={dialog} aria-label={`${title} image viewer`} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClose={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(event.key === "Home" ? 0 : event.key === "End" ? screenshots.length - 1 : active + (event.key === "ArrowLeft" ? -1 : 1));
    }
    if (event.key === "Tab") {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} className="fixed inset-0 m-0 h-svh max-h-none w-full max-w-none overflow-hidden border-0 bg-[#f8f8f5] p-0 text-[#292d25] backdrop:bg-black/70 dark:bg-[#161713] dark:text-[#edeee8]">
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
        <p className="truncate text-[13px]" aria-live="polite">{screenshots[active].label}</p>
        <button autoFocus type="button" aria-label="Close image viewer" onClick={onClose} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 ${focus}`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-5 w-5"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>
      <ul ref={track} data-active={active} aria-label="Full-size screenshots" onScroll={event => setActive(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain">
        {screenshots.map((screenshot, index) => <li key={screenshot.src} tabIndex={active === index ? 0 : -1} aria-label={`${screenshot.label}, ${index + 1} of ${screenshots.length}`} className={`flex h-full w-full shrink-0 snap-center items-start justify-center overflow-y-auto overscroll-y-contain sm:items-center ${focus}`}>
          <Image src={screenshot.src} alt={screenshot.alt} width={screenshot.width} height={screenshot.height} sizes="100vw" className="h-auto w-full max-w-full shrink-0 sm:max-h-full sm:w-auto sm:object-contain" />
        </li>)}
      </ul>
      <div className="flex shrink-0 items-center justify-center gap-4 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {[-1, 0, 1].map(direction => direction === 0 ? <span key={direction} aria-live="polite" aria-atomic="true" className="min-w-10 text-center text-xs tabular-nums">{active + 1} / {screenshots.length}</span> : <button key={direction} type="button" aria-label={direction < 0 ? "Previous image" : "Next image"} disabled={direction < 0 ? active === 0 : active === screenshots.length - 1} onClick={() => move(active + direction)} className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/5 ${focus}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d={direction < 0 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
        </button>)}
      </div>
    </div>
  </dialog>, document.body);
}
