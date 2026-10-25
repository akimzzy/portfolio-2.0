import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "../arrow";
import { formatPostDate, getPublishedPosts } from "./posts";
import { siteUrl } from "../site-config";
import { ArticleList } from "./article-list";
import { estimateReadingMinutes } from "./reading-time";

export const metadata: Metadata = {
  title: "Articles",
  description: "Articles about the products I build, engineering problems I work through, and what I learn along the way.",
  alternates: siteUrl ? { canonical: "/writing" } : undefined,
  openGraph: { title: "Articles | Akeem Adeyemi", description: "Articles about software I’ve built, engineering problems I’ve worked through, and what I learned.", type: "website" },
  twitter: { title: "Articles | Akeem Adeyemi", description: "Articles about software I’ve built, engineering problems I’ve worked through, and what I learned." },
};

export default function WritingPage() {
  const posts = getPublishedPosts();
  return <>
    <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">Articles</h1>
    <p className="mt-3 text-[13px] leading-6 text-[#686d63] dark:text-[#a4a89c]">Practical articles about software I build, engineering problems I work through, and what I learn along the way.</p>
    {posts.length ? <ArticleList posts={posts.map(post => ({
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      date: post.date,
      formattedDate: formatPostDate(post.date),
      topics: post.topics,
      readingMinutes: estimateReadingMinutes(post.content),
    }))} /> : <section aria-labelledby="empty-writing-heading" className="mt-12">
      <h2 id="empty-writing-heading" className="text-base font-medium leading-6">No posts yet.</h2>
      <p className="mt-1 text-[13px] leading-6 text-[#686d63] dark:text-[#a4a89c]">I’ll share my first article here when it’s ready.</p>
      <Link href="/#projects" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded text-sm text-[#355f9c] underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:text-[#9aaed7] dark:focus-visible:outline-[#a9bddf]">View my projects<Arrow /></Link>
    </section>}
  </>;
}
