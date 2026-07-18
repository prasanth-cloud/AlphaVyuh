'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getBrokerStatus,
  getJournalEntries,
  getJournalStats,
  getMarketSnapshot,
  getMe,
  getRecentAlertMatches,
  getWorkflowStates,
  getWatchlists,
  listAlerts,
  prefetchCandles,
  updateMe,
  type DataHealth,
  type MarketOverview,
  type ScanAlertMatch,
} from '@/lib/api'
import { DashboardActionBrief } from '@/components/dashboard/DashboardActionBrief'
import { MarketOverviewDesk } from '@/components/dashboard/MarketOverviewDesk'
import { EmptyState } from '@/components/ui'
import { buildDashboardPrioritySymbols, type DashboardPrioritySymbol } from '@/lib/dashboard-action-brief'
import { markAppTiming } from '@/lib/performance'
import { describeMarketDataError } from '@/lib/data-errors'
import {
  captureAccountData,
  setupBlockingAccountIssues,
  uniqueAccountIssues,
  type AccountDataIssue,
} from '@/lib/account-data-status'
import { getWatchlistChartRequest } from '@/lib/watchlist-chart-range'
import { isCompletedProcessReview } from '@/lib/journal-weekly-review'
import { FirstRunBanner } from '@/components/FirstRunBanner'

const WORKFLOW_STATE_SYMBOL_BATCH_SIZE = 200

async function getWorkflowStatesForSymbols(symbols: string[]) {
  const states: Awaited<ReturnType<typeof getWorkflowStates>> = []
  for (let index = 0; index < symbols.length; index += WORKFLOW_STATE_SYMBOL_BATCH_SIZE) {
    states.push(...await getWorkflowStates({ symbols: symbols.slice(index, index + WORKFLOW_STATE_SYMBOL_BATCH_SIZE) }))
  }
  return states
}

function Skeleton() {
  return (
    <div className="dashboard-decision-skeleton" aria-label="Loading dashboard">
      <div />
      <div />
      <div />
    </div>
  )
}

