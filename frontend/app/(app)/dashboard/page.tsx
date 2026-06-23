'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  getAiPatterns,
  getBrokerOrderActivity,
  getBrokerStatus,
  getJournalAnalytics,
  getJournalEntries,
  getJournalStats,
  getMarketSnapshot,
  getMe,
  prefetchCandles,
  getRecentAlertMatches,
  getPriceAlerts,
  getWorkflowStates,
  listAlerts,
  getWatchlists,
  updateMe,
  type AiPatterns,
  type BrokerOrderActivityItem,
  type DataHealth,
  type JournalAnalytics,
  type JournalEntry,
  type JournalStats,
  type MarketOverview,
  type PriceAlert,
  type ScanAlertMatch,
  type WorkflowState as ApiWorkflowState,
} from '@/lib/api'
import { DashboardActionBrief } from '@/components/dashboard/DashboardActionBrief'
import { DashboardAlertPlanner } from '@/components/dashboard/DashboardAlertPlanner'
import { DashboardBrokerFlightStatus } from '@/components/dashboard/DashboardBrokerFlightStatus'
import { DashboardChartWorkbench } from '@/components/dashboard/DashboardChartWorkbench'
import { DashboardSessionAgenda } from '@/components/dashboard/DashboardSessionAgenda'
import { DashboardWorkspaceSwitcher } from '@/components/dashboard/DashboardWorkspaceSwitcher'
import { MarketOverviewDesk } from '@/components/dashboard/MarketOverviewDesk'
import { EmptyState } from '@/components/ui'
import { buildDashboardPrioritySymbols, type DashboardPrioritySymbol } from '@/lib/dashboard-action-brief'
import {
  getDashboardWorkspaceSections,
  normalizeDashboardWorkspaceView,
  type DashboardWorkspaceView,
} from '@/lib/dashboard-workspace-view'
import { markAppTiming } from '@/lib/performance'
import { describeMarketDataError } from '@/lib/data-errors'
import { captureAccountData, setupBlockingAccountIssues, uniqueAccountIssues, type AccountDataIssue } from '@/lib/account-data-status'
import { getWatchlistChartRequest } from '@/lib/watchlist-chart-range'

const DashboardDataConfidence = dynamic(() => import('@/components/dashboard/DashboardDataConfidence').then(module => module.DashboardDataConfidence))
const DashboardWorkflowFunnel = dynamic(() => import('@/components/dashboard/DashboardWorkflowFunnel').then(module => module.DashboardWorkflowFunnel))
const DashboardScannerEffectiveness = dynamic(() => import('@/components/dashboard/DashboardScannerEffectiveness').then(module => module.DashboardScannerEffectiveness))
const DashboardValidationLab = dynamic(() => import('@/components/dashboard/DashboardValidationLab').then(module => module.DashboardValidationLab))
const DashboardEventRadar = dynamic(() => import('@/components/dashboard/DashboardEventRadar').then(module => module.DashboardEventRadar))
const DashboardDisciplineChecklist = dynamic(() => import('@/components/dashboard/DashboardDisciplineChecklist').then(module => module.DashboardDisciplineChecklist))
const DashboardRiskControl = dynamic(() => import('@/components/dashboard/DashboardRiskControl').then(module => module.DashboardRiskControl))
const DashboardJournalEdge = dynamic(() => import('@/components/dashboard/DashboardJournalEdge').then(module => module.DashboardJournalEdge))
const DashboardPerformanceCoach = dynamic(() => import('@/components/dashboard/DashboardPerformanceCoach').then(module => module.DashboardPerformanceCoach))
const DashboardImportReconciliation = dynamic(() => import('@/components/dashboard/DashboardImportReconciliation').then(module => module.DashboardImportReconciliation))
const DashboardEquitySnapshotCard = dynamic(() => import('@/components/dashboard/DashboardEquitySnapshot').then(module => module.DashboardEquitySnapshotCard))

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
  brokerCanImport: boolean
  brokerSyncStatus: string | null
  brokerTokenExpired: boolean
  brokerPlanAllows: boolean | null
  brokerReadOnly: boolean | null
  closedTrades: number
  reviewedTrades: number
  knownUnreviewedTrades: number
  reviewCoveragePartial: boolean
  journalEntries: JournalEntry[]
  workflowStates: ApiWorkflowState[]
  scanAlerts: number
  alertMatchSymbols: number
  priceAlerts: number
  triggeredPriceAlerts: number
  latestScanRunDate: string | null
  latestScanAlertName: string | null
  latestScanMatchCount: number | null
  topAlertSymbols: { symbol: string; href: string }[]
  watchlistReviewDue: number
  onboardingCompleted: boolean
  patterns: AiPatterns | null
  brokerOrders: BrokerOrderActivityItem[]
  brokerActivityUnavailable: boolean
  accountIssues: AccountDataIssue[]
  alertIssues: AccountDataIssue[]
  prioritySymbols: DashboardPrioritySymbol[]
}

