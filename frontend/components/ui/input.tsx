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
        background: 'var(--surface-2)',
        border: `1px solid ${error ? 'var(--loss)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        height: size === 'sm' ? 30 : 36,
        padding: '0 12px',
        transition: 'border-color var(--motion-instant) var(--ease-out)',
      }}>
        {iconLeft && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{iconLeft}</span>}
        <input
          ref={ref}
          style={{
            flex: 1, height: '100%',
            fontSize: size === 'sm' ? 12 : 13,
            color: 'var(--text-primary)',
            background: 'transparent', border: 'none', outline: 'none',
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
