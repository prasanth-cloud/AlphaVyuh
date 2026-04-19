import React from 'react'

type BadgeVariant = 'neutral' | 'accent' | 'gain' | 'loss' | 'warn' | 'info'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  neutral: { background: 'var(--surface-2)',    color: 'var(--text-secondary)' },
  accent:  { background: 'var(--accent-subtle)', color: 'var(--accent)' },
  gain:    { background: 'var(--gain-subtle)',   color: 'var(--gain)' },
  loss:    { background: 'var(--loss-subtle)',   color: 'var(--loss)' },
  warn:    { background: 'var(--warn-subtle)',   color: 'var(--warn)' },
  info:    { background: 'var(--info-subtle)',   color: 'var(--info)' },
}

export function Badge({
  variant = 'neutral',
  children,
  mono,
}: {
  variant?: BadgeVariant
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px',
      fontSize: 11, fontWeight: 600,
      borderRadius: 'var(--radius-sm)',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      ...variantStyles[variant],
    }}>
      {children}
    </span>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const badgeVariants = (_opts?: { variant?: string; className?: string }) => ''
