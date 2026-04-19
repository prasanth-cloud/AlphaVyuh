import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
  size?: 'default' | 'sm'
}

const paddingMap = { none: 0, sm: 12, md: 16, lg: 24 }

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', interactive, style, children, size, ...rest }, ref) => {
    void size // consumed only for backward compat, not used in styling
    return (
    <div
      ref={ref}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: paddingMap[padding],
        transition: interactive
          ? 'border-color var(--motion-instant) var(--ease-out), background var(--motion-instant) var(--ease-out)'
          : undefined,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={interactive ? e => {
        e.currentTarget.style.borderColor = 'var(--border-default)'
      } : undefined}
      onMouseLeave={interactive ? e => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
      } : undefined}
      {...rest}
    >
      {children}
    </div>
  )}
)
Card.displayName = 'Card'

/* Subcomponent shims — keeps legacy imports from breaking */
export function CardHeader({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ padding: '16px 20px 0', ...style }} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, ...style }} {...rest}>
      {children}
    </div>
  )
}

export function CardDescription({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, ...style }} {...rest}>
      {children}
    </div>
  )
}

export function CardContent({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ padding: '16px 20px', ...style }} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{
      padding: '12px 20px',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center',
      ...style,
    }} {...rest}>
      {children}
    </div>
  )
}

export function CardAction({ children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ marginLeft: 'auto', ...style }} {...rest}>
      {children}
    </div>
  )
}
