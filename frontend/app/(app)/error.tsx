"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center px-4">
      <div className="w-full max-w-[440px] rounded-[12px] border border-white/10 bg-[#141821] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="mb-2 text-[16px] font-semibold text-[#f5f7fb]">Something went wrong</div>
        <div className="mb-2 text-[13px] leading-6 text-[#a8b0bd]">
          We logged this issue for review. Try again, or return to the previous page and continue your workflow.
        </div>
        {error.digest && (
          <div className="mb-5 text-[11px] font-medium text-[#778191]">
            Error reference: {error.digest}
          </div>
        )}
        <button
          onClick={reset}
          className="mt-2 rounded-[8px] bg-[#2dd4bf] px-5 py-2 text-[13px] font-semibold text-[#04111f] transition-colors hover:bg-[#5eead4] focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]/40 focus:ring-offset-2 focus:ring-offset-[#141821]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
