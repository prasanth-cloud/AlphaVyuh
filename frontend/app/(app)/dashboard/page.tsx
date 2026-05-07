'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAiPatterns,
  getBrokerStatus,
  getJournalEntries,
  getJournalStats,
  getMarketSnapshot,
  getMe,
  getWatchlists,
  updateMe,
  type AiPatterns,
  type DataHealth,
  type JournalEntry,
  type MarketOverview,
} from '@/lib/api'
import { Card, StatCard, EmptyState, Button, DataProvenanceBadge } from '@/components/ui'
import DataFreshnessStrip from '@/components/DataFreshnessStrip'
import { markAppTiming } from '@/lib/performance'

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

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatPercent(value: unknown, digits = 0): string {
  const numeric = safeNumber(value, NaN)
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}%` : '—'
}

function breadthLabel(phase: string): string {
  if (phase === 'Bullish') return 'Bullish breadth'
  if (phase === 'Bearish') return 'Weak breadth'
  return 'Mixed breadth'
}

function PhaseCard({ data, dataHealth }: { data: MarketOverview; dataHealth: DataHealth | null }) {
  const phase = data.market_phase
  const phaseColor = phase === 'Bullish' ? 'var(--gain)'
                   : phase === 'Bearish' ? 'var(--loss)'
                   : 'var(--warn)'
  const healthColor = dataHealth?.status === 'healthy'
    ? 'var(--gain)'
    : dataHealth?.status === 'degraded'
      ? 'var(--warn)'
      : 'var(--loss)'
  return (
    <Card padding="md" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: phaseColor, flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="heading-card" style={{ color: phaseColor }}>{breadthLabel(phase)}</span>
            <span className="caption">{data.market_phase_desc}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Metric label="A/D ratio" value={safeNumber(data.advance_decline_ratio).toFixed(2)} />
          <Metric label="% above EMA 200" value={formatPercent(data.above_ema200_pct)} />
          {dataHealth?.status && (
            <Metric label="Data" value={dataHealth.status.toUpperCase()} />
          )}
          <DataProvenanceBadge
            kind={dataHealth?.mode === 'demo' ? 'demo' : dataHealth?.status === 'degraded' || dataHealth?.status === 'stale' ? 'fallback' : 'eod'}
            asOf={data.trade_date}
            compact
          />
        </div>
      </div>
      {dataHealth && dataHealth.status !== 'healthy' && (
        <div style={{ marginTop: 12, fontSize: 12, color: healthColor }}>
          {dataHealth.status === 'degraded'
            ? `Market data is usable but incomplete on the newest ingest. AlphaVyuh is falling back to the latest complete day.`
            : `Market data is stale. Refresh checks are overdue, so some quotes may lag until the next ingest run.`}
        </div>
      )}
    </Card>
  )
}

function MarketPulsePanel({ data, dataHealth }: { data: MarketOverview; dataHealth: DataHealth | null }) {
  const phase = data.market_phase;
  const phaseColor = phase === 'Bullish' ? 'var(--gain)'
                   : phase === 'Bearish' ? 'var(--loss)'
                   : 'var(--warn)';
  const leadingSector = data.sector_breadth?.[0] ?? null;
  const breadthTone = data.advances >= data.declines ? 'var(--gain)' : 'var(--loss)';
  const trendTone = data.above_ema200_pct >= 60 ? 'var(--gain)'
                  : data.above_ema200_pct <= 40 ? 'var(--loss)'
                  : 'var(--warn)';

  const cards = [
    {
      label: 'Market breadth',
      value: breadthLabel(phase),
      detail: data.market_phase_desc,
      color: phaseColor,
    },
    {
      label: 'Breadth',
      value: `${safeNumber(data.advances).toLocaleString()} / ${safeNumber(data.declines).toLocaleString()}`,
      detail: `A/D ${safeNumber(data.advance_decline_ratio).toFixed(2)}`,
      color: breadthTone,
    },
    {
      label: 'Trend',
      value: formatPercent(data.above_ema200_pct),
      detail: 'Stocks above EMA 200',
      color: trendTone,
    },
    {
      label: 'Leadership',
      value: leadingSector?.sector ?? 'Pending',
      detail: leadingSector ? `${safeNumber(leadingSector.breadth_pct).toFixed(0)}% breadth · ${safeNumber(leadingSector.avg_pct_change) >= 0 ? '+' : ''}${safeNumber(leadingSector.avg_pct_change).toFixed(2)}% avg` : 'Sector breadth loads after market close',
      color: leadingSector ? (safeNumber(leadingSector.avg_pct_change) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--text-tertiary)',
    },
  ];

  return (
    <Card padding="md" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Market pulse</div>
          <div className="caption">One glance summary before scanning, charting, or placing alerts.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data.market_data_source && (
            <span className="caption">{data.is_live ? 'Index live' : 'Index fallback'} · {data.market_data_source}</span>
          )}
          <DataProvenanceBadge
            kind={dataHealth?.mode === 'demo' ? 'demo' : dataHealth?.status === 'degraded' || dataHealth?.status === 'stale' ? 'fallback' : data.is_live ? 'live-beta' : 'eod'}
            asOf={data.trade_date}
            compact
          />
        </div>
      </div>
      {!!data.indices?.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
          {data.indices.map((idx) => {
            const pct = idx.pct_change == null ? null : safeNumber(idx.pct_change, NaN);
            const close = idx.close == null ? null : safeNumber(idx.close, NaN);
            const tone = (pct ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)';
            return (
              <div key={idx.symbol} style={{ minWidth: 0, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.018)' }}>
                <div className="label" style={{ marginBottom: 4 }}>{idx.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {close != null && Number.isFinite(close) ? close.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'Pending'}
                  </span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: idx.pct_change == null ? 'var(--text-tertiary)' : tone }}>
                    {pct != null && Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '-'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              minWidth: 0,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
              background: 'rgba(255,255,255,0.025)',
            }}
          >
            <div className="label" style={{ marginBottom: 6 }}>{card.label}</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: card.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.value}
            </div>
            <div className="caption" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.detail}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SectorBar({ sector, breadth_pct, avg_pct_change }: { sector: string; breadth_pct: number; avg_pct_change: number }) {
  const breadth = safeNumber(breadth_pct)
  const avg = safeNumber(avg_pct_change)
  const color = breadth > 60 ? 'var(--gain)' : breadth > 40 ? 'var(--warn)' : 'var(--loss)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: '0 0 120px', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sector}
      </span>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, breadth)}%`, background: color, transition: 'width 600ms var(--ease-out)' }} />
      </div>
      <span className="mono" style={{ flex: '0 0 40px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
        {breadth.toFixed(0)}%
      </span>
      <span className="mono" style={{ flex: '0 0 52px', textAlign: 'right', fontSize: 11, color: avg >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
        {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
      </span>
    </div>
  )
}

function MoversCard({ title, items, variant }: { title: string; items: MarketOverview['top_gainers']; variant: 'gain' | 'loss' }) {
  const color = variant === 'gain' ? 'var(--gain)' : 'var(--loss)'
  const safeItems = Array.isArray(items) ? items : []
  return (
    <Card padding="md">
      <h2 className="heading-card" style={{ marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {safeItems.length === 0 ? (
          <div className="caption" style={{ padding: '8px 0' }}>No movers available yet.</div>
        ) : (
          safeItems.slice(0, 5).map(item => {
            const close = safeNumber(item.close, NaN)
            const pct = safeNumber(item.pct_change, NaN)
            return (
              <a key={item.symbol} href={`/watchlist?symbol=${item.symbol}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.symbol}</div>
                  <div className="caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{item.company_name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {Number.isFinite(close) ? `₹${close.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                  </div>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600, color }}>
                    {Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                  </div>
                </div>
              </a>
            )
          })
        )}
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
          const numericPct = safeNumber(e.pct, NaN)
          const hasData = Number.isFinite(numericPct)
          const color = !hasData ? 'var(--text-tertiary)' : numericPct > 60 ? 'var(--gain)' : numericPct > 40 ? 'var(--warn)' : 'var(--loss)'
          return (
            <div key={e.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.label}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 500, color }}>
                  {hasData ? `${numericPct}%` : '—'}
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: hasData ? `${Math.min(100, numericPct)}%` : '0%', background: color }} />
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

type WorkflowState = {
  watchlists: number
  trackedSymbols: number
  totalTrades: number
  brokerConnected: boolean
  brokerName: string | null
  brokerStatusLabel: string | null
  brokerLastSyncedAt: string | null
  closedTrades: number
  reviewedTrades: number
  onboardingCompleted: boolean
  patterns: AiPatterns | null
}

type ReviewPrompts = {
  needsReviewCount: number
  reviewSymbol: string | null
  reviewSymbolClosed: number
  weakSetup: string | null
  weakSetupTrades: number
  weakSetupWinRate: number | null
  latestLesson: string | null
}

const DASHBOARD_SNAPSHOT_CACHE_KEY = 'alphavyuh-dashboard-snapshot-v1'

type DashboardSnapshotCache = {
  data: MarketOverview
  dataHealth: DataHealth | null
  savedAt: number
}

function readDashboardSnapshotCache(): DashboardSnapshotCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DASHBOARD_SNAPSHOT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardSnapshotCache
    if (!parsed?.data || Date.now() - parsed.savedAt > 10 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

function writeDashboardSnapshotCache(data: MarketOverview, dataHealth: DataHealth | null) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DASHBOARD_SNAPSHOT_CACHE_KEY, JSON.stringify({ data, dataHealth, savedAt: Date.now() }))
  } catch {
    // Cache is a performance hint only.
  }
}

function WorkflowChecklistCard({
  workflow,
  dismissed,
  onDismiss,
}: {
  workflow: WorkflowState
  dismissed: boolean
  onDismiss: () => void
}) {
  const steps = [
    {
      label: 'Create your first watchlist',
      description: 'This becomes the bridge from scans to charts.',
      completed: workflow.watchlists > 0,
    },
    {
      label: 'Add at least one symbol',
      description: 'Use the scanner or type a symbol directly into the watchlist desk.',
      completed: workflow.trackedSymbols > 0,
    },
    {
      label: 'Connect your broker',
      description: workflow.brokerConnected
        ? `${workflow.brokerName ?? 'Broker'} connected for read-only import and journal sync.`
        : 'Optional for beta; broker connections are read-only/import only.',
      completed: workflow.brokerConnected,
    },
    {
      label: 'Log your first trade',
      description: 'Once a trade exists, AlphaVyuh can start carrying context into the journal.',
      completed: workflow.totalTrades > 0,
    },
    {
      label: 'Close 3 trades for review',
      description: 'That is enough history to unlock journal-wide coaching.',
      completed: workflow.closedTrades >= 3,
    },
  ]

  const completedCount = steps.filter(step => step.completed).length
  const allComplete = completedCount === steps.length

  const nextAction = workflow.watchlists === 0
    ? { label: 'Create watchlist', href: '/watchlist' }
    : workflow.trackedSymbols === 0
      ? { label: 'Find symbols', href: '/scanner' }
      : !workflow.brokerConnected
        ? { label: 'Connect broker', href: '/settings/broker' }
        : workflow.closedTrades === 0
          ? { label: 'Log first trade', href: '/journal' }
          : workflow.closedTrades < 3
            ? { label: 'Build review base', href: '/journal' }
            : { label: 'Open AI review', href: '/journal?tab=ai' }

  if (dismissed || allComplete) return null

  return (
    <Card padding="lg">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <div className="label" style={{ color: 'var(--accent)', marginBottom: 6 }}>Onboarding checklist</div>
          <h2 className="heading-card" style={{ marginBottom: 4 }}>Make the product feel connected in the first session</h2>
          <div className="body-secondary">
            Traders stay when the next step is obvious. This checklist is driven by your actual account state, not generic setup copy.
          </div>
        </div>
        <button onClick={onDismiss} style={{ color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 8, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${(completedCount / steps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), #8ef3e2)' }} />
        </div>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {completedCount}/{steps.length}
        </span>
      </div>

      <div className="dashboard-checklist-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
        {steps.map((step) => (
          <div
            key={step.label}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 11px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: step.completed ? 'var(--gain-subtle)' : 'var(--surface-2)',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: step.completed ? 'var(--gain)' : 'var(--text-tertiary)',
                background: step.completed ? 'rgba(38,166,91,0.12)' : 'var(--surface-3)',
                border: `1px solid ${step.completed ? 'rgba(38,166,91,0.18)' : 'var(--border-subtle)'}`,
              }}
            >
              {step.completed ? '✓' : '•'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.25 }}>{step.label}</div>
              <div className="caption" style={{ lineHeight: 1.55 }}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="caption">Continue with: {nextAction.label}</div>
        <Button variant="primary" size="sm" onClick={() => { window.location.href = nextAction.href }}>
          {nextAction.label}
        </Button>
      </div>
    </Card>
  )
}

function ReviewPulseCard({
  workflow,
}: {
  workflow: WorkflowState
}) {
  const reviewCoverage = workflow.closedTrades > 0
    ? Math.round((workflow.reviewedTrades / workflow.closedTrades) * 100)
    : 0

  const strongestDay = workflow.patterns?.day_of_week?.reduce((strongest, current) => {
    if (!strongest || current.win_rate > strongest.win_rate) return current
    return strongest
  }, workflow.patterns.day_of_week[0])

  const strongestDirection = workflow.patterns?.by_direction?.reduce((strongest, current) => {
    if (!strongest || current.win_rate > strongest.win_rate) return current
    return strongest
  }, workflow.patterns.by_direction[0])

  const nextAction = workflow.closedTrades < 3
    ? `${3 - workflow.closedTrades} more closed trade${3 - workflow.closedTrades === 1 ? '' : 's'} before journal-wide review has enough history.`
    : workflow.reviewedTrades < workflow.closedTrades
      ? `${workflow.closedTrades - workflow.reviewedTrades} closed trade${workflow.closedTrades - workflow.reviewedTrades === 1 ? '' : 's'} still missing review notes.`
      : 'Review coverage is complete for closed trades in the current journal sample.'

  const coachingCards = workflow.patterns?.coaching_cards?.slice(0, 3) ?? []
  const toneColor = (tone: string) => {
    if (tone === 'gain') return 'var(--gain)'
    if (tone === 'loss') return 'var(--loss)'
    if (tone === 'warn') return 'var(--warn)'
    if (tone === 'accent') return 'var(--accent)'
    return 'var(--text-primary)'
  }

  return (
    <Card padding="md">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 className="heading-card">Review pulse</h2>
        <a href="/journal?tab=ai" className="caption" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Open journal review</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Closed', value: String(workflow.closedTrades) },
          { label: 'Reviewed', value: String(workflow.reviewedTrades) },
          { label: 'Coverage', value: `${reviewCoverage}%` },
        ].map((item) => (
          <div key={item.label} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
            <div className="label" style={{ marginBottom: 4 }}>{item.label}</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 4 }}>Journal coverage</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{nextAction}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {coachingCards.map((card) => (
          <div key={card.label} style={{ padding: '9px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <span className="label">{card.label}</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: toneColor(card.tone), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.value}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{card.detail}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Strongest review signal</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {strongestDirection ? `${strongestDirection.direction} ${strongestDirection.win_rate}%` : 'Not enough closed trades'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Highest win-rate day</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {strongestDay ? `${strongestDay.day.slice(0, 3)} ${strongestDay.win_rate}%` : 'Not enough closed trades'}
          </span>
        </div>
      </div>
    </Card>
  )
}

function ReviewPromptsCard({ prompts }: { prompts: ReviewPrompts }) {
  const items = [
    prompts.needsReviewCount > 0
      ? `Review ${prompts.needsReviewCount} closed trade${prompts.needsReviewCount === 1 ? '' : 's'} still missing lessons.`
      : null,
    prompts.reviewSymbol
      ? `${prompts.reviewSymbol} has ${prompts.reviewSymbolClosed} closed trade${prompts.reviewSymbolClosed === 1 ? '' : 's'} in the journal sample.`
      : null,
    prompts.weakSetup
      ? `${prompts.weakSetup} is underperforming${prompts.weakSetupWinRate != null ? ` at ${prompts.weakSetupWinRate.toFixed(0)}% win rate` : ''}.`
      : null,
  ].filter(Boolean) as string[]

  return (
    <Card padding="md">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 className="heading-card">Review prompts</h2>
        <a href="/journal?tab=ai" className="caption" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Open review</a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {items.length > 0 ? items.map((item) => (
          <div key={item} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {item}
          </div>
        )) : (
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            No pending review notes in the current sample. Journal analytics remain available for closed-trade summaries.
          </div>
        )}
      </div>

      {prompts.latestLesson && (
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="label" style={{ marginBottom: 4 }}>Latest lesson</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {prompts.latestLesson.slice(0, 160)}{prompts.latestLesson.length > 160 ? '…' : ''}
          </div>
        </div>
      )}
    </Card>
  )
}

function deriveReviewPrompts(entries: JournalEntry[]): ReviewPrompts {
  const closed = entries.filter((entry) => entry.status === 'closed')
  const unreviewed = closed.filter((entry) => !entry.lessons?.trim())
  const reviewed = closed.filter((entry) => Boolean(entry.lessons?.trim()))

  const bySymbol = new Map<string, number>()
  const bySetup = new Map<string, { trades: number; wins: number }>()

  for (const entry of closed) {
    bySymbol.set(entry.symbol, (bySymbol.get(entry.symbol) ?? 0) + 1)
    const setup = entry.setup_type ?? 'Untagged'
    const current = bySetup.get(setup) ?? { trades: 0, wins: 0 }
    current.trades += 1
    if ((entry.pnl ?? 0) > 0) current.wins += 1
    bySetup.set(setup, current)
  }

  const reviewSymbolEntry = Array.from(bySymbol.entries()).sort((a, b) => b[1] - a[1])[0] ?? null
  const weakSetupEntry = Array.from(bySetup.entries())
    .filter(([, value]) => value.trades >= 3)
    .map(([setup, value]) => ({ setup, trades: value.trades, winRate: value.trades ? (value.wins / value.trades) * 100 : null }))
    .sort((a, b) => (a.winRate ?? 100) - (b.winRate ?? 100))[0] ?? null

  return {
    needsReviewCount: unreviewed.length,
    reviewSymbol: reviewSymbolEntry?.[0] ?? null,
    reviewSymbolClosed: reviewSymbolEntry?.[1] ?? 0,
    weakSetup: weakSetupEntry?.setup ?? null,
    weakSetupTrades: weakSetupEntry?.trades ?? 0,
    weakSetupWinRate: weakSetupEntry?.winRate ?? null,
    latestLesson: reviewed[0]?.lessons?.trim() ?? null,
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const dataRef = useRef<MarketOverview | null>(null)
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [checklistDismissed, setChecklistDismissed] = useState(false)
  const [workflow, setWorkflow] = useState<WorkflowState>({
    watchlists: 0,
    trackedSymbols: 0,
    totalTrades: 0,
      brokerConnected: false,
      brokerName: null,
      brokerStatusLabel: null,
      brokerLastSyncedAt: null,
    closedTrades: 0,
    reviewedTrades: 0,
    onboardingCompleted: false,
    patterns: null,
  })
  const [reviewPrompts, setReviewPrompts] = useState<ReviewPrompts>({
    needsReviewCount: 0,
    reviewSymbol: null,
    reviewSymbolClosed: 0,
    weakSetup: null,
    weakSetupTrades: 0,
    weakSetupWinRate: null,
    latestLesson: null,
  })

  const load = useCallback(async () => {
    setError('')
    const pendingSnapshot = getMarketSnapshot()
    try {
      const snapshot = await Promise.race([
        pendingSnapshot,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), dataRef.current ? 1800 : 900)),
      ])
      if (!snapshot) {
        if (!dataRef.current) {
          setLoading(false)
        }
        pendingSnapshot
          .then((lateSnapshot) => {
            dataRef.current = lateSnapshot.overview
            setData(lateSnapshot.overview)
            setDataHealth(lateSnapshot.health)
            writeDashboardSnapshotCache(lateSnapshot.overview, lateSnapshot.health)
            setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
          })
          .catch(() => {})
        return
      }
      dataRef.current = snapshot.overview
      setData(snapshot.overview)
      setDataHealth(snapshot.health)
      markAppTiming('market-overview-loaded')
      writeDashboardSnapshotCache(snapshot.overview, snapshot.health)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setChecklistDismissed(window.localStorage.getItem('alphavyuh-onboarding-dismissed') === '1')
    const cached = readDashboardSnapshotCache()
    if (cached) {
      dataRef.current = cached.data
      setData(cached.data)
      setDataHealth(cached.dataHealth)
      setLastUpdated('cached')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      Promise.all([
        getWatchlists({ lite: true }).catch(() => []),
        getJournalEntries({ limit: 75 }).catch(() => ({ entries: [], total: 0 })),
        getJournalStats().catch(() => null),
        getBrokerStatus().catch(() => ({
          connected: false,
          broker: null,
          mode: 'simulated',
          status: 'not_connected' as const,
          status_label: 'Broker simulated',
          has_api_key: false,
          has_token: false,
          token_expired: false,
          connected_at: null,
          token_expires_at: null,
          read_only: false,
          can_import: false,
          sync_status: 'idle' as const,
          last_synced_at: null,
        })),
        getMe().catch(() => null),
      ]).then(async ([watchlists, journal, stats, broker, me]) => {
        const trackedSymbols = watchlists.reduce((total, watchlist) => total + (watchlist.items?.length ?? 0), 0)
        const closedTradesInSample = journal.entries.filter(entry => entry.status === 'closed').length
        const closedTrades = Math.max(closedTradesInSample, stats?.total_trades ?? 0)
        const reviewedTrades = journal.entries.filter(entry => entry.status === 'closed' && Boolean(entry.lessons?.trim())).length
        const nextWorkflow: WorkflowState = {
          watchlists: watchlists.length,
          trackedSymbols,
          totalTrades: stats?.total_trades ?? journal.entries.length,
          brokerConnected: Boolean(broker.connected),
          brokerName: broker.broker,
          brokerStatusLabel: broker.status_label ?? null,
          brokerLastSyncedAt: broker.last_synced_at ?? null,
          closedTrades,
          reviewedTrades,
          onboardingCompleted: Boolean(me?.onboarding_completed),
          patterns: null,
        }
        setWorkflow(nextWorkflow)
        setReviewPrompts(deriveReviewPrompts(journal.entries))

        if (closedTrades >= 3) {
          getAiPatterns()
            .then((patterns) => {
              setWorkflow(current => ({ ...current, patterns: patterns as AiPatterns | null }))
              markAppTiming('dashboard-ai-coaching-loaded')
            })
            .catch(() => {})
        }

        const allComplete = nextWorkflow.watchlists > 0
          && nextWorkflow.trackedSymbols > 0
          && nextWorkflow.brokerConnected
          && nextWorkflow.closedTrades >= 3

        if (allComplete && me && !me.onboarding_completed) {
          try {
            await updateMe({ onboarding_completed: true })
            setWorkflow(current => ({ ...current, onboardingCompleted: true }))
          } catch {
            // Ignore profile sync failures; local product state still reflects progress.
          }
        }
        markAppTiming('dashboard-background-hydration-complete')
      })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    window.requestAnimationFrame(() => markAppTiming('dashboard-shell-paint'))
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div style={{ background: 'transparent', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status bar */}
      <div style={{ height: 44, background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>Dashboard</span>
          {data?.trade_date && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>EOD {data.trade_date}</span>
          )}
          <span style={{ fontSize: 12, color: workflow.brokerConnected ? 'var(--gain)' : 'var(--text-tertiary)' }}>
            {workflow.brokerStatusLabel ?? 'Broker simulated'}
          </span>
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Updated {lastUpdated}</span>
        )}
      </div>

      <DataFreshnessStrip health={dataHealth} tradeDate={data?.trade_date ?? null} />

      <WorkflowChecklistCard
        workflow={workflow}
        dismissed={checklistDismissed}
        onDismiss={() => {
          setChecklistDismissed(true)
          if (typeof window !== 'undefined') window.localStorage.setItem('alphavyuh-onboarding-dismissed', '1')
        }}
      />

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--loss-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--loss)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {error}
          <button onClick={load} style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data && (
        <div>
          <MarketPulsePanel data={data} dataHealth={dataHealth} />

          {/* Phase card */}
          <PhaseCard data={data} dataHealth={dataHealth} />

          <Card padding="lg" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>Continue your workflow</h2>
                <div className="caption">Open a workspace, import trade history, or review journal analytics.</div>
              </div>
            </div>
            <div className="dashboard-action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {[
                { label: 'Open scanner', detail: 'Run user-defined filters on market data.', href: '/scanner' },
                { label: 'Open watchlist', detail: 'Organize symbols, notes, charts, and order entry.', href: '/watchlist' },
                { label: 'Open journal', detail: 'Review closed trades and performance history.', href: '/journal' },
                { label: 'Upload trade report', detail: 'Import CSV, contract notes, or screenshots.', href: '/upload' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'block',
                    minHeight: 96,
                    padding: '14px 15px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-2)',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{item.label}</div>
                  <div className="caption" style={{ lineHeight: 1.5 }}>{item.detail}</div>
                </a>
              ))}
            </div>
          </Card>

          {/* Stat cards */}
          <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard
              label="Advances"
              value={safeNumber(data.advances).toLocaleString()}
              delta={`of ${safeNumber(data.total).toLocaleString()} stocks`}
              deltaVariant="gain"
            />
            <StatCard
              label="Declines"
              value={safeNumber(data.declines).toLocaleString()}
              delta={`A/D ${safeNumber(data.advance_decline_ratio).toFixed(2)}`}
              deltaVariant="loss"
            />
            <StatCard
              label="New 52W highs"
              value={String(safeNumber(data.new_52w_highs))}
              deltaVariant="gain"
            />
            <StatCard
              label="New 52W lows"
              value={String(safeNumber(data.new_52w_lows))}
              deltaVariant="loss"
            />
          </div>

          {/* Two-column grid */}
          <div className="dashboard-main-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* Left: sector breadth */}
            <Card padding="lg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <h2 className="heading-card">Sector breadth</h2>
                <span className="caption">% above EMA 20 · avg chg%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(!Array.isArray(data.sector_breadth) || data.sector_breadth.length === 0) ? (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <div className="caption">No sector data yet — loads after market close</div>
                  </div>
                ) : (
                  data.sector_breadth.map(s => (
                    <SectorBar key={s.sector} sector={s.sector} breadth_pct={s.breadth_pct} avg_pct_change={s.avg_pct_change} />
                  ))
                )}
              </div>
            </Card>

            {/* Right: movers + EMA breadth */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ReviewPulseCard workflow={workflow} />
              <ReviewPromptsCard prompts={reviewPrompts} />
              <MoversCard title="Top gainers" items={data.top_gainers} variant="gain" />
              <MoversCard title="Top losers" items={data.top_losers} variant="loss" />
              <EmaBreadthCard data={data} />
            </div>
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div>
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
