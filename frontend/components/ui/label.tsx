'use client'
import React from 'react'

export function Label({ children, style, ...rest }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
        userSelect: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </label>
  )
}
