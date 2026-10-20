import Portfolio from "./portfolio";
import { profile } from "./portfolio-data";
import { siteDescription, siteUrl } from "./site-config";
import { estimateReadingMinutes } from "./writing/reading-time";
import { formatPostDate, getPublishedPosts } from "./writing/posts";

export default function Home() {
  const posts = getPublishedPosts();
  const homepageSelection = [
    "building-nextjs-ecommerce-app",
    "duplicate-paystack-notifications",
    "migrating-production-data-safely",
  ];
  const postsBySlug = new Map(posts.map(post => [post.slug, post]));
  const articles = homepageSelection.flatMap(slug => {
    const post = postsBySlug.get(slug);
    if (!post) return [];
    return [{
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    date: post.date,
    formattedDate: formatPostDate(post.date),
    readingMinutes: estimateReadingMinutes(post.content),
    }];
  });

  const person = siteUrl ? {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": new URL("/#person", siteUrl).href,
    name: profile.name,
    url: siteUrl.href,
    jobTitle: "Senior full-stack engineer",
    description: siteDescription,
    homeLocation: { "@type": "Place", name: "Lagos, Nigeria" },
    sameAs: [profile.github, profile.linkedin],
  } : undefined;

  return <>
    {person && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, "\\u003c") }} />}
    <Portfolio articles={articles} articleCount={posts.length} />
  </>;
}
