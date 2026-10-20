"use client";

import { useEffect } from "react";

export function CodeCopyController() {
  useEffect(() => {
    async function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("[data-copy-code]");
      if (!button) return;

      const wrapper = button.closest<HTMLElement>("[data-code-block]");
      const code = wrapper?.querySelector("pre code")?.textContent;
      const label = button.querySelector<HTMLElement>("[data-copy-label]");
      const feedback = wrapper?.querySelector<HTMLElement>("[data-copy-feedback]");
      if (code == null || !navigator.clipboard?.writeText) {
        button.dataset.copyStatus = "error";
        button.setAttribute("aria-label", "Could not copy code");
        if (label) label.textContent = "Copy failed";
        if (feedback) feedback.textContent = "Copy failed. Select the code and copy it manually.";
        return;
      }

      try {
        await navigator.clipboard.writeText(code);
        button.dataset.copyStatus = "copied";
        button.setAttribute("aria-label", "Code copied");
        if (label) label.textContent = "Copied";
        if (feedback) feedback.textContent = "Code copied to clipboard.";
        window.setTimeout(() => {
          button.dataset.copyStatus = "idle";
          button.setAttribute("aria-label", "Copy code");
          if (label) label.textContent = "Copy";
          if (feedback) feedback.textContent = "";
        }, 1800);
      } catch {
        button.dataset.copyStatus = "error";
        button.setAttribute("aria-label", "Could not copy code");
        if (label) label.textContent = "Copy failed";
        if (feedback) feedback.textContent = "Copy failed. Select the code and copy it manually.";
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
