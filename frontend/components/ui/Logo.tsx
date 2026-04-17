import React from 'react'

interface LogoMarkProps {
  size?: number
  onDark?: boolean
}

export function LogoMark({ size = 28, onDark = false }: LogoMarkProps) {
  const w = size * 1.4
  const h = size
  const lineColor = onDark ? '#5b63f5' : '#5b63f5'

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 70 50"
      fill="none"
      aria-label="AlphaVyuh logo mark"
    >
      <polyline
        points="2,6 26,44 36,28 66,6"
        stroke={lineColor}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="66" cy="6" r="4.5" fill="#26a65b" />
    </svg>
  )
}

interface LogoFullProps {
  onDark?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function LogoFull({ onDark = false, size = 'md' }: LogoFullProps) {
  const sizes = { sm: 14, md: 22, lg: 28 }
  const textColor = onDark ? '#ffffff' : '#0f0f0e'
  const accentColor = onDark ? '#818cf8' : '#5b63f5'
  const fs = { sm: 13, md: 16, lg: 20 }[size]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <LogoMark size={sizes[size]} onDark={onDark} />
      <span style={{
        fontSize: fs,
        fontWeight: 700,
        letterSpacing: '-0.4px',
        color: textColor,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Alpha<span style={{ color: accentColor }}>Vyuh</span>
      </span>
    </div>
  )
}

export function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#0f0f0e" />
      <polyline
        points="4,6 13,24 17,16 28,6"
        stroke="#5b63f5"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="28" cy="6" r="2.5" fill="#26a65b" />
    </svg>
  )
}

export default LogoFull
