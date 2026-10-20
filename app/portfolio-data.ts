// Content reconciled from Akeem's resumes, previous portfolio, and verified project source.
// See CONTENT_SOURCES.md for provenance and unresolved project details.
export type ProjectScreenshot = {
  src: string;
  alt: string;
  label: string;
  width: number;
  height: number;
};

export type Entry = {
  id: string;
  title: string;
  subtitle: string;
  period?: string;
  featured?: boolean;
  summary: string;
  description: string;
  detailHeadings?: string[];
  tags: string[];
  screenshots?: ProjectScreenshot[];
  image?: string;
  imageAlt?: string;
  github?: string;
  live?: string;
  additionalLinks?: { label: string; href: string }[];
  linkedin?: string;
  codepen?: string;
};

export const profile = {
  name: "Akeem Adeyemi",
  role: "Senior full-stack engineer · Lagos, Nigeria",
  intro: "I build web and mobile products and the backend systems they run on.",
  about: "I’ve spent more than five years building software, including payment and security systems. I’ve also led frontend development and mentored engineers. I care about software that works well in everyday use and is straightforward to maintain.",
  email: "a.akeem@yahoo.com",
  github: "https://github.com/akimzzy",
  linkedin: "https://linkedin.com/in/akeem-adeyemi-872905154",
};

