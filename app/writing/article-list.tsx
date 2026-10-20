"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ArticleSummary = { slug: string; title: string; summary: string; date: string; formattedDate: string; topics?: string[]; readingMinutes: number };

export function ArticleList({ posts }: { posts: ArticleSummary[] }) {
  const [query, setQuery] = useState("");
  const filteredPosts = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return posts;
    return posts.filter(post => {
      const searchable = [post.title, post.summary, ...(post.topics ?? [])].join(" ").toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    });
  }, [posts, query]);

  return <>
    <div className="mt-8 max-w-xl">
      <label htmlFor="writing-search" className="sr-only">Search articles</label>
      <input
        id="writing-search"
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search articles"
        autoComplete="off"
        className="min-h-11 w-full rounded-md border border-[#d9dcd5] bg-white px-3 text-sm text-[#292d25] placeholder:text-[#777c73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5277ae] dark:border-[#3b4038] dark:bg-[#171915] dark:text-[#edeee8] dark:placeholder:text-[#a4a89c] dark:focus-visible:outline-[#a9bddf]"
      />
    </div>
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {query.trim() ? `${filteredPosts.length} ${filteredPosts.length === 1 ? "article" : "articles"} found` : `${posts.length} articles`}
    </p>
    {filteredPosts.length ? <ul className="mt-8 space-y-6">
      {filteredPosts.map(post => <li key={post.slug}>
        <Link href={`/writing/${post.slug}`} className="block min-h-11 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]">
          <h2 className="text-base font-medium leading-6 text-[#355f9c] underline decoration-transparent underline-offset-4 hover:decoration-current dark:text-[#9aaed7]">{post.title}</h2>
          <p className="mt-1 text-[13px] leading-6">{post.summary}</p>
          <p className="mt-2 text-[13px] leading-5 text-[#686d63] dark:text-[#8d9387]"><time dateTime={post.date}>{post.formattedDate}</time> · <span aria-label={`About ${post.readingMinutes} ${post.readingMinutes === 1 ? "minute" : "minutes"} to read`}>About {post.readingMinutes} min read</span></p>
        </Link>
      </li>)}
    </ul> : <section aria-live="polite" className="mt-8">
      <h2 className="text-base font-medium leading-6">No matching articles</h2>
      <p className="mt-1 text-[13px] leading-6 text-[#686d63] dark:text-[#a4a89c]">Try a different search term.</p>
      <button type="button" onClick={() => setQuery("")} className="mt-2 inline-flex min-h-11 items-center rounded text-sm text-[#355f9c] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:text-[#9aaed7] dark:focus-visible:outline-[#a9bddf]">Clear search</button>
    </section>}
  </>;
}
