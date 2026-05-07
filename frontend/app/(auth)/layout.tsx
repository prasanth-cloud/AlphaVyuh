export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <aside className="app-auth-aside">
          <div className="auth-kicker">Launch Surface</div>
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 58px)', lineHeight: 1.02, letterSpacing: '-0.04em', maxWidth: 420 }}>
            Build an EOD trading workflow in one dark, focused workspace.
          </h1>
          <p style={{ marginTop: 18, maxWidth: 420, fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            Scan the latest completed session, move names into watchlists, review charts, and let your journal turn every simulated or imported trade into feedback.
          </p>
          <div style={{ marginTop: 36, display: 'grid', gap: 12, maxWidth: 360 }}>
            {[
              'Scanner, charts, watchlists, broker import, and journal in one flow',
              'Same cinematic trading aesthetic as the landing page',
              'Private beta: EOD data, educational workflow, execution disabled',
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