export const projects: Entry[] = [
  {
    id: "alluring-aura-scent", title: "Alluring Aura Scent", subtitle: "Full-stack development · Storefront & admin platform",
    detailHeadings: ["The storefront", "Payments and stock", "How it runs"],
    screenshots: [
      { src: "/projects/alluring-storefront-mobile.jpg", label: "Storefront", alt: "Alluring Aura Scent: Budget finder and trending fragrances", width: 390, height: 844 },
      { src: "/projects/alluring-catalogue-mobile.jpg", label: "Catalogue", alt: "Alluring Aura Scent: Fragrance catalogue", width: 390, height: 844 },
      { src: "/projects/alluring-product-mobile.jpg", label: "Product details", alt: "Alluring Aura Scent: Qasida Signature product details", width: 390, height: 844 },
      { src: "/projects/alluring-categories-mobile.jpg", label: "Categories", alt: "Alluring Aura Scent: Fragrance categories", width: 390, height: 844 },
      { src: "/projects/alluring-search-mobile.jpg", label: "Search", alt: "Alluring Aura Scent: Fragrance search results for Lattafa", width: 390, height: 844 },
    ],
    featured: true,
    summary: "I built the storefront and admin app for a perfume store, with Paystack payment verification, stock allocation in database transactions, and order management.",
    description: "Customers can browse and search for perfumes, check out without an account, choose delivery or pickup, and track their orders. I built the storefront for mobile screens.\n\nStore staff can manage products, import spreadsheets, and fulfil orders through the admin app. Online and walk-in sales use the same inventory. I verify Paystack payments on the server and allocate stock in database transactions, including checks for bundles and shortages.\n\nThe app uses Next.js, React, TypeScript, Tailwind CSS, PostgreSQL, and Drizzle. It runs on Cloudflare Workers, with product images in R2 and order emails sent through Resend.",
    tags: ["Next.js", "TypeScript", "PostgreSQL", "Cloudflare", "Paystack"],
    live: "https://alluringaurascent.com/",
  },
  {
    id: "quikcity", title: "QuikCity", subtitle: "Founder & product lead",
    detailHeadings: ["What I built", "Payments and usage"],
    screenshots: [
      { src: "/projects/quikcity.jpg", label: "Desktop · customer hero", alt: "QuikCity desktop homepage introducing WhatsApp food ordering", width: 1280, height: 720 },
      { src: "/projects/quikcity-hero-mobile.jpg", label: "Mobile · customer hero", alt: "QuikCity mobile homepage introducing WhatsApp food ordering", width: 390, height: 844 },
      { src: "/projects/quikcity-how-it-works-desktop.jpg", label: "Desktop · how it works", alt: "QuikCity explaining how to order food through WhatsApp", width: 1280, height: 720 },
      { src: "/projects/quikcity-vendors-mobile.jpg", label: "Mobile · for vendors", alt: "QuikCity vendor section explaining its restaurant offering", width: 390, height: 844 },
    ],
    featured: true,
    summary: "I started QuikCity and built its food ordering and courier platform, including the vendor app, payments, vendor settlements, and rider payouts.",
    description: "QuikCity started as my own idea, and I designed, built, and launched it myself. Customers order through WhatsApp without downloading an app. Vendors manage their side through app.quikcity.co.\n\nI used Monnify virtual accounts for payments, vendor settlements, and rider payouts. More than 30 vendors joined QuikCity, and it recorded over 100 customer interactions. I later added package and courier delivery alongside food ordering.",
    tags: ["WhatsApp commerce", "Payments", "Monnify", "Logistics"],
    live: "https://quikcity.co/",
    additionalLinks: [{ label: "Vendor app", href: "https://app.quikcity.co/" }],
  },
  {
    id: "onboardbase", title: "Onboardbase", subtitle: "Frontend leadership & full-stack engineering · Treadie Inc.",
    detailHeadings: ["My contribution", "Security and subscriptions"],
    featured: true,
    summary: "At Onboardbase, I led frontend development through launch and later built encrypted secret sharing, usage tracking, and subscription access controls with Stripe.",
    description: "I was Onboardbase’s first frontend engineer and led the frontend work through launch. As the team grew, I mentored engineers, reviewed code, and took on architecture, API design, and backend work. Onboardbase is a Techstars-backed startup.\n\nI built end-to-end encrypted secret sharing with RSA and AES. I also built the usage tracking and subscription access controls, using Stripe subscriptions to check plan limits and decide which features a customer could use.",
    tags: ["Frontend architecture", "RSA / AES", "Stripe", "Subscriptions"],
    live: "https://www.linkedin.com/company/onboardbase/",
  },
  {
    id: "buzthrive", title: "Buzthrive", subtitle: "Full-stack development · Adventlabs",
    detailHeadings: ["My contribution", "Billing migration"],
    featured: true,
    summary: "At Adventlabs, I built subscription access controls and recurring billing for Buzthrive, then moved billing from Flutterwave to Paystack after problems with automatic renewals.",
    description: "Buzthrive is an inventory platform used by businesses across several African countries. At Adventlabs, I worked on subscriptions, recurring billing, API integrations, and maintenance.\n\nI first built the billing integration with Flutterwave. After finding problems with automatic renewals in production, I moved it to Paystack.",
    tags: ["Multi-tenant SaaS", "Subscription billing", "Flutterwave", "Paystack"],
    live: "https://www.buzthrive.com/",
  },
  {
    id: "giinagay-community-care", title: "Giinagay Community Care", subtitle: "Website development · Client project",
    detailHeadings: ["The website", "Implementation"],
    summary: "A responsive client website presenting Giinagay Community Care’s story, services, community work, and enquiry pathway.",
    description: "I built the public website for Giinagay Community Care, an Indigenous-owned, female-led, family-run organisation. It brings the organisation’s story, services, approach, and community work together, with an enquiry form and privacy page.\n\nThe site uses Next.js, React, TypeScript, Tailwind CSS, and GSAP. Its contact form sends enquiries through a server-side Resend integration.",
    tags: ["Next.js", "TypeScript", "Tailwind CSS", "GSAP", "Resend"],
    live: "https://www.giinagaycommunitycare.com.au/",
  },
  // Retained work from akeemdev.netlify.app; no release dates are implied.
  {
    id: "invoice", title: "Invoice app", subtitle: "Offline-first PWA",
    summary: "An invoice app that works offline, built with Vue.js, Tailwind CSS, and Dexie.js.",
    description: "I built this invoice app as a progressive web app with offline support. It uses Vue.js for the interface, Tailwind CSS for styling, and Dexie.js for browser storage.",
    tags: ["Vue.js", "Tailwind CSS", "Dexie.js"],
    live: "https://iinvoice.netlify.app/", github: "https://github.com/akimzzy/invoice",
  },
  {
    id: "airbone", title: "Airborne Edu Consult", subtitle: "Landing page",
    screenshots: [
      { src: "/projects/airborne-hero-desktop.jpg", label: "Desktop · homepage", alt: "Airborne Edu Consult desktop homepage", width: 1280, height: 720 },
      { src: "/projects/airborne-hero-mobile.jpg", label: "Mobile · homepage", alt: "Airborne Edu Consult mobile homepage", width: 390, height: 844 },
      { src: "/projects/airborne-services-desktop.jpg", label: "Services", alt: "Airborne Edu Consult university admissions and visa assistance services", width: 1280, height: 720 },
      { src: "/projects/airborne-destinations-desktop.jpg", label: "Study destinations", alt: "Airborne Edu Consult study destination cards", width: 1280, height: 720 },
    ],
    summary: "An education consultancy landing page built with Next.js and Motion.",
    description: "I built the Airborne Edu Consult website with Next.js and Motion. It presents the consultancy’s services and study destinations.",
    tags: ["Next.js", "Motion"],
    live: "https://airborneconsult.com/", github: "https://github.com/akimzzy/airbone-agency",
  },
  {
    id: "dafrigroup", title: "Dafrigroup", subtitle: "Landing page",
    summary: "A landing-page project built with React and Node.js.",
    description: "I built this landing page for Dafrigroup using React and Node.js.",
    tags: ["React", "Node.js"],
    live: "https://dafrigroup.netlify.app/", github: "https://github.com/akimzzy/dafrigroup",
  },
];

