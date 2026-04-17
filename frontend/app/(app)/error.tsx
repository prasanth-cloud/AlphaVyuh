"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#f2f2f0] flex items-center justify-center">
      <div className="bg-white border border-[#e2e2df] rounded-[12px] p-8 max-w-[420px] w-full text-center shadow-sm">
        <div className="w-10 h-10 rounded-full bg-[#fff0f0] flex items-center justify-center mx-auto mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e5383b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div className="text-[15px] font-semibold text-[#1c1c1a] mb-1">Something went wrong</div>
        <div className="text-[13px] text-[#888] mb-5">
          {error.message || "An unexpected error occurred."}
        </div>
        <button
          onClick={reset}
          className="px-5 py-2 bg-[#5b63f5] text-white text-[13px] font-semibold rounded-[8px] hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
