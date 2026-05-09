export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <aside className="app-auth-aside">
          <div className="auth-brand-mark" aria-hidden="true">A</div>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.05, letterSpacing: '-0.035em', maxWidth: 420 }}>
            AlphaVyuh
          </h1>
          <p style={{ marginTop: 14, maxWidth: 420, fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            A private beta trading desk for market scanning, watchlist planning, chart review, and journal feedback.
          </p>
          <div style={{ marginTop: 26, display: 'grid', gap: 10, maxWidth: 380 }}>
            {[
              'Private beta access',
              'Market data with source and freshness',
              'Broker import only; execution disabled',
              'Educational workflow tool, not investment advice',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 6px rgba(86, 215, 193, 0.10)' }} />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className="app-auth-panel">
          <div className="app-auth-card">{children}</div>
        </div>
      </div>
    </div>
  );
}
