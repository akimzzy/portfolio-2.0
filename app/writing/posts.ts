import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { ProjectScreenshot } from "../portfolio-data";

export type WritingPost = {
  slug: string;
  title: string;
  summary: string;
  author: string;
  date?: string;
  modified?: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  screenshots?: ProjectScreenshot[];
  topics?: string[];
  content: string;
  draft: boolean;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// Only local, reviewed Markdown is supported. Route parameters never become file paths.
export function loadPosts(root = path.join(process.cwd(), "content")): WritingPost[] {
  const posts: WritingPost[] = [];
  const slugs = new Set<string>();
  for (const directory of ["drafts", "posts"]) {
    const folder = path.join(root, directory);
    const files = existsSync(folder) ? readdirSync(folder, { withFileTypes: true }) : [];
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".md") || file.name.endsWith(".notes.md")) continue;
      const label = `${directory}/${file.name}`;
      const source = readFileSync(path.join(folder, file.name), "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
      if (!frontmatter) throw new Error(`${label}: YAML frontmatter required`);
      const data = parse(frontmatter[1], { maxAliasCount: 0 });
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${label}: metadata must be an object`);
      const content = source.slice(frontmatter[0].length);
      for (const field of ["slug", "title", "summary", "author"]) {
        if (typeof data[field] !== "string" || !data[field].trim()) throw new Error(`${label}: ${field} is required`);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || slugs.has(data.slug)) throw new Error(`${label}: invalid or duplicate slug`);
      if (typeof data.draft !== "boolean") throw new Error(`${label}: explicit draft status is required`);
      if ((data.date !== undefined && !validDate(data.date)) || (!data.draft && !validDate(data.date))) throw new Error(`${label}: published posts require a valid quoted YYYY-MM-DD date`);
      if (data.modified !== undefined && (!validDate(data.modified) || (data.date && data.modified < data.date))) throw new Error(`${label}: invalid modification date`);
      const imageFields = [data.imageAlt, data.imageWidth, data.imageHeight];
      if (data.image === undefined && imageFields.some(value => value !== undefined)) throw new Error(`${label}: image details require an image`);
      if (data.image !== undefined) {
        if (typeof data.image !== "string" || !data.image.startsWith("/writing/") || data.image.includes("..")) throw new Error(`${label}: image must be a local writing asset`);
        if (typeof data.imageAlt !== "string" || !data.imageAlt.trim()) throw new Error(`${label}: image alt text is required`);
        for (const dimension of [data.imageWidth, data.imageHeight]) {
          if (!Number.isSafeInteger(dimension) || dimension <= 0) throw new Error(`${label}: positive image dimensions required`);
        }
      }
      if (data.screenshots !== undefined && (!Array.isArray(data.screenshots) || !data.screenshots.length || data.screenshots.some((screenshot: ProjectScreenshot) =>
        !screenshot || typeof screenshot.src !== "string" || !/^\/(projects|writing)\//.test(screenshot.src) || screenshot.src.includes("..")
        || typeof screenshot.alt !== "string" || !screenshot.alt.trim() || typeof screenshot.label !== "string" || !screenshot.label.trim()
        || !Number.isSafeInteger(screenshot.width) || screenshot.width <= 0 || !Number.isSafeInteger(screenshot.height) || screenshot.height <= 0
      ))) throw new Error(`${label}: valid local screenshots with labels, alt text, and dimensions required`);
      if (data.topics !== undefined && (!Array.isArray(data.topics) || data.topics.some((topic: unknown) => typeof topic !== "string" || !topic.trim()))) throw new Error(`${label}: topics must be non-empty strings`);
      const heading = content.trimStart().split("\n")[0];
      if (heading !== `# ${data.title}`) throw new Error(`${label}: heading must match title`);
      const body = content.trimStart().slice(heading.length).trim();
      if (!body || /^# /m.test(body)) throw new Error(`${label}: body required with a single article title`);
      slugs.add(data.slug);
      posts.push({ slug: data.slug, title: data.title, summary: data.summary, author: data.author,
        date: data.date, modified: data.modified, image: data.image, imageAlt: data.imageAlt,
        imageWidth: data.imageWidth, imageHeight: data.imageHeight, screenshots: data.screenshots, topics: data.topics,
        content: body, draft: data.draft });
    }
  }
  return posts;
}

export type PublishedPost = WritingPost & { date: string; draft: false };
export function getPublishedPosts(): PublishedPost[] {
  return loadPosts().filter((post): post is PublishedPost => !post.draft && Boolean(post.date))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function getPublishedPost(slug: string) {
  return getPublishedPosts().find(post => post.slug === slug);
}

export function formatPostDate(date: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

// Shared subjects first; recent published writing fills any remaining places.
export function recommendPosts(current: WritingPost, candidates: WritingPost[], limit = 3) {
  const subjects = new Set(current.topics ?? []);
  const score = (post: WritingPost) => new Set(post.topics?.filter(topic => subjects.has(topic))).size;
  return candidates.filter((post): post is PublishedPost => !post.draft && Boolean(post.date) && post.slug !== current.slug)
    .sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}
