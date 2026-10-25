"use client";

import Image from "next/image";
import Link from "next/link";
import { ProjectGallery } from "./project-gallery";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "./arrow";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { lockDocumentScroll } from "./document-scroll-lock";
import { education, experience, profile, projects, skills, type Entry } from "./portfolio-data";

const muted = "text-[#686d63] dark:text-[#a4a89c]";
const metadataTone = "text-[#686d63] dark:text-[#8d9387]";
const link = "text-[#355f9c] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#203f6d] hover:decoration-current dark:text-[#9aaed7] dark:hover:text-[#c5d3ee]";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:focus-visible:outline-[#a9bddf]";

type HomepageArticle = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  formattedDate: string;
  readingMinutes: number;
};

function ContactIcon({ name }: { name: "github" | "linkedin" | "email" | "resume" }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    {name === "github" && <><path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-1-2.7c3.3-.4 6.8-1.6 6.8-7.4A5.8 5.8 0 0 0 19.2 4 5.4 5.4 0 0 0 19 0s-1.3-.4-4.2 1.6a14.5 14.5 0 0 0-7.6 0C4.3-.4 3 0 3 0a5.4 5.4 0 0 0-.2 4A5.8 5.8 0 0 0 1.2 8c0 5.8 3.5 7 6.8 7.4a3.4 3.4 0 0 0-1 2.7V22" transform="translate(1 1) scale(.9)" /></>}
    {name === "linkedin" && <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M7.5 10v7M11.5 17v-7m0 3a3 3 0 0 1 6 0v4" /><circle cx="7.5" cy="7" r=".5" fill="currentColor" /></>}
    {name === "email" && <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 6 9 7 9-7" /></>}
    {name === "resume" && <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>}
  </svg>;
}

function ExternalLinkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
    <path d="M14 4h6v6m0-6-9 9" />
    <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </svg>;
}

function Contact({ href, label, icon, download = false }: { href: string; label: string; icon: "github" | "linkedin" | "email" | "resume"; download?: boolean }) {
  const opensNewTab = !download && !href.startsWith("mailto:");
  return <a href={href} download={download || undefined} target={opensNewTab ? "_blank" : undefined} rel={opensNewTab ? "noopener noreferrer" : undefined} className={`inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 bg-black/[0.055] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-black/[0.09] dark:bg-white/[0.075] dark:hover:bg-white/[0.12] ${focus}`}><ContactIcon name={icon} />{label}{opensNewTab && <><ExternalLinkIcon /><span className="sr-only"> (opens in a new tab)</span></>}</a>;
}

function ProjectLink({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center gap-2 rounded text-sm ${link} ${focus}`}>{label}<ExternalLinkIcon /><span className="sr-only"> (opens in a new tab)</span></a>;
}

function ProjectList({ entries, onOpen }: { entries: Entry[]; onOpen: (entry: Entry) => void }) {
  return (
    <ul className="mt-1">
      {entries.map(project => (
        <li key={project.id} className="border-b border-black/[0.06] py-3 last:border-0 dark:border-white/[0.07]">
          <button onClick={() => onOpen(project)} aria-haspopup="dialog" aria-controls="portfolio-detail" aria-label={`View ${project.title} project details`} className={`block min-h-11 w-full touch-manipulation rounded text-left ${focus}`}>
            <span className={`flex items-center gap-2 text-base font-medium leading-6 ${link}`}><span className="break-words">{project.title}</span><Arrow /></span>
            <span className="mt-1 block text-sm leading-6">{project.summary}</span>
            <span className={`mt-1 block text-xs leading-5 ${metadataTone}`}>{project.tags.join(" · ")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Portfolio({ articles, articleCount }: { articles: HomepageArticle[]; articleCount: number }) {
  const [detail, setDetail] = useState<Entry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!detail) return;
    previousFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    const unlockScroll = lockDocumentScroll();
    return () => {
      unlockScroll();
      previousFocus.current?.focus();
    };
  }, [detail]);

  const isProject = detail && projects.some(entry => entry.id === detail.id);

  return (
    <div id="top" className="min-h-svh">
      <SiteHeader />

      <main id="content" tabIndex={-1} className="mx-auto max-w-[688px] scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)] px-6 pb-12 pt-10 sm:pt-12">
        <section id="about" aria-label="Me" className="scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)]">
          <h1 id="intro-heading" className="text-balance text-[22px] font-semibold leading-7 tracking-[-0.01em]">{profile.name}</h1>
          <p className={`mt-1 text-[13px] leading-5 ${metadataTone}`}>{profile.role}</p>
          <p className="mt-6 text-[13px] font-semibold leading-6">{profile.intro}</p>
          <p className={`mt-2 text-sm leading-6 ${muted}`}>{profile.about}</p>
          <nav aria-label="Contact and social links" className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Contact href={profile.github} label="GitHub" icon="github" />
            <Contact href={profile.linkedin} label="LinkedIn" icon="linkedin" />
            <Contact href={profile.email ? `mailto:${profile.email}` : ""} label="Email" icon="email" />
            <Contact href="/akeem-adeyemi-resume.pdf" label="Download résumé" icon="resume" download />
          </nav>
        </section>

        <section id="experience" aria-labelledby="experience-heading" className="mt-12 scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)]">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="experience-heading" className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] ${metadataTone}`}>Career</h2>
          </div>
          <ul className="space-y-2">
            {experience.map(role => (
              <li key={role.id}>
                  <button onClick={() => setDetail(role)} aria-haspopup="dialog" aria-controls="portfolio-detail" aria-label={`View ${role.title} career details`} className={`block w-full cursor-pointer touch-manipulation rounded-lg bg-black/[0.025] p-3 text-left transition-colors hover:bg-black/[0.05] sm:p-4 dark:bg-white/[0.035] dark:hover:bg-white/[0.065] ${focus}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-base font-medium">{role.title}</h3>
                    <span className={`text-xs tabular-nums ${metadataTone}`}>{role.period}</span>
                  </div>
                  <p className={`mt-1 text-[13px] font-semibold leading-5 ${muted}`}>{role.subtitle}</p>
                  <p className={`mt-2 text-sm leading-6 ${muted}`}>{role.summary}</p>
                  <span className={`mt-2 inline-flex items-center gap-2 text-xs font-medium leading-5 ${link}`}>View details<Arrow /></span>
                </button>
              </li>
            ))}
            {!experience.length && <li className={`py-6 text-sm ${muted}`}>Career details will appear here soon.</li>}
          </ul>
        </section>

        <section id="skills" aria-labelledby="skills-heading" className="mt-12 scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)]">
          <h2 id="skills-heading" className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] ${metadataTone}`}>Tools & skills</h2>
          <dl className="mt-3 space-y-2">
            {skills.map(skill => <div key={skill.category} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
              <dt className="text-[13px] font-medium leading-6">{skill.category}</dt>
              <dd className={`text-[13px] leading-6 ${muted}`}>{skill.items}</dd>
            </div>)}
          </dl>
        </section>

        <section id="projects" aria-labelledby="projects-heading" className="mt-12 scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)]">
          <h2 id="projects-heading" className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] ${metadataTone}`}>Works</h2>
          <p className={`mt-1 text-[13px] leading-6 ${muted}`}>Products I’ve built myself or worked on as part of a team.</p>
          <ProjectList entries={projects} onOpen={setDetail} />
        </section>

        <section aria-labelledby="education-heading" className="mt-12">
          <h2 id="education-heading" className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] ${metadataTone}`}>Education</h2>
          <p className={`mt-2 text-sm leading-6 ${muted}`}>{education.qualification} · {education.institution} · {education.year}</p>
        </section>

        {articles.length > 0 && <section id="writing" aria-labelledby="writing-heading" className="mt-12 scroll-mt-[calc(var(--portfolio-header-height,9.5rem)+1.5rem)]">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="writing-heading" className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.06em] ${metadataTone}`}>Articles</h2>
            <Link href="/writing" className={`inline-flex min-h-11 items-center rounded text-[13px] ${link} ${focus}`}>View all {articleCount} articles<Arrow /></Link>
          </div>
          <p className={`mt-1 text-[13px] leading-6 ${muted}`}>Articles about the products I build, engineering problems I work through, and what I learn along the way.</p>
          <ul className="mt-3 space-y-4">
            {articles.map(article => <li key={article.slug}>
              <Link href={`/writing/${article.slug}`} className={`block min-h-11 rounded ${focus}`}>
                <h3 className={`text-base font-medium leading-6 ${link}`}>{article.title}</h3>
                <p className="mt-1 text-[13px] leading-6">{article.summary}</p>
                <p className={`mt-1 text-[13px] leading-5 ${metadataTone}`}>
                  <time dateTime={article.date}>{article.formattedDate}</time>
                  {" · "}About {article.readingMinutes} min read
                </p>
              </Link>
            </li>)}
          </ul>
        </section>}
      </main>

      <SiteFooter />

      <dialog id="portfolio-detail" ref={dialog} aria-labelledby="detail-title" onCancel={() => setDetail(null)} onClose={() => setDetail(null)} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
        const visibleControls = controls.filter(control => control.getClientRects().length > 0);
        const first = visibleControls[0];
        const last = visibleControls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current?.close();
      }} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90svh] w-full max-w-none overflow-hidden rounded-t-2xl border-0 bg-[#f8f8f5] p-0 text-[#292d25] shadow-xl backdrop:bg-black/50 sm:inset-0 sm:m-auto sm:max-h-[85svh] sm:w-[calc(100%-2rem)] sm:max-w-[640px] sm:rounded-xl dark:bg-[#161713] dark:text-[#edeee8]">
        {detail && <div className="flex max-h-[90svh] flex-col sm:max-h-[85svh]">
          <div className="shrink-0 px-6 pb-2 pt-5 sm:px-8 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><h2 id="detail-title" className="break-words text-2xl font-semibold tracking-[-0.025em]">{detail.title}</h2><p className={`mt-1 leading-6 ${isProject ? "text-[13px]" : "text-[13px] font-semibold"} ${muted}`}>{detail.subtitle}</p></div>
              <button autoFocus aria-label="Close details" onClick={() => dialog.current?.close()} className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 ${focus}`}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-5 w-5"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
            </div>
            {!isProject && <p className={`mt-1 text-xs tabular-nums ${muted}`}>{detail.period}</p>}
            <div className="flex flex-wrap gap-x-5">
              {isProject && <ProjectLink href={detail.github} label="GitHub" />}
              <ProjectLink href={detail.live} label={isProject ? "Visit project" : "Visit website"} />
              {detail.additionalLinks?.map(item => <ProjectLink key={item.href} href={item.href} label={item.label} />)}
              {isProject && <ProjectLink href={detail.codepen} label="CodePen" />}
              <ProjectLink href={detail.linkedin} label="LinkedIn" />
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-8">
            {detail.screenshots?.length ? <ProjectGallery key={detail.id} title={detail.title} screenshots={detail.screenshots} hint="Tap to enlarge" /> : null}
            {!detail.screenshots?.length && detail.image && <div className="relative mt-6 aspect-video overflow-hidden rounded-lg"><Image src={detail.image} alt={detail.imageAlt ?? `${detail.title} screenshot`} fill sizes="(max-width: 640px) 90vw, 576px" quality={90} className="object-contain" /></div>}
            <p className="mt-6 text-sm leading-6">{detail.summary}</p>
            {detail.detailHeadings ? <div className="mt-5 space-y-5">
              {detail.description.split("\n\n").map((paragraph, index) => <section key={paragraph}>
                <h3 className="text-sm font-medium leading-6">{detail.detailHeadings?.[index]}</h3>
                <p className={`mt-1 text-sm leading-6 ${muted}`}>{paragraph}</p>
              </section>)}
            </div> : <p className={`mt-4 whitespace-pre-line text-sm leading-6 ${muted}`}>{detail.description}</p>}
            <p className={`mt-5 text-xs leading-6 ${muted}`}>{detail.tags.join(" · ")}</p>
          </div>
        </div>}
      </dialog>
    </div>
  );
}
