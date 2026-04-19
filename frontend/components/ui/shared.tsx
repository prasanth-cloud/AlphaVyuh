export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '11px 14px' }}>
          <div style={{
            height: 14, borderRadius: 4,
            background: 'var(--surface-2)',
            width: `${60 + (i * 13) % 40}%`,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px',
      textAlign: 'center', minHeight: 280,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 500,
        color: 'var(--text-primary)', marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-tertiary)',
        maxWidth: 320, lineHeight: 1.6,
        marginBottom: action ? 20 : 0,
      }}>
        {sub}
      </div>
      {action && (
        <a href={action.href} style={{
          padding: '7px 16px', borderRadius: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border-default)',
          fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
        }}>
          {action.label}
        </a>
      )}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--loss-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="var(--loss)" strokeWidth="1.5" />
          <path d="M7 4.5v3M7 9.5v.5" stroke="var(--loss)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, maxWidth: 280 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
