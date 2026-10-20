import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArticleBody } from "../article-body";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectGallery } from "../../project-gallery";
import { formatPostDate, getPublishedPost, getPublishedPosts, recommendPosts } from "../posts";
import { siteUrl } from "../../site-config";
import { articleMetadata, articleJsonLd } from "../article-metadata";
import { ArticleNavigation } from "../article-navigation";
import { ReadingTimeLabel } from "../reading-time-label";
import { CodeCopyController } from "../code-copy-controller";
import { profile } from "../../portfolio-data";

type ArticleProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ArticleProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) return { title: "Post not found | Akeem Adeyemi", robots: { index: false } };
  return articleMetadata(post, siteUrl);
}

async function Article({ params }: ArticleProps) {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) notFound();
  const jsonLd = articleJsonLd(post, siteUrl, [profile.github, profile.linkedin]);
  const recommendations = recommendPosts(post, getPublishedPosts());
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <ArticleNavigation key={post.slug} title={post.title} />
    <header className="mt-4">
      <h1 id="article-title" className="break-words text-pretty text-2xl font-semibold leading-8 tracking-[-0.02em] sm:text-[28px] sm:leading-9">{post.title}</h1>
      <p className="mt-3 text-[13px] leading-5 text-[#686d63] dark:text-[#8d9387]">By {post.author} · <time dateTime={post.date}>{formatPostDate(post.date)}</time> · <ReadingTimeLabel content={post.content} />{post.modified && post.modified !== post.date && <> · Updated <time dateTime={post.modified}>{formatPostDate(post.modified)}</time></>}</p>
      <p className="mt-4 text-[17px] leading-7 text-[#4e5449] dark:text-[#c5c8bc]">{post.summary}</p>
    </header>
    {post.screenshots?.length ? <div className="mt-8">
      <ProjectGallery title={post.title} screenshots={post.screenshots} hint="Select an image to enlarge. Scroll horizontally to see more." />
    </div> : post.image && <Image src={post.image} alt={post.imageAlt ?? ""} width={post.imageWidth!} height={post.imageHeight!} sizes="(max-width: 688px) calc(100vw - 48px), 640px" className="mt-8 h-auto w-full rounded-lg" />}
    <ArticleBody content={post.content} />
    <CodeCopyController />
    {recommendations.length > 0 && <nav aria-labelledby="read-next-heading" className="mt-12">
      <h2 id="read-next-heading" className="text-xl font-semibold leading-7">Read next</h2>
      <ul className="mt-5 space-y-5">
        {recommendations.map(recommended => <li key={recommended.slug}>
          <Link href={`/writing/${recommended.slug}`} className="block min-h-11 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]">
            <h3 className="text-base font-medium leading-6 text-[#355f9c] underline decoration-transparent underline-offset-4 hover:decoration-current dark:text-[#9aaed7]">{recommended.title}</h3>
            <p className="mt-1 text-[13px] leading-6 text-[#686d63] dark:text-[#a4a89c]">{recommended.summary}</p>
          </Link>
        </li>)}
      </ul>
    </nav>}
  </article>;
}

export default function ArticlePage(props: ArticleProps) {
  return <Suspense fallback={<p role="status" className="text-sm text-[#686d63] dark:text-[#a4a89c]">Loading post…</p>}><Article {...props} /></Suspense>;
}
