const configuredUrl = process.env.SITE_URL?.trim();

function resolveSiteUrl() {
  if (!configuredUrl) return undefined;
  const url = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL must be the public site origin, for example https://portfolio.example');
  }
  return url;
}

export const siteUrl = resolveSiteUrl();
export const siteDescription = "Akeem Adeyemi is a senior full-stack engineer based in Lagos. He builds web and mobile apps, backend systems, payments, and security features.";