export const experience: Entry[] = [
  {
    id: "adventlabs", title: "Adventlabs", subtitle: "Full-stack developer · Remote", period: "Feb 2026 – Aug 2026",
    summary: "Built subscriptions and recurring billing for Buzthrive, an inventory platform used by multiple businesses.",
    description: "I worked on Buzthrive, an inventory platform used across several African countries. I built subscription access controls and recurring billing with Flutterwave, then moved billing to Paystack after finding problems with automatic renewals.\n\nI also integrated third-party APIs, maintained the platform, and worked on new features.",
    tags: ["Multi-tenant SaaS", "Billing", "API integrations", "Flutterwave", "Paystack"],
    additionalLinks: [{ label: "Buzthrive", href: "https://www.buzthrive.com/" }],
  },
  {
    id: "crestbase", title: "Crestbase", subtitle: "Frontend developer → full-stack developer · Remote", period: "Aug 2025 – Jun 2026",
    summary: "Built web interfaces and backend features for savings, property purchases, and partner tools.",
    description: "I built web interfaces from Figma designs and connected them to backend services. I worked on subscriptions, virtual accounts, and features that let customers save towards property purchases while earning interest.\n\nI also restructured and optimised parts of the backend to improve performance and make the code easier to maintain. Other work included admin and partner tools for hotels and property management.",
    tags: ["Frontend development", "Backend systems", "Virtual accounts", "Savings workflows"],
    live: "https://crestbasehq.com/",
  },
  {
    id: "treadie", title: "Treadie Inc. · Onboardbase", subtitle: "Frontend developer → lead frontend developer → full-stack engineer · Remote", period: "Oct 2020 – Feb 2025",
    summary: "Joined as the first frontend engineer, led the frontend through launch, and later took on backend work and engineering leadership.",
    description: "I led frontend development from the first implementation through launch. I mentored frontend engineers, reviewed code, and worked on architecture and API design.\n\nMy backend work included end-to-end encrypted secret sharing with RSA and AES, plus usage tracking and subscription access controls connected to Stripe.",
    tags: ["Engineering leadership", "Frontend architecture", "RSA / AES", "Stripe"],
    linkedin: "https://www.linkedin.com/company/onboardbase/",
  },
  {
    id: "freelance", title: "Freelance", subtitle: "Frontend & full-stack developer", period: "Apr 2019 – Sep 2022",
    summary: "Built websites and web apps for clients in different industries.",
    description: "I designed and built about seven client projects. I worked directly with clients to understand what they needed and turn those requirements into websites and web apps.",
    tags: ["Web development", "Client collaboration", "JavaScript"],
  },
];

export const skills = [
  { category: "Frontend", items: "Vue.js, Nuxt.js, React, Next.js, Tailwind CSS" },
  { category: "Backend & languages", items: "TypeScript, JavaScript, Kotlin, Java, NestJS, Ktor, REST APIs, GraphQL" },
  { category: "Mobile", items: "React Native, Expo" },
  { category: "Data", items: "PostgreSQL, MySQL, MongoDB, Redis" },
  { category: "Infrastructure", items: "Docker, AWS, DigitalOcean, Railway, CI/CD" },
  { category: "Payments & systems", items: "Stripe, Paystack, Flutterwave, Monnify, authentication, end-to-end encryption, multi-tenant SaaS, subscription billing" },
];

export const education = {
  qualification: "B.Sc. Accounting",
  institution: "National Open University of Nigeria",
  year: "2023",
};
