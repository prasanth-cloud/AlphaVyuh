'use client'

import { useEffect, useState } from 'react'
import { getMarketOverview, getWatchlists, type MarketOverview } from '@/lib/api'
import { Card, StatCard, EmptyState } from '@/components/ui'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="label" style={{ marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function PhaseCard({ data }: { data: MarketOverview }) {
  const phase = data.market_phase
  const phaseColor = phase === 'Bullish' ? 'var(--gain)'
                   : phase === 'Bearish' ? 'var(--loss)'
                   : 'var(--warn)'
  return (
    <Card padding="md" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: phaseColor, flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="heading-card" style={{ color: phaseColor }}>{phase} market</span>
            <span className="caption">{data.market_phase_desc}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Metric label="A/D ratio" value={data.advance_decline_ratio?.toFixed(2) ?? '—'} />
          <Metric label="% above EMA 200" value={`${data.above_ema200_pct ?? '—'}%`} />
          <span className="caption">EOD {data.trade_date}</span>
        </div>
      </div>
    </Card>
  )
}

function SectorBar({ sector, breadth_pct, avg_pct_change }: { sector: string; breadth_pct: number; avg_pct_change: number }) {
  const color = breadth_pct > 60 ? 'var(--gain)' : breadth_pct > 40 ? 'var(--warn)' : 'var(--loss)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: '0 0 120px', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sector}
      </span>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, breadth_pct)}%`, background: color, transition: 'width 600ms var(--ease-out)' }} />
      </div>
      <span className="mono" style={{ flex: '0 0 40px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
        {breadth_pct.toFixed(0)}%
      </span>
      <span className="mono" style={{ flex: '0 0 52px', textAlign: 'right', fontSize: 11, color: avg_pct_change >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
        {avg_pct_change >= 0 ? '+' : ''}{avg_pct_change}%
      </span>
    </div>
  )
}

function MoversCard({ title, items, variant }: { title: string; items: MarketOverview['top_gainers']; variant: 'gain' | 'loss' }) {
  const color = variant === 'gain' ? 'var(--gain)' : 'var(--loss)'
  return (
    <Card padding="md">
      <h2 className="heading-card" style={{ marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.slice(0, 5).map(item => (
          <a key={item.symbol} href={`/watchlist?symbol=${item.symbol}`}
             style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.symbol}</div>
              <div className="caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{item.company_name}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                ₹{item.close.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className="mono" style={{ fontSize: 11, fontWeight: 600, color }}>
                {item.pct_change >= 0 ? '+' : ''}{item.pct_change?.toFixed(2)}%
              </div>
            </div>
          </a>
        ))}
      </div>
    </Card>
  )
}

function EmaBreadthCard({ data }: { data: MarketOverview }) {
  const items = [
    { label: 'Above EMA 20', pct: data.above_ema20_pct },
    { label: 'Above EMA 50', pct: data.above_ema50_pct },
    { label: 'Above EMA 200', pct: data.above_ema200_pct },
  ]
  return (
    <Card padding="md">
      <h2 className="heading-card" style={{ marginBottom: 12 }}>EMA breadth</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(e => {
          const color = (e.pct ?? 0) > 60 ? 'var(--gain)' : (e.pct ?? 0) > 40 ? 'var(--warn)' : 'var(--loss)'
          return (
            <div key={e.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.label}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 500, color }}>{e.pct ?? '—'}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, e.pct ?? 0)}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Skeleton() {
  return (
    <div style={{ padding: '20px 32px' }}>
      <div style={{ height: 56, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 80, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div style={{ height: 320, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
        <div style={{ height: 320, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  async function load() {
    try {
      const d = await getMarketOverview()
      setData(d)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    getWatchlists().then(wls => { if (wls.length === 0) setShowOnboarding(true) }).catch(() => {})
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: 'var(--surface-0)', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 className="heading-page">Markets</h1>
          {lastUpdated && (
            <span className="caption">
              Last updated {lastUpdated}
              <span style={{ color: 'var(--accent)', marginLeft: 6 }}>●</span>
            </span>
          )}
        </div>
        <p className="body-secondary">NSE breadth and sector rotation{data?.trade_date ? ` · ${data.trade_date}` : ''}</p>
      </div>

      {/* Onboarding banner */}
      {showOnboarding && (
        <div style={{ margin: '16px 32px 0', padding: '14px 20px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-muted)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>Welcome to AlphaVyuh</div>
            <div className="caption">Scan for stocks, add to watchlist, chart them, then log your first trade</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16, flexShrink: 0 }}>
            <a href="/scanner" style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: '#0A1712', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              Start scanning
            </a>
            <button onClick={() => setShowOnboarding(false)} style={{ color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '16px 32px 0', padding: '10px 16px', background: 'var(--loss-subtle)', border: '1px solid rgba(225,85,96,0.2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--loss)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {error}
          <button onClick={load} style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data && (
        <div style={{ padding: '20px 32px' }}>
          {/* Phase card */}
          <PhaseCard data={data} />

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard
              label="Advances"
              value={data.advances.toLocaleString()}
              delta={`of ${data.total} stocks`}
              deltaVariant="gain"
            />
            <StatCard
              label="Declines"
              value={data.declines.toLocaleString()}
              delta={`A/D ${data.advance_decline_ratio}`}
              deltaVariant="loss"
            />
            <StatCard
              label="New 52W highs"
              value={String(data.new_52w_highs)}
              deltaVariant="gain"
            />
            <StatCard
              label="New 52W lows"
              value={String(data.new_52w_lows)}
              deltaVariant="loss"
            />
          </div>

          {/* Two-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* Left: sector breadth */}
            <Card padding="lg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <h2 className="heading-card">Sector breadth</h2>
                <span className="caption">% above EMA 20 · avg chg%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.sector_breadth.map(s => (
                  <SectorBar key={s.sector} sector={s.sector} breadth_pct={s.breadth_pct} avg_pct_change={s.avg_pct_change} />
                ))}
              </div>
            </Card>

            {/* Right: movers + EMA breadth */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MoversCard title="Top gainers" items={data.top_gainers} variant="gain" />
              <MoversCard title="Top losers" items={data.top_losers} variant="loss" />
              <EmaBreadthCard data={data} />
            </div>
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ padding: '20px 32px' }}>
          <EmptyState
            title="No market data available"
            description="Market data loads after the trading session closes (after 3:30 PM IST)."
            action={{ label: 'Retry', onClick: load }}
          />
        </div>
      )}
    </div>
  )
}
