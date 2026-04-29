export default function ScannerLoading() {
  return (
    <div className="workspace-page">
      <div className="workspace-card" style={{ height: 66, marginBottom: 16 }} />
      <div className="workspace-card" style={{ height: 58, marginBottom: 16 }} />
      <div className="workspace-grid" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
        <div className="workspace-card workspace-card-muted" style={{ height: 620 }} />
        <div className="workspace-card" style={{ minHeight: 620 }}>
          <div className="workspace-toolbar" style={{ minHeight: 64 }} />
          <div style={{ display: "grid", gap: 8, padding: 16 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} style={{ height: 44, borderRadius: 10, background: "rgba(255,255,255,0.035)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
