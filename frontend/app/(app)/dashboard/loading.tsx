export default function DashboardLoading() {
  return (
    <div className="workspace-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="workspace-card" style={{ height: 44 }} />
      <div className="workspace-card" style={{ height: 74 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="workspace-card" style={{ height: 112 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div className="workspace-card" style={{ height: 420 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="workspace-card" style={{ height: 160 }} />
          <div className="workspace-card" style={{ height: 220 }} />
        </div>
      </div>
    </div>
  );
}
