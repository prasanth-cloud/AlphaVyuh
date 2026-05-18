import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--app-bg)", color: "var(--app-text1)" }}
    >
      <div
        className="w-full max-w-md rounded-[12px] border p-6"
        style={{ background: "var(--app-surface1)", borderColor: "var(--app-border)" }}
      >
        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--app-text3)" }}>
          Route unavailable
        </div>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight">This workspace is not available.</h1>
        <p className="mt-3 text-[14px] leading-6" style={{ color: "var(--app-text2)" }}>
          The link may be stale, or this workspace may not be enabled for your current account.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-[8px] px-3 py-2 text-[13px] font-semibold"
            style={{ background: "var(--app-accent)", color: "#04120d" }}
          >
            Open dashboard
          </Link>
          <Link
            href="/"
            className="rounded-[8px] border px-3 py-2 text-[13px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-text1)" }}
          >
            Back to site
          </Link>
        </div>
      </div>
    </main>
  );
}
