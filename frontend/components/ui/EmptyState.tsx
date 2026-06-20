import type { LucideIcon } from "lucide-react"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void } | { label: string; href: string }
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px', textAlign: 'center', minHeight: 280,
    }}>
      {Icon && (
        <div style={{ marginBottom: 16, color: '#00D9A7' }}>
          <Icon size={40} strokeWidth={1.5} />
        </div>
      )}
      <div style={{
        fontSize: 16, fontWeight: 500,
        color: 'var(--text-primary, #F1EFE8)', marginBottom: 6,
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: 13, color: 'var(--text-tertiary, #A8A29E)',
          maxWidth: 320, lineHeight: 1.6, marginBottom: action ? 20 : 0,
        }}>
          {description}
        </div>
      )}
      {action && 'href' in action && (
        <a href={action.href} style={{
          padding: '7px 16px', borderRadius: 20,
          background: 'transparent', border: '1px solid #00D9A7',
          fontSize: 12, fontWeight: 500, color: '#00D9A7',
          textDecoration: 'none',
        }}>
          {action.label}
        </a>
      )}
      {action && 'onClick' in action && (
        <button onClick={action.onClick} style={{
          padding: '7px 16px', borderRadius: 20,
          background: 'transparent', border: '1px solid #00D9A7',
          fontSize: 12, fontWeight: 500, color: '#00D9A7', cursor: 'pointer',
        }}>
          {action.label}
        </button>
      )}
    </div>
  )
}
