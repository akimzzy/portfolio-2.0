const bodyLockClasses = [
  "fixed",
  "inset-x-0",
  "w-full",
  "overflow-hidden",
  "top-[var(--portfolio-scroll-lock-offset)]",
] as const;

let lockCount = 0;
let savedState: {
  scrollX: number;
  scrollY: number;
  rootHadOverflowLock: boolean;
  bodyClasses: Set<string>;
  offset: string;
  offsetPriority: string;
} | null = null;

export function lockDocumentScroll() {
  let released = false;

  if (lockCount === 0) {
    const root = document.documentElement;
    const body = document.body;
    savedState = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      rootHadOverflowLock: root.classList.contains("overflow-hidden"),
      bodyClasses: new Set(bodyLockClasses.filter(className => body.classList.contains(className))),
      offset: body.style.getPropertyValue("--portfolio-scroll-lock-offset"),
      offsetPriority: body.style.getPropertyPriority("--portfolio-scroll-lock-offset"),
    };

    body.style.setProperty("--portfolio-scroll-lock-offset", `-${savedState.scrollY}px`);
    body.classList.add(...bodyLockClasses);
    root.classList.add("overflow-hidden");
  }

  lockCount += 1;

  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0 || !savedState) return;

    const state = savedState;
    savedState = null;

    const root = document.documentElement;
    const body = document.body;
    for (const className of bodyLockClasses) {
      if (!state.bodyClasses.has(className)) body.classList.remove(className);
    }
    if (!state.rootHadOverflowLock) root.classList.remove("overflow-hidden");

    if (state.offset) {
      body.style.setProperty("--portfolio-scroll-lock-offset", state.offset, state.offsetPriority);
    } else {
      body.style.removeProperty("--portfolio-scroll-lock-offset");
    }

    window.scrollTo(state.scrollX, state.scrollY);
  };
}
