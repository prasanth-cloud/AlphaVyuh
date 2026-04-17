export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-b border-[#f2f2f0]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

export function EmptyState({ title, sub, action }: {
  title: string
  sub: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-10 h-10 bg-[#f2f2f0] rounded-full flex items-center justify-center mb-3 border border-[#e8e8e6]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="#bbb" strokeWidth="1.5"/>
          <path d="M6 8h4M8 6v4" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="text-[14px] font-semibold text-[#0f0f0e] mb-1">{title}</p>
      <p className="text-[12px] text-[#aaa] mb-4 max-w-xs leading-relaxed">{sub}</p>
      {action && (
        <a
          href={action.href}
          className="text-[12px] font-semibold text-white bg-[#0f0f0e] px-4 py-2 rounded-[7px] hover:opacity-85 transition-opacity"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-9 h-9 bg-[#fff0f0] rounded-full flex items-center justify-center mb-3">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="#e5383b" strokeWidth="1.5"/>
          <path d="M7 4.5v3M7 9.5v.5" stroke="#e5383b" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="text-[13px] text-[#888] mb-3 max-w-xs">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-[12px] text-[#5b63f5] hover:underline font-medium">
          Try again
        </button>
      )}
    </div>
  )
}
