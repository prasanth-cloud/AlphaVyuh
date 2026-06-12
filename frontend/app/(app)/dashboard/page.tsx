'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAiPatterns,
  getBrokerStatus,
  getJournalAnalytics,
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
  type JournalAnalytics,
  type JournalStats,
  type MarketOverview,
  type ScanAlertMatch,
} from '@/lib/api'
import { DashboardEquitySnapshotCard } from '@/components/dashboard/DashboardEquitySnapshot'
import { MarketOverviewDesk } from '@/components/dashboard/MarketOverviewDesk'
import { EmptyState } from '@/components/ui'
import { markAppTiming } from '@/lib/performance'
import { describeMarketDataError } from '@/lib/data-errors'
import { captureAccountData, setupBlockingAccountIssues, uniqueAccountIssues, type AccountDataIssue } from '@/lib/account-data-status'

const WORKFLOW_STATE_SYMBOL_BATCH_SIZE = 200;

async function getWorkflowStatesForSymbols(symbols: string[]) {
  const states: Awaited<ReturnType<typeof getWorkflowStates>> = [];
  for (let index = 0; index < symbols.length; index += WORKFLOW_STATE_SYMBOL_BATCH_SIZE) {
    states.push(...await getWorkflowStates({ symbols: symbols.slice(index, index + WORKFLOW_STATE_SYMBOL_BATCH_SIZE) }));
  }
  return states;
}

function Skeleton() {
  return (
    <div className="dashboard-market-desk" style={{ gap: 10 }}>
      <div style={{ height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {[1, 2].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 12, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ height: 180, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
        <div style={{ height: 180, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
      </div>
      <div style={{ height: 120, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }} />
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


export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const dataRef = useRef<MarketOverview | null>(null)
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [journalStats, setJournalStats] = useState<JournalStats | null>(null)
  const [journalAnalytics, setJournalAnalytics] = useState<JournalAnalytics | null>(null)
  const [journalEquityUnavailable, setJournalEquityUnavailable] = useState<string | null>(null)
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
          getJournalAnalytics(),
          { id: 'journal', label: 'Journal analytics', href: '/journal?tab=analytics' },
          'Journal analytics are temporarily unavailable.',
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
      ]).then(async ([watchlistsResult, journalResult, statsResult, analyticsResult, brokerResult, alertsResult, alertMatchesResult, me]) => {
        const watchlists = watchlistsResult.data ?? []
        const journal = journalResult.data ?? { entries: [], total: 0 }
        const stats = statsResult.data
        setJournalStats(stats ?? null)
        setJournalAnalytics(analyticsResult.issue ? null : (analyticsResult.data ?? null))
        setJournalEquityUnavailable(statsResult.issue?.message ?? null)
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

      {!loading && (
        <div>
          {data ? (
            <>
              <MarketOverviewDesk data={data} dataHealth={dataHealth} marketError={error} />
              <DashboardEquitySnapshotCard
                stats={journalStats}
                analytics={journalAnalytics}
                closedTrades={workflow.closedTrades}
                openTrades={workflow.openTrades}
                unavailable={Boolean(journalEquityUnavailable)}
                unavailableMessage={journalEquityUnavailable ?? undefined}
              />
            </>
          ) : !error ? (
            <EmptyState
              title="Market data is not connected"
              description="Dashboard needs the market data API to load breadth and sector stats. Open Data status or retry after the API is restored."
              action={{ label: 'Retry', onClick: load }}
            />
          ) : null}

        </div>
      )}
    </div>
  )
}
