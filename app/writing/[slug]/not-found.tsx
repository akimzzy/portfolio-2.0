import Link from "next/link";

export default function PostNotFound() {
  return <>
    <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">Post not found</h1>
    <p className="mt-3 text-[13px] leading-6 text-[#686d63] dark:text-[#a4a89c]">This story may have moved or hasn’t been published yet.</p>
    <Link href="/writing" className="mt-4 inline-flex min-h-11 items-center rounded text-sm text-[#355f9c] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5277ae] dark:text-[#9aaed7] dark:focus-visible:outline-[#a9bddf]">Back to articles</Link>
  </>;
}
