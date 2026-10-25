export function SiteFooter() {
  return <footer className="border-t border-black/[0.07] dark:border-white/[0.07]">
    <div className="mx-auto flex max-w-[688px] flex-wrap items-center justify-between gap-x-5 px-6 py-5 text-xs text-[#686d63] dark:text-[#a4a89c]">
      <span>© 2026</span>
      <a href="#top" className="inline-flex min-h-11 items-center rounded text-[#355f9c] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#203f6d] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:text-[#9aaed7] dark:hover:text-[#c5d3ee] dark:focus-visible:outline-[#a9bddf]">Back to top</a>
    </div>
  </footer>;
}
