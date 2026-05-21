import React from 'react'

export function DataTable({
  children,
  className,
  style,
  tableStyle,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  tableStyle?: React.CSSProperties
}) {
  return (
    <div className={className} style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      overflowX: 'auto',
      overflowY: 'hidden',
      background: 'var(--surface-1)',
      minWidth: 0,
      maxWidth: '100%',
      ...style,
    }}>
      <table style={{ width: '100%', minWidth: 'max-content', borderCollapse: 'collapse', ...tableStyle }}>
        {children}
      </table>
    </div>
  )
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead style={{ background: 'var(--surface-2)' }}>
      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {children}
      </tr>
    </thead>
  )
}

export function Th({ children, align = 'left', width }: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
}) {
  return (
    <th style={{
      padding: '10px 14px',
      fontSize: 10, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--text-tertiary)',
      textAlign: align,
      whiteSpace: 'nowrap',
      width,
    }}>
      {children}
    </th>
  )
}

export function Tr({ children, onClick, onDoubleClick, onKeyDown, tabIndex, selected }: {
  children: React.ReactNode
  onClick?: () => void
  onDoubleClick?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLTableRowElement>
  tabIndex?: number
  selected?: boolean
}) {
  return (
    <tr
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: selected ? 'var(--accent-subtle)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--motion-instant) var(--ease-out)',
      }}
      onMouseEnter={onClick ? e => {
        if (!selected) e.currentTarget.style.background = 'var(--surface-2)'
      } : undefined}
      onMouseLeave={onClick ? e => {
        if (!selected) e.currentTarget.style.background = 'transparent'
      } : undefined}
    >
      {children}
    </tr>
  )
}

export function Td({ children, align = 'left', mono, emphasized }: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  emphasized?: boolean
}) {
  return (
    <td style={{
      padding: '11px 14px',
      fontSize: 13,
      color: emphasized ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontWeight: emphasized ? 500 : 400,
      textAlign: align,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  )
}
