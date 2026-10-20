import type { ReactNode } from "react";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";

export default function WritingLayout({ children }: { children: ReactNode }) {
  return <div id="top" className="flex min-h-svh flex-col">
    <SiteHeader section="writing" />
    <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[688px] flex-1 scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)] px-6 pb-12 pt-10 sm:pt-12">{children}</main>
    <SiteFooter />
  </div>;
}
