"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { profile } from "./portfolio-data";

const muted = "text-[#686d63] dark:text-[#a4a89c]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]";
const activeLink = "text-[#355f9c] underline decoration-current underline-offset-8 dark:text-[#9aaed7]";
const sections = [["About", "about"], ["Experience", "experience"], ["Skills", "skills"], ["Projects", "projects"]] as const;

function ThemeSwitch() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("portfolio-theme");
      if (saved === "light" || saved === "dark") {
        document.documentElement.dataset.theme = saved;
        queueMicrotask(() => setTheme(saved));
      }
    } catch { /* The system preference works when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function updateBrowserTheme() {
      const selected = document.documentElement.dataset.theme;
      const dark = selected === "dark" || (selected !== "light" && system.matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", dark ? "#0d0e0c" : "#f8f8f5"));
    }
    updateBrowserTheme();
    system.addEventListener("change", updateBrowserTheme);
    return () => system.removeEventListener("change", updateBrowserTheme);
  }, [theme]);
  function changeTheme() {
    const root = document.documentElement;
    const selected = root.dataset.theme;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const currentTheme = selected === "light" || selected === "dark" ? selected : "system";
    const currentIsDark = currentTheme === "system" ? systemTheme === "dark" : currentTheme === "dark";
    const next = currentTheme !== "system" && currentTheme !== systemTheme
      ? "system"
      : currentIsDark ? "light" : "dark";
    setTheme(next);
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try { localStorage.setItem("portfolio-theme", next); } catch { /* Switching does not require storage. */ }
  }
  return (
    <button aria-label={`Theme: ${theme}. Toggle light and dark themes`} title={`Theme: ${theme}`} onClick={changeTheme} className={`flex h-11 w-11 touch-manipulation items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${muted} ${focus}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-4 w-4"><circle cx="10" cy="10" r="6" /><path d="M10 4a6 6 0 0 1 0 12Z" fill="currentColor" /></svg>
    </button>
  );
}

export function SiteHeader({ section = "home" }: { section?: "home" | "writing" }) {
  const home = section === "home";
  const header = useRef<HTMLElement>(null);
  const navigationTarget = useRef<string | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<string>();

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const hash = window.location.hash.slice(1);
    navigationTarget.current = home && (sections.some(([, id]) => id === hash) || hash === "writing") ? hash : undefined;
    let frame = 0;
    let height = 0;
    const targets = ["about", "experience", "skills", "projects", "writing"].map(id => document.getElementById(id)).filter((target): target is HTMLElement => target !== null);
    function update() {
      frame = 0;
      if (!home) return;
      let current: string | undefined;
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= height + 25) current = target.id;
      }
      if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2) {
        current = targets.at(-1)?.id;
      }
      const selected = targets.find(target => target.id === navigationTarget.current);
      if (selected) {
        const bounds = selected.getBoundingClientRect();
        if (bounds.bottom > height && bounds.top < window.innerHeight) current = selected.id;
      }
      setActiveSection(current);
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function measureHeader() {
      height = element!.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--portfolio-header-height", `${height}px`);
      scheduleUpdate();
    }
    function resumeTracking(event: Event) {
      if (event instanceof KeyboardEvent && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      navigationTarget.current = undefined;
      scheduleUpdate();
    }
    const observer = new ResizeObserver(measureHeader);
    observer.observe(element);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", measureHeader);
    window.addEventListener("wheel", resumeTracking, { passive: true });
    window.addEventListener("pointerdown", resumeTracking, { passive: true });
    window.addEventListener("keydown", resumeTracking);
    measureHeader();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", measureHeader);
      window.removeEventListener("wheel", resumeTracking);
      window.removeEventListener("pointerdown", resumeTracking);
      window.removeEventListener("keydown", resumeTracking);
      cancelAnimationFrame(frame);
    };
  }, [home]);

  return <>
    <a href="#content" className={`fixed left-5 top-3 z-50 -translate-y-24 rounded bg-[#292d25] px-4 py-3 text-sm text-white focus:translate-y-0 ${focus}`}>Skip to content</a>
    <header ref={header} className="sticky top-0 z-40 border-b border-black/[0.07] bg-[#f8f8f5] dark:border-white/[0.07] dark:bg-[#0d0e0c]">
      <div className="mx-auto grid max-w-[688px] grid-cols-[1fr_auto] items-center gap-x-4 px-6 py-2 sm:grid-cols-[auto_1fr_auto] sm:py-2.5">
        <Link href={home ? "#top" : "/"} className={`inline-flex min-h-11 items-center justify-self-start rounded font-sans text-sm font-medium tracking-tight ${focus}`}>{profile.name.toLowerCase()}</Link>
        <nav aria-label="Main navigation" className="col-span-2 row-start-2 flex flex-wrap gap-x-4 text-sm sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-end sm:gap-x-5">
          {sections.map(([label, id]) => <Link key={id} href={`${home ? "" : "/"}#${id}`} onClick={event => {
            if (!home || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            navigationTarget.current = id;
            setActiveSection(id);
          }} aria-current={home && activeSection === id ? "location" : undefined} className={`inline-flex min-h-11 touch-manipulation items-center rounded transition-colors hover:text-[#292d25] dark:hover:text-[#edeee8] ${home && activeSection === id ? activeLink : muted} ${focus}`}>{label}</Link>)}
          <Link href={home ? "#writing" : "/writing"} onClick={event => {
            if (!home || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            navigationTarget.current = "writing";
            setActiveSection("writing");
          }} aria-current={home && activeSection === "writing" ? "location" : !home && section === "writing" ? "page" : undefined} className={`inline-flex min-h-11 touch-manipulation items-center rounded transition-colors hover:text-[#292d25] dark:hover:text-[#edeee8] ${home && activeSection === "writing" || !home && section === "writing" ? activeLink : muted} ${focus}`}>Writing</Link>
        </nav>
        <div className="col-start-2 row-start-1 sm:col-start-3"><ThemeSwitch /></div>
      </div>
    </header>
  </>;
}
