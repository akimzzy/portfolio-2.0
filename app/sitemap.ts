import type { MetadataRoute } from "next";
import { siteUrl } from "./site-config";
import { getPublishedPosts } from "./writing/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteUrl) return [];
  return [
    { url: new URL("/", siteUrl).href },
    { url: new URL("/writing", siteUrl).href },
    ...getPublishedPosts().map(post => ({ url: new URL(`/writing/${post.slug}`, siteUrl).href, lastModified: post.modified ?? post.date })),
  ];
}
