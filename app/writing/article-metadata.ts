import type { Metadata } from "next";
import type { PublishedPost } from "./posts";

export function articleMetadata(post: PublishedPost, origin?: URL): Metadata {
  const url = origin ? new URL(`/writing/${post.slug}`, origin).href : undefined;
  const image = post.image ? origin ? new URL(post.image, origin).href : post.image : undefined;
  return {
    title: post.title,
    description: post.summary,
    authors: [{ name: post.author, url: origin?.href }],
    category: "Software engineering",
    robots: { index: Boolean(origin), follow: Boolean(origin) },
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      title: `${post.title} | Akeem Adeyemi`, description: post.summary, type: "article", url,
      siteName: "Akeem Adeyemi", locale: "en_NG",
      publishedTime: post.date, modifiedTime: post.modified,
      authors: origin ? [origin.href] : undefined,
      ...(image ? { images: [{ url: image, width: post.imageWidth, height: post.imageHeight, alt: post.imageAlt }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary", title: `${post.title} | Akeem Adeyemi`, description: post.summary,
      ...(image ? { images: [{ url: image, alt: post.imageAlt }] } : {}),
    },
  };
}

export function articleJsonLd(post: PublishedPost, origin?: URL, authorProfiles: string[] = []) {
  const url = origin ? new URL(`/writing/${post.slug}`, origin).href : undefined;
  return {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: post.title, description: post.summary, inLanguage: "en",
    author: {
      "@type": "Person",
      ...(origin ? { "@id": new URL("/#person", origin).href, url: origin.href } : {}),
      name: post.author,
      ...(authorProfiles.length ? { sameAs: authorProfiles } : {}),
    },
    datePublished: post.date, dateModified: post.modified ?? post.date,
    mainEntityOfPage: url, url,
    ...(post.image ? { image: origin ? [new URL(post.image, origin).href] : [post.image] } : {}),
  };
}
