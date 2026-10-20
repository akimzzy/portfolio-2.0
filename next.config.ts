import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingExcludes: {
    "/writing/[slug]": ["./content/drafts/**/*", "./content/*.md"],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
