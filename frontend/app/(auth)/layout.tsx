import { BrandLogoMark } from "@/components/BrandLogoMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <aside className="app-auth-aside">
          <BrandLogoMark className="auth-brand-mark" size={42} />
          <h1 className="auth-aside-title">AlphaVyuh</h1>
          <p className="auth-aside-lead">
            A focused trading desk for EOD scanning, watchlist planning, chart review, and journal capture.
          </p>
          <div className="auth-aside-list">
            {[
              "Account-managed access",
              "EOD market data with source and freshness",
              "Broker import only; execution not enabled yet",
              "Educational workflow tool, not investment advice",
            ].map((item) => (
              <div key={item} className="auth-aside-item">
                <span className="auth-aside-bullet" />
                <span className="auth-aside-item-copy">{item}</span>
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