const DASHBOARD_SNAPSHOT_CACHE_KEY = 'alphavyuh-dashboard-snapshot-v1'
const DASHBOARD_WORKSPACE_VIEW_KEY = 'alphavyuh-dashboard-workspace-view-v1'

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

function readDashboardWorkspaceView(): DashboardWorkspaceView {
  if (typeof window === 'undefined') return 'session'
  try {
    return normalizeDashboardWorkspaceView(window.localStorage.getItem(DASHBOARD_WORKSPACE_VIEW_KEY))
  } catch {
    return 'session'
  }
}

type DashboardIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function scheduleDashboardBackgroundHydration(callback: () => void) {
  if (typeof window === 'undefined') return () => {}

  let cancelled = false
  const run = () => {
    if (!cancelled) callback()
  }
  const idleWindow = window as DashboardIdleWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(run, { timeout: 900 })
    return () => {
      cancelled = true
      idleWindow.cancelIdleCallback?.(handle)
    }
  }

  const handle = window.setTimeout(run, 250)
  return () => {
    cancelled = true
    window.clearTimeout(handle)
  }
}


export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const dataRef = useRef<MarketOverview | null>(null)
  const prefetchedPriorityChartsRef = useRef('')
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [journalStats, setJournalStats] = useState<JournalStats | null>(null)
  const [journalAnalytics, setJournalAnalytics] = useState<JournalAnalytics | null>(null)
  const [journalEquityUnavailable, setJournalEquityUnavailable] = useState<string | null>(null)
  const [dashboardView, setDashboardView] = useState<DashboardWorkspaceView>('session')
  const [workflow, setWorkflow] = useState<WorkflowState>({
    watchlists: 0,
    trackedSymbols: 0,
    totalTrades: 0,
    openTrades: 0,
    brokerConnected: false,
    brokerName: null,
    brokerStatusLabel: null,
    brokerLastSyncedAt: null,
    brokerCanImport: false,
    brokerSyncStatus: null,
    brokerTokenExpired: false,
    brokerPlanAllows: null,
    brokerReadOnly: null,
    closedTrades: 0,
    reviewedTrades: 0,
    knownUnreviewedTrades: 0,
    reviewCoveragePartial: false,
    journalEntries: [],
    workflowStates: [],
    scanAlerts: 0,
    alertMatchSymbols: 0,
    priceAlerts: 0,
    triggeredPriceAlerts: 0,
    latestScanRunDate: null,
    latestScanAlertName: null,
    latestScanMatchCount: null,
    topAlertSymbols: [],
    watchlistReviewDue: 0,
    onboardingCompleted: false,
    patterns: null,
    brokerOrders: [],
    brokerActivityUnavailable: false,
    accountIssues: [],
    alertIssues: [],
    prioritySymbols: [],
  })
  const load = useCallback(async () => {
    setError('')
    try {
      const snapshot = await getMarketSnapshot()
      dataRef.current = snapshot.overview
      setData(snapshot.overview)
      setDataHealth(snapshot.health)
      markAppTiming('market-overview-loaded')
      writeDashboardSnapshotCache(snapshot.overview, snapshot.health)
    } catch (e) {
      if (!dataRef.current) {
        setError(describeMarketDataError(e))
      }
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
    setDashboardView(readDashboardWorkspaceView())
  }, [])

  const handleDashboardViewChange = useCallback((nextView: DashboardWorkspaceView) => {
    const normalized = normalizeDashboardWorkspaceView(nextView)
    setDashboardView(normalized)
    try {
      window.localStorage.setItem(DASHBOARD_WORKSPACE_VIEW_KEY, normalized)
    } catch {
      // View preference is local-only; ignore private browsing storage failures.
    }
  }, [])

  useEffect(() => {
    return scheduleDashboardBackgroundHydration(() => {
      void Promise.all([
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
          getBrokerOrderActivity(25),
          { id: 'broker', label: 'Broker activity', href: '/settings/broker' },
          'Broker activity is temporarily unavailable.',
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
        captureAccountData(
          getPriceAlerts(),
          { id: 'alerts', label: 'Price alerts', href: '/alerts' },
          'Price alerts are temporarily unavailable.',
        ),
        getMe().catch(() => null),
      ]).then(async ([watchlistsResult, journalResult, statsResult, analyticsResult, brokerResult, brokerActivityResult, alertsResult, alertMatchesResult, priceAlertsResult, me]) => {
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
          plan_allows_broker: null,
        }
        const accountIssues = setupBlockingAccountIssues(uniqueAccountIssues([
          watchlistsResult.issue,
          journalResult.issue,
          statsResult.issue,
          brokerResult.issue,
          brokerActivityResult.issue,
        ]))
        const alertIssues = uniqueAccountIssues([
          alertsResult.issue,
          alertMatchesResult.issue,
          priceAlertsResult.issue,
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
        const prioritySymbols = buildDashboardPrioritySymbols({
          watchlists,
          workflowStates,
          journalEntries: journal.entries,
          broker: {
            connected: Boolean(broker.connected),
            tokenExpired: Boolean(broker.token_expired),
            planAllowsBroker: broker.plan_allows_broker ?? null,
            statusError: brokerResult.issue?.message ?? null,
          },
        })
        const closedTradesInSample = journal.entries.filter(entry => entry.status === 'closed').length
        const openTradesInSample = journal.entries.filter(entry => entry.status === 'open').length
        const closedTrades = Math.max(closedTradesInSample, stats?.total_trades ?? 0)
        const reviewedClosedTradesInSample = journal.entries.filter(entry => entry.status === 'closed' && Boolean(entry.lessons?.trim())).length
        const knownUnreviewedTrades = Math.max(0, closedTradesInSample - reviewedClosedTradesInSample)
        const reviewCoveragePartial = journal.entries.length < journal.total || closedTrades > closedTradesInSample
        const reviewedTrades = reviewCoveragePartial
          ? Math.max(0, closedTrades - knownUnreviewedTrades)
          : reviewedClosedTradesInSample
        const activeScanAlerts = (alertsResult.data ?? []).filter(alert => alert.is_active)
        const activePriceAlerts = ((priceAlertsResult.data ?? []) as PriceAlert[]).filter(alert => alert.is_active)
        const triggeredPriceAlerts = activePriceAlerts.filter(alert => alert.triggered_at).length
        const alertSymbolSet = new Set<string>()
        const recentMatches = (alertMatchesResult.data ?? []) as ScanAlertMatch[]
        const latestAlertMatch = [...recentMatches].sort((a, b) => {
          const byDate = (b.run_date ?? '').localeCompare(a.run_date ?? '')
          if (byDate !== 0) return byDate
          return (b.match_count ?? 0) - (a.match_count ?? 0)
        })[0] ?? null
        for (const match of recentMatches) {
          for (const row of match.symbols ?? []) alertSymbolSet.add(row.symbol)
        }
        const topAlertSymbols = Array.from(new Set(
          (latestAlertMatch?.symbols ?? []).map(row => row.symbol.toUpperCase()).filter(Boolean),
        )).slice(0, 5).map(symbol => ({ symbol, href: `/charts/${symbol}?from=dashboard-alerts&full=1` }))
        const nextWorkflow: WorkflowState = {
          watchlists: watchlists.length,
          trackedSymbols,
          totalTrades: stats?.total_trades ?? journal.entries.length,
          openTrades: stats?.open_trades ?? openTradesInSample,
          brokerConnected: Boolean(broker.connected),
          brokerName: broker.broker,
          brokerStatusLabel: broker.status_label ?? null,
          brokerLastSyncedAt: broker.last_synced_at ?? null,
          brokerCanImport: Boolean(broker.can_import),
          brokerSyncStatus: broker.sync_status ?? null,
          brokerTokenExpired: Boolean(broker.token_expired),
          brokerPlanAllows: broker.plan_allows_broker ?? null,
          brokerReadOnly: broker.read_only ?? null,
          closedTrades,
          reviewedTrades,
          knownUnreviewedTrades,
          reviewCoveragePartial,
          journalEntries: journal.entries,
          workflowStates,
          scanAlerts: activeScanAlerts.length,
          alertMatchSymbols: alertSymbolSet.size,
          priceAlerts: activePriceAlerts.length,
          triggeredPriceAlerts,
          latestScanRunDate: latestAlertMatch?.run_date ?? null,
          latestScanAlertName: latestAlertMatch?.scan_alerts?.name ?? null,
          latestScanMatchCount: latestAlertMatch?.match_count ?? null,
          topAlertSymbols,
          watchlistReviewDue,
          onboardingCompleted: Boolean(me?.onboarding_completed),
          patterns: null,
          brokerOrders: brokerActivityResult.data?.orders ?? [],
          brokerActivityUnavailable: Boolean(brokerActivityResult.issue),
          accountIssues,
          alertIssues,
          prioritySymbols,
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
    })
  }, [])

  useEffect(() => {
    window.requestAnimationFrame(() => markAppTiming('dashboard-shell-paint'))
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [load])

  const visibleDashboardSections = getDashboardWorkspaceSections(dashboardView)
  const priorityChartSymbolsKey = workflow.prioritySymbols.slice(0, 4).map(item => item.symbol).join(',')

  useEffect(() => {
    if (!priorityChartSymbolsKey || prefetchedPriorityChartsRef.current === priorityChartSymbolsKey) return
    prefetchedPriorityChartsRef.current = priorityChartSymbolsKey

    return scheduleDashboardBackgroundHydration(() => {
      const request = getWatchlistChartRequest('3M')
      const params = {
        limit: request.limit,
        timeframe: request.timeframe,
        from_date: request.from_date,
        to_date: request.to_date,
      }
      workflow.prioritySymbols.slice(0, 4).forEach((item) => prefetchCandles(item.symbol, params))
      markAppTiming('dashboard-priority-chart-prefetch')
    })
  }, [priorityChartSymbolsKey, workflow.prioritySymbols])

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
              <DashboardWorkspaceSwitcher value={dashboardView} onChange={handleDashboardViewChange} />
              {visibleDashboardSections.has('data') && <DashboardDataConfidence
                marketDataStatus={dataHealth?.status ?? null}
                marketDataMode={dataHealth?.mode ?? data.source_metadata?.mode ?? null}
                tradeDate={data.trade_date}
                latestTradeDate={dataHealth?.latest_trade_date ?? null}
                hoursSinceRefresh={dataHealth?.hours_since_refresh ?? null}
                coveragePct={dataHealth?.coverage_pct ?? null}
                symbolsOnLatestDate={dataHealth?.symbols_on_latest_date ?? null}
                universeActive={dataHealth?.universe_active ?? null}
                fallbackActive={dataHealth?.fallback_active ?? null}
                marketError={error}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
                closedTrades={workflow.closedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                trackedSymbols={workflow.trackedSymbols}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                brokerConnected={workflow.brokerConnected}
                brokerStatusLabel={workflow.brokerStatusLabel}
                brokerLastSyncedAt={workflow.brokerLastSyncedAt}
              />}
              {visibleDashboardSections.has('action') && <DashboardActionBrief
                tradeDate={data.trade_date}
                marketPhase={data.market_phase}
                marketDataStatus={dataHealth?.status ?? null}
                marketDataMode={dataHealth?.mode ?? data.source_metadata?.mode ?? null}
                trackedSymbols={workflow.trackedSymbols}
                watchlistReviewDue={workflow.watchlistReviewDue}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                openTrades={workflow.openTrades}
                brokerConnected={workflow.brokerConnected}
                brokerName={workflow.brokerName}
                brokerStatusLabel={workflow.brokerStatusLabel}
                brokerLastSyncedAt={workflow.brokerLastSyncedAt}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
                prioritySymbols={workflow.prioritySymbols}
              />}
              {visibleDashboardSections.has('agenda') && <DashboardSessionAgenda
                accountIssues={workflow.accountIssues}
                alertIssues={workflow.alertIssues}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                watchlistReviewDue={workflow.watchlistReviewDue}
                alertMatchSymbols={workflow.alertMatchSymbols}
                scanAlerts={workflow.scanAlerts}
                trackedSymbols={workflow.trackedSymbols}
                watchlists={workflow.watchlists}
                openTrades={workflow.openTrades}
                brokerConnected={workflow.brokerConnected}
                prioritySymbols={workflow.prioritySymbols}
              />}
              {visibleDashboardSections.has('broker') && <DashboardBrokerFlightStatus
                orders={workflow.brokerOrders}
                unavailable={workflow.brokerActivityUnavailable}
              />}
              {visibleDashboardSections.has('funnel') && <DashboardWorkflowFunnel
                workflowStates={workflow.workflowStates}
                journalEntries={workflow.journalEntries}
                trackedSymbols={workflow.trackedSymbols}
                watchlists={workflow.watchlists}
                watchlistReviewDue={workflow.watchlistReviewDue}
                alertMatchSymbols={workflow.alertMatchSymbols}
                scanAlerts={workflow.scanAlerts}
                openTrades={workflow.openTrades}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
              />}
              {visibleDashboardSections.has('alerts') && <DashboardAlertPlanner
                marketDataStatus={dataHealth?.status ?? null}
                alertIssueCount={workflow.alertIssues.length}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                priceAlerts={workflow.priceAlerts}
                triggeredPriceAlerts={workflow.triggeredPriceAlerts}
                latestScanRunDate={workflow.latestScanRunDate}
                latestScanAlertName={workflow.latestScanAlertName}
                latestScanMatchCount={workflow.latestScanMatchCount}
                topAlertSymbols={workflow.topAlertSymbols}
                trackedSymbols={workflow.trackedSymbols}
                watchlistReviewDue={workflow.watchlistReviewDue}
                openTrades={workflow.openTrades}
                brokerConnected={workflow.brokerConnected}
                prioritySymbols={workflow.prioritySymbols}
              />}
              {visibleDashboardSections.has('charts') && <DashboardChartWorkbench
                marketDataStatus={dataHealth?.status ?? null}
                alertIssueCount={workflow.alertIssues.length}
                priceAlerts={workflow.priceAlerts}
                triggeredPriceAlerts={workflow.triggeredPriceAlerts}
                topAlertSymbols={workflow.topAlertSymbols}
                prioritySymbols={workflow.prioritySymbols}
                trackedSymbols={workflow.trackedSymbols}
                watchlistReviewDue={workflow.watchlistReviewDue}
                openTrades={workflow.openTrades}
              />}
              {visibleDashboardSections.has('scanner') && <DashboardScannerEffectiveness
                workflowStates={workflow.workflowStates}
                journalEntries={workflow.journalEntries}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                latestScanRunDate={workflow.latestScanRunDate}
                latestScanAlertName={workflow.latestScanAlertName}
                latestScanMatchCount={workflow.latestScanMatchCount}
                alertIssueCount={workflow.alertIssues.length}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
              />}
              {visibleDashboardSections.has('validation') && <DashboardValidationLab
                marketDataStatus={dataHealth?.status ?? null}
                workflowStates={workflow.workflowStates}
                journalEntries={workflow.journalEntries}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                latestScanRunDate={workflow.latestScanRunDate}
                latestScanAlertName={workflow.latestScanAlertName}
                latestScanMatchCount={workflow.latestScanMatchCount}
                alertIssueCount={workflow.alertIssues.length}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
              />}
              {visibleDashboardSections.has('events') && <DashboardEventRadar
                marketDataStatus={dataHealth?.status ?? null}
                marketDataMode={dataHealth?.mode ?? data.source_metadata?.mode ?? null}
                tradeDate={data.trade_date}
                latestTradeDate={dataHealth?.latest_trade_date ?? null}
                hoursSinceRefresh={dataHealth?.hours_since_refresh ?? null}
                trackedSymbols={workflow.trackedSymbols}
                watchlistReviewDue={workflow.watchlistReviewDue}
                openTrades={workflow.openTrades}
                scanAlerts={workflow.scanAlerts}
                alertMatchSymbols={workflow.alertMatchSymbols}
                priceAlerts={workflow.priceAlerts}
                triggeredPriceAlerts={workflow.triggeredPriceAlerts}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
                prioritySymbols={workflow.prioritySymbols}
              />}
              {visibleDashboardSections.has('discipline') && <DashboardDisciplineChecklist
                marketDataStatus={dataHealth?.status ?? null}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
                trackedSymbols={workflow.trackedSymbols}
                watchlistReviewDue={workflow.watchlistReviewDue}
                openTrades={workflow.openTrades}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                brokerConnected={workflow.brokerConnected}
                brokerCanImport={workflow.brokerCanImport}
                brokerTokenExpired={workflow.brokerTokenExpired}
                priceAlerts={workflow.priceAlerts}
                triggeredPriceAlerts={workflow.triggeredPriceAlerts}
              />}
              {visibleDashboardSections.has('risk') && <DashboardRiskControl
                stats={journalStats}
                analytics={journalAnalytics}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                openTrades={workflow.openTrades}
                marketDataStatus={dataHealth?.status ?? null}
                accountIssueCount={workflow.accountIssues.length}
                alertIssueCount={workflow.alertIssues.length}
                brokerConnected={workflow.brokerConnected}
              />}
              {visibleDashboardSections.has('journal') && <DashboardJournalEdge
                stats={journalStats}
                analytics={journalAnalytics}
                patterns={workflow.patterns}
                journalEntries={workflow.journalEntries}
                accountIssueCount={workflow.accountIssues.filter(issue => issue.id === 'journal').length}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                openTrades={workflow.openTrades}
                brokerConnected={workflow.brokerConnected}
              />}
              {visibleDashboardSections.has('coach') && <DashboardPerformanceCoach
                stats={journalStats}
                analytics={journalAnalytics}
                patterns={workflow.patterns}
                closedTrades={workflow.closedTrades}
                reviewedTrades={workflow.reviewedTrades}
                knownUnreviewedTrades={workflow.knownUnreviewedTrades}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
                journalIssueCount={workflow.accountIssues.filter(issue => issue.id === 'journal').length}
                brokerConnected={workflow.brokerConnected}
              />}
              {visibleDashboardSections.has('import') && <DashboardImportReconciliation
                journalEntries={workflow.journalEntries}
                totalTrades={workflow.totalTrades}
                closedTrades={workflow.closedTrades}
                openTrades={workflow.openTrades}
                brokerConnected={workflow.brokerConnected}
                brokerName={workflow.brokerName}
                brokerStatusLabel={workflow.brokerStatusLabel}
                brokerLastSyncedAt={workflow.brokerLastSyncedAt}
                brokerCanImport={workflow.brokerCanImport}
                brokerSyncStatus={workflow.brokerSyncStatus}
                brokerTokenExpired={workflow.brokerTokenExpired}
                brokerPlanAllows={workflow.brokerPlanAllows}
                brokerReadOnly={workflow.brokerReadOnly}
                accountIssueCount={workflow.accountIssues.filter(issue => issue.id === 'broker').length}
                reviewCoveragePartial={workflow.reviewCoveragePartial}
              />}
              {visibleDashboardSections.has('equity') && <DashboardEquitySnapshotCard
                stats={journalStats}
                analytics={journalAnalytics}
                closedTrades={workflow.closedTrades}
                openTrades={workflow.openTrades}
                unavailable={Boolean(journalEquityUnavailable)}
                unavailableMessage={journalEquityUnavailable ?? undefined}
              />}
            </>
          ) : !error ? (
            <EmptyState
              title="Market overview is temporarily unavailable"
              description="Market overview is temporarily unavailable. Check Data Status before planning trades, or retry after the market data API is restored."
              action={{ label: 'Retry', onClick: load }}
            />
          ) : null}

        </div>
      )}
    </div>
  )
}
