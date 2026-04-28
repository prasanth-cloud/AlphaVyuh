import Link from "next/link";

type Section = {
  id?: string;
  title: string;
  body: string;
};

type MarketingInfoPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Section[];
  ctaLabel?: string;
  ctaHref?: string;
};

export default function MarketingInfoPage({
  eyebrow,
  title,
  intro,
  sections,
  ctaLabel = "Open AlphaVyuh",
  ctaHref = "/signup",
}: MarketingInfoPageProps) {
  return (
    <main className="min-h-screen bg-[#05090c] text-[#f4f7fb]">
      <section className="mx-auto flex w-[min(100%-32px,960px)] flex-col gap-8 py-10 md:py-16">
        <nav className="flex items-center justify-between gap-4 text-sm">
          <Link href="/" className="font-semibold tracking-[0.08em] text-[#f4f7fb] uppercase">
            AlphaVyuh
          </Link>
          <div className="flex items-center gap-4 text-[#9aa4b2]">
            <Link href="/products" className="hover:text-[#f4f7fb]">Products</Link>
            <Link href="/contact" className="hover:text-[#f4f7fb]">Contact</Link>
            <Link href="/login" className="hover:text-[#f4f7fb]">Sign in</Link>
          </div>
        </nav>

        <header className="border-b border-white/10 pb-8">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#c8f7ee]">{eyebrow}</div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#b6c0ce]">{intro}</p>
        </header>

        <div className="grid gap-4">
          {sections.map((section) => (
            <section
              key={section.title}
              id={section.id}
              className="rounded-[18px] border border-white/10 bg-white/[0.035] p-5 md:p-6"
            >
              <h2 className="mb-3 text-xl font-semibold tracking-[-0.02em]">{section.title}</h2>
              <p className="text-sm leading-7 text-[#b6c0ce]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
          <Link
            href={ctaHref}
            className="rounded-full bg-[#c8f7ee] px-5 py-3 text-sm font-bold text-[#04120d]"
          >
            {ctaLabel}
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#f4f7fb]"
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
