"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "../arrow";

export function ArticleNavigation({ title }: { title: string }) {
  const navigation = useRef<HTMLElement>(null);
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const heading = document.getElementById("article-title");
    if (!heading) return;

    let observer: IntersectionObserver;
    const observeHeading = () => {
      observer?.disconnect();
      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const coveredHeight = headerHeight + (navigation.current?.getBoundingClientRect().height ?? 0);
      observer = new IntersectionObserver(([entry]) => {
        setShowTitle(entry.boundingClientRect.bottom <= coveredHeight);
      }, { rootMargin: `-${coveredHeight}px 0px 0px 0px`, threshold: 0 });
      observer.observe(heading);
    };

    observeHeading();
    window.addEventListener("resize", observeHeading);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observeHeading);
    };
  }, [title]);

  return (
    <nav ref={navigation} aria-label="Article navigation" className="sticky top-[var(--portfolio-header-height,6.5rem)] z-30 -mx-6 bg-[#f8f8f5] px-6 py-1 dark:bg-[#0d0e0c]">
      <div className="flex min-h-11 items-center gap-4">
        <Link href="/writing" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded text-sm text-[#355f9c] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:text-[#9aaed7] dark:focus-visible:outline-[#a9bddf]"><Arrow direction="left" />All articles</Link>
        {showTitle && <span aria-hidden="true" className="min-w-0 truncate text-[13px] font-semibold leading-5 tracking-tight text-[#292d25] dark:text-[#edeee8]">{title}</span>}
      </div>
    </nav>
  );
}
