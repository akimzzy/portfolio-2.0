import { createElement } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared by the article page and content checks. Keep Markdown support in one place.
const components: Components = {
  table: ({ children }) => createElement("div", {
    role: "region", "aria-label": "Article table", tabIndex: 0,
    className: "my-6 max-w-full overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]",
  }, createElement("table", {
    className: "w-full min-w-[28rem] border-collapse text-left text-sm leading-6 [&_thead]:border-b [&_thead]:border-black/15 [&_th]:px-3 [&_th]:pb-3 [&_th]:align-top [&_th]:font-semibold [&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_tr>:first-child]:pl-0 [&_tr>:last-child]:pr-0 dark:[&_thead]:border-white/15",
  }, children)),
  th: ({ children, style }) => createElement("th", { scope: "col", className: alignment(style?.textAlign) }, children),
  td: ({ children, style }) => createElement("td", { className: alignment(style?.textAlign) }, children),
  pre: ({ children }) => createElement("div", { "data-code-block": "", className: "my-6 overflow-hidden rounded-lg bg-black/5 dark:bg-white/5" },
    createElement("div", { className: "flex items-center justify-end px-2 pt-2" },
      createElement("button", { type: "button", "data-copy-code": "", "data-copy-status": "idle", "aria-label": "Copy code", className: "inline-flex min-h-9 items-center gap-2 rounded px-2.5 text-xs font-medium text-[#686d63] transition-colors hover:bg-black/5 hover:text-[#292d25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5277ae] dark:text-[#a4a89c] dark:hover:bg-white/10 dark:hover:text-[#edeee8] dark:focus-visible:outline-[#a9bddf]" },
        createElement("svg", { "aria-hidden": "true", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.4", className: "h-4 w-4" },
          createElement("rect", { x: "7", y: "6", width: "9", height: "11", rx: "1.5" }),
          createElement("path", { d: "M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H7" })),
        createElement("span", { "data-copy-label": "" }, "Copy")),
      createElement("span", { className: "sr-only", "data-copy-feedback": "", "aria-live": "polite", "aria-atomic": "true" })),
    createElement("pre", {
      tabIndex: 0, "aria-label": "Code example",
      className: "mt-0 overflow-x-auto px-4 pb-4 pt-2 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]",
    }, children)),
};

function alignment(value: string | undefined) {
  return value === "right" ? "text-right" : value === "center" ? "text-center" : "text-left";
}

export function ArticleBody({ content }: { content: string }) {
  return createElement("div", { className: "mt-12 break-words text-base leading-7 [&_p]:mt-4 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-7 [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-2 [&_a]:text-[#355f9c] [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-[#5277ae] [&_code]:font-mono [&_code]:text-sm [&_blockquote]:my-6 [&_blockquote]:border-l [&_blockquote]:border-black/15 [&_blockquote]:pl-4 [&_blockquote]:text-[#686d63] [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full dark:[&_a]:text-[#9aaed7] dark:[&_a]:focus-visible:outline-[#a9bddf] dark:[&_blockquote]:border-white/15 dark:[&_blockquote]:text-[#a4a89c] [&>:first-child]:mt-0 [&_h4]:mt-6 [&_h4]:font-semibold [&_h5]:mt-6 [&_h5]:font-semibold [&_h6]:mt-6 [&_h6]:font-semibold [&_hr]:my-8 [&_.task-list-item]:list-none [&_.contains-task-list]:pl-0" },
    createElement(Markdown, { skipHtml: true, remarkPlugins: [remarkGfm], components }, content));
}
