export function StatCard({ label, value, delta, deltaVariant }: {
  label: string
  value: string | number
  delta?: string
  deltaVariant?: 'gain' | 'loss' | 'neutral'
}) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(86,215,193,0.08), rgba(86,215,193,0.02) 30%, rgba(255,255,255,0.02)), var(--surface-1)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '18px',
      padding: '16px 18px',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), var(--shadow-glow)',
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
