'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  getAiPatterns,
  getBrokerStatus,
  getJournalEntries,
  getJournalStats,
  getMarketSnapshot,
  getMe,
  getRecentAlertMatches,
  getWorkflowStates,
  listAlerts,
  getWatchlists,
  updateMe,
  type AiPatterns,
  type DataHealth,
  type MarketOverview,
  type ScanAlertMatch,
} from '@/lib/api'
import { Card, StatCard, EmptyState, Button, DataProvenanceBadge, Num } from '@/components/ui'
import { markAppTiming } from '@/lib/performance'
import { describeMarketDataError } from '@/lib/data-errors'
import { captureAccountData, setupBlockingAccountIssues, uniqueAccountIssues, type AccountDataIssue } from '@/lib/account-data-status'
import { getMarketPanelEmptyCopy } from '@/lib/data-health-copy'
import { WORKFLOW_FLOW_CAPTION } from '@/lib/workflow-placement'
import { getDashboardSessionFocus } from '@/lib/dashboard-session'

const WORKFLOW_STATE_SYMBOL_BATCH_SIZE = 200;

async function getWorkflowStatesForSymbols(symbols: string[]) {
  const states: Awaited<ReturnType<typeof getWorkflowStates>> = [];
  for (let index = 0; index < symbols.length; index += WORKFLOW_STATE_SYMBOL_BATCH_SIZE) {
    states.push(...await getWorkflowStates({ symbols: symbols.slice(index, index + WORKFLOW_STATE_SYMBOL_BATCH_SIZE) }));
  }
  return states;
}

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatPercent(value: unknown, digits = 0): string {
  const numeric = safeNumber(value, NaN)
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}%` : '—'
}

const humanLabelStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0,
  textTransform: 'none',
}

function breadthLabel(phase: string): string {
  if (phase === 'Bullish') return 'Bullish breadth'
  if (phase === 'Bearish') return 'Weak breadth'
  return 'Mixed breadth'
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
      detail: leadingSector ? `${safeNumber(leadingSector.breadth_pct).toFixed(0)}% advancing · ${safeNumber(leadingSector.avg_pct_change) >= 0 ? '+' : ''}${safeNumber(leadingSector.avg_pct_change).toFixed(2)}% avg` : 'Waiting for latest market data',
      color: leadingSector ? (safeNumber(leadingSector.avg_pct_change) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--text-tertiary)',
    },
  ];

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-market-pulse">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Market pulse</div>
          <div className="caption">One glance summary of the latest market snapshot.</div>
        </div>
        <div data-testid="dashboard-data-trust" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data.source_metadata?.coverage_pct != null && (
            <span className="workspace-pill" title={`${data.source_metadata.symbols_count ?? data.total} symbols included`}>
              NSE universe · <Num>{safeNumber(data.source_metadata.coverage_pct).toFixed(0)}%</Num>
            </span>
          )}
          <DataProvenanceBadge
            kind={dataHealth?.mode === 'demo' ? 'demo' : dataHealth?.status === 'degraded' || dataHealth?.status === 'stale' ? 'fallback' : data.is_live ? 'live-provider' : 'eod'}
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
                  <Num style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {close != null && Number.isFinite(close) ? close.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'Pending'}
                  </Num>
                  <Num style={{ fontSize: 12, fontWeight: 700, color: idx.pct_change == null ? 'var(--text-tertiary)' : tone }}>
                    {pct != null && Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '-'}
                  </Num>
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
            <Num style={{ fontSize: 15, fontWeight: 700, color: card.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.value}
            </Num>
            <div className="caption" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.detail}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SectorBar({
  sector,
  advances,
  total,
  breadth_pct,
  avg_pct_change,
  above_ema20_pct,
}: {
  sector: string
  advances?: number
  total?: number
  breadth_pct: number
  avg_pct_change: number
  above_ema20_pct?: number | null
}) {
  const breadth = safeNumber(breadth_pct)
  const avg = safeNumber(avg_pct_change)
  const ema20 = above_ema20_pct == null ? null : safeNumber(above_ema20_pct)
  const color = breadth > 60 ? 'var(--gain)' : breadth > 40 ? 'var(--warn)' : 'var(--loss)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: '0 0 120px', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sector}
      </span>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, breadth)}%`, background: color, transition: 'width 600ms var(--ease-out)' }} />
      </div>
      <span className="mono" title={advances != null && total != null ? `${advances} advancing of ${total}` : undefined} style={{ flex: '0 0 58px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
        {breadth.toFixed(0)}%
      </span>
      <span className="mono" style={{ flex: '0 0 52px', textAlign: 'right', fontSize: 11, color: avg >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
        {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
      </span>
      <span className="mono" style={{ flex: '0 0 44px', textAlign: 'right', fontSize: 11, color: 'var(--text-tertiary)' }}>
        {ema20 == null ? '—' : `${ema20.toFixed(0)}%`}
      </span>
    </div>
  )
}

function MoversCard({
  title,
  items,
  variant,
  dataHealth,
  marketError,
  hasSessionDate,
}: {
  title: string
  items: MarketOverview['top_gainers']
  variant: 'gain' | 'loss'
  dataHealth: DataHealth | null
  marketError: string
  hasSessionDate: boolean
}) {
  const color = variant === 'gain' ? 'var(--gain)' : 'var(--loss)'
  const safeItems = Array.isArray(items) ? items : []
  const emptyCopy = getMarketPanelEmptyCopy({
    panel: 'movers',
    dataHealth,
    marketError,
    hasSessionDate,
  })
  return (
    <Card padding="md">
      <h2 className="heading-card" style={{ marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {safeItems.length === 0 ? (
          <div
            className="caption"
            data-testid={emptyCopy.testId}
            style={{ padding: '8px 0', color: emptyCopy.tone === 'warn' ? 'var(--warn)' : undefined, lineHeight: 1.55 }}
          >
            {emptyCopy.message}
          </div>
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
  openTrades: number
  brokerConnected: boolean
  brokerName: string | null
  brokerStatusLabel: string | null
  brokerLastSyncedAt: string | null
  closedTrades: number
  reviewedTrades: number
  scanAlerts: number
  alertMatchSymbols: number
  watchlistReviewDue: number
  onboardingCompleted: boolean
  patterns: AiPatterns | null
  accountIssues: AccountDataIssue[]
  alertIssues: AccountDataIssue[]
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

function AccountDataStatusCard({ issues }: { issues: AccountDataIssue[] }) {
  if (issues.length === 0) return null

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-account-data-status">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div className="label" style={{ color: 'var(--warn)', marginBottom: 6 }}>Account data unavailable</div>
          <div className="body-secondary" style={{ marginBottom: 10 }}>
            Dashboard workflow counts are paused until account data services respond. Existing watchlists, journal entries, and broker state are not being treated as empty.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {issues.map((issue) => (
              <span key={issue.id} className="workspace-pill" title={issue.message}>
                {issue.label}
              </span>
            ))}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { window.location.href = '/data' }}>
          Open Data Status
        </Button>
      </div>
    </Card>
  )
}

function DashboardCockpit({
  workflow,
  data,
  dataHealth,
}: {
  workflow: WorkflowState
  data: MarketOverview
  dataHealth: DataHealth | null
}) {
  const journalIssue = workflow.accountIssues.find(issue => issue.id === 'journal')
  const watchlistIssue = workflow.accountIssues.find(issue => issue.id === 'watchlists')
  const reviewDue = Math.max(0, workflow.closedTrades - workflow.reviewedTrades)
  const reviewValue = journalIssue
    ? 'Paused'
    : workflow.closedTrades < 3
      ? `${Math.max(0, 3 - workflow.closedTrades)} to unlock`
      : reviewDue > 0
        ? `${reviewDue} due`
        : 'Clear'
  const reviewDetail = journalIssue
    ? 'Journal status is unavailable; existing trades are not counted as empty.'
    : workflow.closedTrades < 3
      ? 'Close 3 trades to make review patterns useful.'
      : reviewDue > 0
        ? 'Start with review notes before adding new ideas.'
        : 'Closed trades in the current sample have review notes.'

  const dataStatus = dataHealth?.status === 'healthy'
    ? 'Ready'
    : dataHealth?.status === 'stale'
      ? 'Stale'
      : dataHealth?.status === 'degraded'
        ? 'Check'
        : dataHealth?.mode === 'demo'
          ? 'Demo'
          : 'Pending'

  const alertsIssue = workflow.alertIssues.find(issue => issue.id === 'alerts')
  const brokerIssue = workflow.accountIssues.find(issue => issue.id === 'broker')
  const brokerValue = brokerIssue
    ? 'Paused'
    : workflow.brokerConnected
      ? 'Ready'
      : workflow.brokerStatusLabel?.toLowerCase().includes('expired')
        ? 'Token expired'
        : 'Not connected'

  const cards = [
    {
      label: 'Market/data status',
      value: dataStatus,
      detail: data.trade_date ? `Latest market snapshot ${data.trade_date}.` : 'Waiting for market snapshot date.',
      href: '/data',
      action: 'Open data status',
      tone: dataStatus === 'Ready' ? 'var(--gain)' : dataStatus === 'Stale' || dataStatus === 'Check' ? 'var(--warn)' : 'var(--text-secondary)',
    },
    {
      label: 'Scan alert matches',
      value: alertsIssue ? 'Paused' : workflow.alertMatchSymbols > 0 ? `${workflow.alertMatchSymbols} symbols` : workflow.scanAlerts > 0 ? 'Waiting EOD' : 'No alerts',
      detail: alertsIssue
        ? 'Saved scan matches are not being counted as empty.'
        : workflow.alertMatchSymbols > 0
          ? 'Recent saved-scan matches are ready for review.'
          : workflow.scanAlerts > 0
            ? `${workflow.scanAlerts} saved scan${workflow.scanAlerts === 1 ? '' : 's'} waiting for the next completed session.`
            : 'Create a saved scan alert from Scanner.',
      href: '/alerts',
      action: 'Open scanner alerts',
      tone: alertsIssue ? 'var(--warn)' : workflow.alertMatchSymbols > 0 ? 'var(--accent)' : 'var(--text-secondary)',
    },
    {
      label: 'Watchlist review',
      value: watchlistIssue ? 'Paused' : workflow.watchlistReviewDue > 0 ? `${workflow.watchlistReviewDue} due` : 'Clear',
      detail: watchlistIssue
        ? 'Watchlist review counts wait for service recovery.'
        : workflow.watchlistReviewDue > 0
          ? 'Symbols without notes or with review-later state need context.'
          : workflow.trackedSymbols > 0
            ? 'Watchlist symbols have review context in this sample.'
            : 'Create one focused queue before scanning broadly.',
      href: '/watchlist',
      action: 'Open watchlist queue',
      tone: watchlistIssue ? 'var(--warn)' : workflow.watchlistReviewDue > 0 ? 'var(--accent)' : 'var(--gain)',
    },
    {
      label: 'Journal review debt',
      value: reviewValue,
      detail: reviewDetail,
      href: '/journal?review=needs-review',
      action: 'Open journal review',
      tone: journalIssue ? 'var(--warn)' : reviewDue > 0 || workflow.closedTrades < 3 ? 'var(--accent)' : 'var(--gain)',
    },
    {
      label: 'Broker import status',
      value: brokerValue,
      detail: brokerIssue
        ? 'Broker import state cannot be confirmed right now.'
        : workflow.brokerConnected
          ? `${workflow.brokerName ?? 'Broker'} connected read-only for import.`
          : 'Broker import is optional; journal capture still works.',
      href: '/settings/broker',
      action: 'Open broker settings',
      tone: brokerIssue ? 'var(--warn)' : workflow.brokerConnected ? 'var(--gain)' : 'var(--text-secondary)',
    },
  ]

  const session = getDashboardSessionFocus({
    accountIssues: workflow.accountIssues,
    alertIssues: workflow.alertIssues,
    closedTrades: workflow.closedTrades,
    reviewedTrades: workflow.reviewedTrades,
    watchlistReviewDue: workflow.watchlistReviewDue,
    alertMatchSymbols: workflow.alertMatchSymbols,
    scanAlerts: workflow.scanAlerts,
    trackedSymbols: workflow.trackedSymbols,
    watchlists: workflow.watchlists,
  })
  const streakToneColor = session.streakTone === 'gain'
    ? 'var(--gain)'
    : session.streakTone === 'warn'
      ? 'var(--warn)'
      : session.streakTone === 'accent'
        ? 'var(--accent)'
        : 'var(--text-secondary)'

  return (
    <div className="workspace-hero" style={{ marginBottom: 16 }} data-testid="dashboard-cockpit">
      <div data-testid="dashboard-workflow-command-center">
        <div className="workspace-hero-grid" style={{ marginBottom: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="label" style={{ marginBottom: 6, color: 'var(--accent)' }}>Session summary</div>
            <h1 className="workspace-title" style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginBottom: 8 }} data-testid="dashboard-session-headline">
              {session.headline}
            </h1>
            <p className="workspace-copy" style={{ marginTop: 0, fontSize: 13 }}>{session.detail}</p>
            <div className="workspace-flow" style={{ marginTop: 14 }}>
              <span className="flow-chip flow-chip-active">Dashboard</span>
              <span className="flow-chip">{WORKFLOW_FLOW_CAPTION}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            <a
              href={session.primaryHref}
              data-testid="dashboard-session-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 18px',
                borderRadius: 999,
                background: 'var(--accent)',
                color: 'var(--text-on-accent)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {session.primaryLabel}
            </a>
            <div
              data-testid="dashboard-review-streak"
              style={{
                minWidth: 168,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'rgba(255,255,255,0.03)',
                textAlign: 'right',
              }}
            >
              <div className="label" style={{ marginBottom: 4 }}>{session.streakLabel}</div>
              <Num style={{ display: 'block', fontSize: 18, fontWeight: 600, color: streakToneColor }}>{session.streakValue}</Num>
              <div className="caption" style={{ marginTop: 4, lineHeight: 1.45 }}>{session.streakDetail}</div>
            </div>
          </div>
        </div>
        <div className="dashboard-today-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {cards.map(card => (
            <a
              key={card.label}
              href={card.href}
              style={{
                display: 'block',
                minHeight: 86,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-2)',
                textDecoration: 'none',
              }}
            >
              <div style={{ ...humanLabelStyle, marginBottom: 7 }}>{card.label}</div>
              <Num style={{ display: 'block', fontSize: 15, fontWeight: 600, color: card.tone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.value}
              </Num>
              <div className="caption" style={{ marginTop: 5, lineHeight: 1.45 }}>{card.detail}</div>
              <div className="caption" style={{ marginTop: 8, color: 'var(--accent)' }}>{card.action}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
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
  const watchlistIssue = workflow.accountIssues.find(issue => issue.id === 'watchlists')
  const journalIssue = workflow.accountIssues.find(issue => issue.id === 'journal')
  const brokerIssue = workflow.accountIssues.find(issue => issue.id === 'broker')
  const steps = [
    {
      label: watchlistIssue ? 'Watchlist data unavailable' : 'Create your first watchlist',
      description: watchlistIssue ? 'Open Data Status before changing lists; saved watchlists are not being counted as empty.' : 'This becomes the bridge from scans to charts.',
      completed: !watchlistIssue && workflow.watchlists > 0,
    },
    {
      label: 'Add at least one symbol',
      description: watchlistIssue ? 'Symbol counts will resume after the watchlist service responds.' : 'Use the scanner or type a symbol directly into the watchlist desk.',
      completed: !watchlistIssue && workflow.trackedSymbols > 0,
    },
    {
      label: brokerIssue ? 'Broker status unavailable' : 'Connect your broker',
      description: brokerIssue
        ? 'Broker import state cannot be confirmed right now.'
        : workflow.brokerConnected
        ? `${workflow.brokerName ?? 'Broker'} connected for read-only import and journal sync.`
        : 'Optional; broker connections are read-only/import only.',
      completed: !brokerIssue && workflow.brokerConnected,
    },
    {
      label: journalIssue ? 'Journal data unavailable' : 'Log your first trade',
      description: journalIssue ? 'Journal counts are paused until the service responds.' : 'Once a trade exists, AlphaVyuh can start carrying context into the journal.',
      completed: !journalIssue && workflow.totalTrades > 0,
    },
    {
      label: 'Close 3 trades for review',
      description: journalIssue ? 'Review readiness cannot be computed while journal data is unavailable.' : 'That is enough history to unlock journal-wide coaching.',
      completed: !journalIssue && workflow.closedTrades >= 3,
    },
  ]

  const completedCount = steps.filter(step => step.completed).length
  const allComplete = completedCount === steps.length

  const nextAction = workflow.accountIssues.length > 0
    ? { label: 'Open Data Status', href: '/data' }
    : workflow.watchlists === 0
    ? { label: 'Create watchlist', href: '/watchlist' }
    : workflow.trackedSymbols === 0
      ? { label: 'Find symbols', href: '/scanner' }
      : !workflow.brokerConnected
        ? { label: 'Connect broker', href: '/settings/broker' }
        : workflow.closedTrades === 0
          ? { label: 'Log first trade', href: '/journal' }
          : workflow.closedTrades < 3
            ? { label: 'Build review base', href: '/journal' }
            : { label: 'Open pattern review', href: '/journal?tab=ai' }

  if ((dismissed || allComplete) && workflow.accountIssues.length === 0) return null

  return (
    <Card padding="md" style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ ...humanLabelStyle, color: 'var(--accent)' }}>Setup progress</div>
            <span className="workspace-pill">
              <Num>{completedCount}</Num>/<Num>{steps.length}</Num> done
            </span>
          </div>
          <div className="body-secondary" style={{ marginBottom: 10 }}>
            Next: {steps.find(step => !step.completed)?.label ?? nextAction.label}
          </div>
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${(completedCount / steps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), #8ef3e2)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onDismiss} aria-label="Dismiss setup progress" style={{ color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}>×</button>
        <Button variant="primary" size="sm" onClick={() => { window.location.href = nextAction.href }}>
          {nextAction.label}
        </Button>
        </div>
      </div>
    </Card>
  )
}

function ReviewPulseCard({
  workflow,
}: {
  workflow: WorkflowState
}) {
  const journalIssue = workflow.accountIssues.find(issue => issue.id === 'journal')
  if (journalIssue) {
    return (
      <Card padding="md">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h2 className="heading-card">Review pulse</h2>
          <a href="/data" className="caption" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Data status</a>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="label" style={{ marginBottom: 4, color: 'var(--warn)' }}>Journal data unavailable</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Closed trade and review coverage are paused until journal data responds. Existing trades are not being counted as zero.
          </div>
        </div>
      </Card>
    )
  }

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

export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const dataRef = useRef<MarketOverview | null>(null)
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checklistDismissed, setChecklistDismissed] = useState(false)
  const [workflow, setWorkflow] = useState<WorkflowState>({
    watchlists: 0,
    trackedSymbols: 0,
    totalTrades: 0,
    openTrades: 0,
    brokerConnected: false,
    brokerName: null,
    brokerStatusLabel: null,
    brokerLastSyncedAt: null,
    closedTrades: 0,
    reviewedTrades: 0,
    scanAlerts: 0,
    alertMatchSymbols: 0,
    watchlistReviewDue: 0,
    onboardingCompleted: false,
    patterns: null,
    accountIssues: [],
    alertIssues: [],
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
          })
          .catch(() => {})
        return
      }
      dataRef.current = snapshot.overview
      setData(snapshot.overview)
      setDataHealth(snapshot.health)
      markAppTiming('market-overview-loaded')
      writeDashboardSnapshotCache(snapshot.overview, snapshot.health)
    } catch (e) {
      setError(describeMarketDataError(e))
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
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      Promise.all([
        captureAccountData(
          getWatchlists({ lite: true }),
          { id: 'watchlists', label: 'Watchlists', href: '/watchlist' },
          'Watchlist data is temporarily unavailable.',
        ),
        captureAccountData(
          getJournalEntries({ limit: 75 }),
          { id: 'journal', label: 'Journal entries', href: '/journal' },
          'Journal entries are temporarily unavailable.',
        ),
        captureAccountData(
          getJournalStats(),
          { id: 'journal', label: 'Journal stats', href: '/journal' },
          'Journal stats are temporarily unavailable.',
        ),
        captureAccountData(
          getBrokerStatus(),
          { id: 'broker', label: 'Broker status', href: '/settings/broker' },
          'Broker status is temporarily unavailable.',
        ),
        captureAccountData(
          listAlerts(),
          { id: 'alerts', label: 'Scan alerts', href: '/alerts' },
          'Scan alerts are temporarily unavailable.',
        ),
        captureAccountData(
          getRecentAlertMatches(),
          { id: 'alerts', label: 'Scan alert matches', href: '/alerts' },
          'Recent scan alert matches are temporarily unavailable.',
        ),
        getMe().catch(() => null),
      ]).then(async ([watchlistsResult, journalResult, statsResult, brokerResult, alertsResult, alertMatchesResult, me]) => {
        const watchlists = watchlistsResult.data ?? []
        const journal = journalResult.data ?? { entries: [], total: 0 }
        const stats = statsResult.data
        const broker = brokerResult.data ?? {
          connected: false,
          broker: null,
          mode: 'unavailable',
          status: 'not_connected' as const,
          status_label: 'Broker status unavailable',
          has_api_key: false,
          has_token: false,
          token_expired: false,
          connected_at: null,
          token_expires_at: null,
          read_only: false,
          can_import: false,
          sync_status: 'idle' as const,
          last_synced_at: null,
        }
        const accountIssues = setupBlockingAccountIssues(uniqueAccountIssues([
          watchlistsResult.issue,
          journalResult.issue,
          statsResult.issue,
          brokerResult.issue,
        ]))
        const alertIssues = uniqueAccountIssues([
          alertsResult.issue,
          alertMatchesResult.issue,
        ])
        const trackedSymbols = watchlists.reduce((total, watchlist) => total + (watchlist.items?.length ?? 0), 0)
        const trackedSymbolSet = new Set<string>()
        for (const watchlist of watchlists) {
          for (const item of watchlist.items ?? []) {
            if (item.symbol) trackedSymbolSet.add(item.symbol.toUpperCase())
          }
        }
        const workflowStates = trackedSymbolSet.size
          ? await getWorkflowStatesForSymbols(Array.from(trackedSymbolSet))
          : []
        const reviewLaterSymbols = new Set(
          workflowStates
            .filter(state => state.review_later || state.lifecycle === 'review_later')
            .map(state => state.symbol.toUpperCase()),
        )
        const watchlistReviewDue = watchlists.reduce((total, watchlist) => (
          total + (watchlist.items ?? []).filter(item => !item.note?.trim() || reviewLaterSymbols.has(item.symbol.toUpperCase())).length
        ), 0)
        const closedTradesInSample = journal.entries.filter(entry => entry.status === 'closed').length
        const openTradesInSample = journal.entries.filter(entry => entry.status === 'open').length
        const closedTrades = Math.max(closedTradesInSample, stats?.total_trades ?? 0)
        const reviewedTrades = journal.entries.filter(entry => entry.status === 'closed' && Boolean(entry.lessons?.trim())).length
        const activeScanAlerts = (alertsResult.data ?? []).filter(alert => alert.is_active)
        const alertSymbolSet = new Set<string>()
        for (const match of (alertMatchesResult.data ?? []) as ScanAlertMatch[]) {
          for (const row of match.symbols ?? []) alertSymbolSet.add(row.symbol)
        }
        const nextWorkflow: WorkflowState = {
          watchlists: watchlists.length,
          trackedSymbols,
          totalTrades: stats?.total_trades ?? journal.entries.length,
          openTrades: stats?.open_trades ?? openTradesInSample,
          brokerConnected: Boolean(broker.connected),
          brokerName: broker.broker,
          brokerStatusLabel: broker.status_label ?? null,
          brokerLastSyncedAt: broker.last_synced_at ?? null,
          closedTrades,
          reviewedTrades,
          scanAlerts: activeScanAlerts.length,
          alertMatchSymbols: alertSymbolSet.size,
          watchlistReviewDue,
          onboardingCompleted: Boolean(me?.onboarding_completed),
          patterns: null,
          accountIssues,
          alertIssues,
        }
        setWorkflow(nextWorkflow)

        if (closedTrades >= 3 && !accountIssues.some(issue => issue.id === 'journal')) {
          getAiPatterns()
            .then((patterns) => {
              setWorkflow(current => ({ ...current, patterns: patterns as AiPatterns | null }))
              markAppTiming('dashboard-ai-coaching-loaded')
            })
            .catch(() => {})
        }

        const allComplete = accountIssues.length === 0
          && nextWorkflow.watchlists > 0
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
      {/* Error */}
      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--loss-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--loss)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 320px' }}>{error}</span>
          <button onClick={load} style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Retry</button>
          <a href="/data" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Data status</a>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data && (
        <div>
          <DashboardCockpit workflow={workflow} data={data} dataHealth={dataHealth} />

          <AccountDataStatusCard issues={uniqueAccountIssues([...workflow.accountIssues, ...workflow.alertIssues])} />

          <WorkflowChecklistCard
            workflow={workflow}
            dismissed={checklistDismissed}
            onDismiss={() => {
              setChecklistDismissed(true)
              if (typeof window !== 'undefined') window.localStorage.setItem('alphavyuh-onboarding-dismissed', '1')
            }}
          />

          <Card padding="md" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>Next actions</h2>
                <div className="caption">Follow the loop: review, plan, discover, then come back to Journal.</div>
              </div>
            </div>
            <div className="dashboard-action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {[
                { label: 'Open journal review', detail: 'Start with closed trades, lessons, and process drift.', href: '/journal?review=needs-review' },
                { label: 'Open watchlist', detail: 'Pick the next symbol and continue the Decision Desk.', href: '/watchlist' },
                { label: 'Discover setups', detail: 'Use Scanner when the current queue needs fresh ideas.', href: '/scanner' },
                { label: 'Import trades', detail: 'Bring in contract notes or broker reports for review.', href: '/upload' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'block',
                    minHeight: 68,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-2)',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{item.label}</div>
                  <div className="caption" style={{ lineHeight: 1.5 }}>{item.detail}</div>
                </a>
              ))}
            </div>
          </Card>

          <MarketPulsePanel data={data} dataHealth={dataHealth} />

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
                <a href="/data" className="caption" style={{ color: 'var(--text-tertiary)', textDecoration: 'none' }}>
                  Data Status
                </a>
              </div>
              <div className="caption" style={{ marginTop: -10, marginBottom: 14 }}>
                Advancers · avg chg · above EMA20
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(!Array.isArray(data.sector_breadth) || data.sector_breadth.length === 0) ? (() => {
                  const emptyCopy = getMarketPanelEmptyCopy({
                    panel: 'sector-breadth',
                    dataHealth,
                    marketError: error,
                    hasSessionDate: Boolean(data.trade_date),
                  })
                  return (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <div
                      className="caption"
                      data-testid={emptyCopy.testId}
                      style={{ color: emptyCopy.tone === 'warn' ? 'var(--warn)' : undefined, lineHeight: 1.55 }}
                    >
                      {emptyCopy.message}
                    </div>
                  </div>
                  )
                })() : (
                  data.sector_breadth.map(s => (
                    <SectorBar
                      key={s.sector}
                      sector={s.sector}
                      advances={s.advances}
                      total={s.total}
                      breadth_pct={s.advance_breadth_pct ?? s.breadth_pct}
                      avg_pct_change={s.avg_pct_change}
                      above_ema20_pct={s.above_ema20_pct}
                    />
                  ))
                )}
              </div>
            </Card>

            {/* Right: movers + EMA breadth */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ReviewPulseCard workflow={workflow} />
              <MoversCard title="Top gainers" items={data.top_gainers} variant="gain" dataHealth={dataHealth} marketError={error} hasSessionDate={Boolean(data.trade_date)} />
              <MoversCard title="Top losers" items={data.top_losers} variant="loss" dataHealth={dataHealth} marketError={error} hasSessionDate={Boolean(data.trade_date)} />
              <EmaBreadthCard data={data} />
            </div>
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div>
          <EmptyState
            title="Market data is not connected"
            description="Dashboard needs the backend data API to load the latest EOD snapshot. Open Data status or retry after the API is restored."
            action={{ label: 'Retry', onClick: load }}
          />
        </div>
      )}
    </div>
  )
}