type WorkflowState = {
  watchlists: number
  trackedSymbols: number
  openTrades: number
  brokerConnected: boolean
  brokerName: string | null
  brokerStatusLabel: string | null
  brokerLastSyncedAt: string | null
  closedTrades: number
  reviewedTrades: number
  knownUnreviewedTrades: number
  reviewCoveragePartial: boolean
  scanAlerts: number
  alertMatchSymbols: number
  watchlistReviewDue: number
  accountIssues: AccountDataIssue[]
  alertIssues: AccountDataIssue[]
  prioritySymbols: DashboardPrioritySymbol[]
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

const initialWorkflow: WorkflowState = {
  watchlists: 0,
  trackedSymbols: 0,
  openTrades: 0,
  brokerConnected: false,
  brokerName: null,
  brokerStatusLabel: null,
  brokerLastSyncedAt: null,
  closedTrades: 0,
  reviewedTrades: 0,
  knownUnreviewedTrades: 0,
  reviewCoveragePartial: false,
  scanAlerts: 0,
  alertMatchSymbols: 0,
  watchlistReviewDue: 0,
  accountIssues: [],
  alertIssues: [],
  prioritySymbols: [],
}

export default function DashboardPage() {
  const [data, setData] = useState<MarketOverview | null>(null)
  const prefetchedPriorityChartsRef = useRef('')
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workflow, setWorkflow] = useState<WorkflowState>(initialWorkflow)

  const loadMarket = useCallback(async () => {
    try {
      const snapshot = await getMarketSnapshot()
      setError('')
      setData(snapshot.overview)
      setDataHealth(snapshot.health)
      markAppTiming('market-overview-loaded')
    } catch (e) {
      setError(describeMarketDataError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const hydrateWorkflow = useCallback(async () => {
    const [watchlistsResult, journalResult, statsResult, brokerResult, alertsResult, alertMatchesResult, me] = await Promise.all([
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
    ])

    const watchlists = watchlistsResult.data ?? []
    const journal = journalResult.data ?? { entries: [], total: 0 }
    const stats = statsResult.data
    const broker = brokerResult.data ?? {
      connected: false,
      broker: null,
      status_label: 'Broker status unavailable',
      token_expired: false,
      last_synced_at: null,
      plan_allows_broker: null,
    }
    const alertIssues = uniqueAccountIssues([alertsResult.issue, alertMatchesResult.issue])

    const trackedSymbols = watchlists.reduce((total, watchlist) => total + (watchlist.items?.length ?? 0), 0)
    const trackedSymbolSet = new Set<string>()
    for (const watchlist of watchlists) {
      for (const item of watchlist.items ?? []) {
        if (item.symbol) trackedSymbolSet.add(item.symbol.toUpperCase())
      }
    }
    const workflowStatesResult = trackedSymbolSet.size
      ? await captureAccountData(
          getWorkflowStatesForSymbols(Array.from(trackedSymbolSet)),
          { id: 'watchlists', label: 'Workflow context', href: '/watchlist' },
          'Workflow context is temporarily unavailable.',
        )
      : { data: [], issue: null }
    const workflowStates = workflowStatesResult.data ?? []
    const accountIssues = setupBlockingAccountIssues(uniqueAccountIssues([
      watchlistsResult.issue,
      journalResult.issue,
      statsResult.issue,
      brokerResult.issue,
      workflowStatesResult.issue,
    ]))
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
    const reviewedClosedTradesInSample = journal.entries.filter(entry => entry.status === 'closed' && isCompletedProcessReview(entry)).length
    const knownUnreviewedTrades = Math.max(0, closedTradesInSample - reviewedClosedTradesInSample)
    const reviewCoveragePartial = journal.entries.length < journal.total || closedTrades > closedTradesInSample
    const activeScanAlerts = (alertsResult.data ?? []).filter(alert => alert.is_active)
    const recentMatches = (alertMatchesResult.data ?? []) as ScanAlertMatch[]
    const alertSymbolSet = new Set<string>()
    for (const match of recentMatches) {
      for (const row of match.symbols ?? []) alertSymbolSet.add(row.symbol)
    }

    const nextWorkflow: WorkflowState = {
      watchlists: watchlists.length,
      trackedSymbols,
      openTrades: stats?.open_trades ?? openTradesInSample,
      brokerConnected: Boolean(broker.connected),
      brokerName: broker.broker,
      brokerStatusLabel: broker.status_label ?? null,
      brokerLastSyncedAt: broker.last_synced_at ?? null,
      closedTrades,
      reviewedTrades: reviewedClosedTradesInSample,
      knownUnreviewedTrades,
      reviewCoveragePartial,
      scanAlerts: activeScanAlerts.length,
      alertMatchSymbols: alertSymbolSet.size,
      watchlistReviewDue,
      accountIssues,
      alertIssues,
      prioritySymbols,
    }
    setWorkflow(nextWorkflow)

    const onboardingComplete = accountIssues.length === 0
      && nextWorkflow.watchlists > 0
      && nextWorkflow.trackedSymbols > 0
      && nextWorkflow.brokerConnected
      && nextWorkflow.closedTrades >= 3

    if (onboardingComplete && me && !me.onboarding_completed) {
      try {
        await updateMe({ onboarding_completed: true })
      } catch {
        // Profile sync is not required to keep the dashboard useful.
      }
    }
    markAppTiming('dashboard-background-hydration-complete')
  }, [])

  useEffect(() => {
    const cancelInitialHydration = scheduleDashboardBackgroundHydration(() => {
      void hydrateWorkflow()
    })
    const workflowRefresh = window.setInterval(() => void hydrateWorkflow(), 5 * 60 * 1000)
    return () => {
      cancelInitialHydration()
      window.clearInterval(workflowRefresh)
    }
  }, [hydrateWorkflow])

  useEffect(() => {
    window.requestAnimationFrame(() => markAppTiming('dashboard-shell-paint'))
    void loadMarket()
    const marketRefresh = window.setInterval(() => void loadMarket(), 5 * 60 * 1000)
    return () => window.clearInterval(marketRefresh)
  }, [loadMarket])

  const priorityChartSymbolsKey = workflow.prioritySymbols.slice(0, 2).map(item => item.symbol).join(',')

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
      workflow.prioritySymbols.slice(0, 2).forEach((item) => prefetchCandles(item.symbol, params))
      markAppTiming('dashboard-priority-chart-prefetch')
    })
  }, [priorityChartSymbolsKey, workflow.prioritySymbols])

  return (
    <div className="dashboard-decision-page">
      {error && (
        <div className="dashboard-refresh-warning" role="status">
          <span>{data ? `Showing the last loaded market snapshot. ${error}` : error}</span>
          <button onClick={loadMarket}>Retry</button>
          <a href="/data">Data status</a>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data ? (
        <>
          <FirstRunBanner />
          <MarketOverviewDesk data={data} dataHealth={dataHealth} marketError={error} />
          <DashboardActionBrief
            tradeDate={data.trade_date}
            marketPhase={data.market_phase}
            marketDataStatus={dataHealth?.status ?? null}
            marketDataMode={dataHealth?.mode ?? data.source_metadata?.mode ?? null}
            marketRefreshFailed={Boolean(error)}
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
          />
        </>
      ) : !loading ? (
        <EmptyState
          title="Market overview is temporarily unavailable"
          description="Check Data Status before planning trades, or retry after the market data API is restored."
          action={{ label: 'Retry', onClick: loadMarket }}
        />
      ) : null}
    </div>
  )
}
