"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#f2f2f0] flex flex-col items-center justify-center gap-4 px-6">
      <div className="w-[52px] h-[52px] bg-[#1c1c1a] rounded-[14px] flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 14 14" fill="none">
          <path d="M2 11L7 3L12 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 8h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight mb-1">You&apos;re offline</div>
        <div className="text-[14px] text-[#888]">Check your connection and try again.</div>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-5 py-2.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-lg hover:bg-[#333] transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
