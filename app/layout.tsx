import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { siteDescription, siteUrl } from "./site-config";

const cabinetGrotesk = localFont({
  src: "./fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-portfolio-sans",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: {
    default: "Senior Full-Stack Engineer in Lagos | Akeem Adeyemi",
    template: "%s | Akeem Adeyemi",
  },
  description: siteDescription,
  metadataBase: siteUrl,
  authors: [{ name: "Akeem Adeyemi" }],
  alternates: siteUrl ? { canonical: "/" } : undefined,
  robots: { index: Boolean(siteUrl), follow: Boolean(siteUrl) },
  openGraph: { title: "Senior Full-Stack Engineer in Lagos | Akeem Adeyemi", description: siteDescription, siteName: "Akeem Adeyemi", type: "website", locale: "en_NG" },
  twitter: { card: "summary_large_image", title: "Senior Full-Stack Engineer in Lagos | Akeem Adeyemi", description: siteDescription },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cabinetGrotesk.variable} h-full antialiased [scrollbar-width:none] [&_*]:[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_*::-webkit-scrollbar]:hidden [color-scheme:light] dark:[color-scheme:dark]`}
    >
      <head><script id="portfolio-theme" dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("portfolio-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}` }} /></head>
      <body className="min-h-full bg-[#f8f8f5] font-sans text-[#292d25] antialiased selection:bg-[#dce5f2] selection:text-[#292d25] dark:bg-[#0d0e0c] dark:text-[#edeee8]">{children}</body>
    </html>
  );
}
