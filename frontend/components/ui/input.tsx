'use client'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  iconLeft?: React.ReactNode
  size?: 'sm' | 'md'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, iconLeft, size = 'md', style, className, ...rest }, ref) => {
    void className // consumed to prevent passing to inner input
    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span className="label">{label}</span>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), var(--surface-2)',
        border: `1px solid ${error ? 'var(--loss)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: '12px',
        height: size === 'sm' ? 34 : 42,
        padding: '0 12px',
        transition: 'border-color var(--motion-instant) var(--ease-out), box-shadow var(--motion-instant) var(--ease-out)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        {iconLeft && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{iconLeft}</span>}
        <input
          suppressHydrationWarning
          ref={ref}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            height: '100%',
            fontSize: size === 'sm' ? 12 : 13,
            color: 'var(--text-primary)',
            backgroundColor: 'transparent',
            borderWidth: 0,
            outlineStyle: 'none',
            ...style,
          }}
          {...rest}
        />
      </div>
      {hint && !error && <span className="caption">{hint}</span>}
      {error && <span style={{ fontSize: 11, color: 'var(--loss)' }}>{error}</span>}
    </div>
  )}
)
Input.displayName = 'Input'
