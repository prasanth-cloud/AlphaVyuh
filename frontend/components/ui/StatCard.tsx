export function StatCard({ label, value, delta, deltaVariant }: {
  label: string
  value: string | number
  delta?: string
  deltaVariant?: 'gain' | 'loss' | 'neutral'
}) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
    }}>
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 24, fontWeight: 500,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>
        {value}
      </div>
      {delta && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: deltaVariant === 'gain' ? 'var(--gain)'
               : deltaVariant === 'loss' ? 'var(--loss)'
               : 'var(--text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {delta}
        </div>
      )}
    </div>
  )
}
