'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
}

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6, gap: 6 },
  md: { height: 34, padding: '0 14px', fontSize: 13, borderRadius: 6, gap: 8 },
  lg: { height: 40, padding: '0 18px', fontSize: 14, borderRadius: 8, gap: 8 },
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(180deg, var(--accent-strong), var(--accent))',
    color: 'var(--text-on-accent)',
    fontWeight: 700,
    border: '1px solid var(--border-focus)',
    boxShadow: '0 10px 24px var(--accent-glow)',
  },
  secondary: {
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    fontWeight: 500,
    border: '1px solid var(--border-subtle)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontWeight: 500,
    border: '1px solid transparent',
  },
  danger: {
    background: 'rgba(225, 85, 96, 0.04)',
    color: 'var(--loss)',
    fontWeight: 500,
    border: '1px solid rgba(225, 85, 96, 0.16)',
  },
}

const variantHover: Record<Variant, string> = {
  primary: 'linear-gradient(180deg, var(--accent-hover), var(--accent))',
  secondary: 'var(--surface-3)',
  ghost: 'var(--surface-2)',
  danger: 'var(--loss-subtle)',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, disabled, iconLeft, iconRight, fullWidth, children, style, onMouseEnter, onMouseLeave, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        transition: `background var(--motion-instant) var(--ease-out), border-color var(--motion-instant) var(--ease-out), transform var(--motion-instant) var(--ease-out), box-shadow var(--motion-instant) var(--ease-out)`,
        whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : 'auto',
        ...sizeStyles[size],
        ...variantStyles[variant],
        color: variantStyles[variant].color,
        ...style,
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = variantHover[variant]
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
        onMouseEnter?.(e)
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = variantStyles[variant].background as string
        e.currentTarget.style.transform = 'translateY(0)'
        onMouseLeave?.(e)
      }}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 10 : 12} /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  )
)
Button.displayName = 'Button'

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  )
}

/* buttonVariants stub — keeps legacy shadcn imports from breaking */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const buttonVariants = (_opts?: { variant?: string; size?: string; className?: string }) => ''
