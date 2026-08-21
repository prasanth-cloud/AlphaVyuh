'use client'
import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  addToWatchlist as addSymbolToWatchlist,
  authHeaders,
  bulkUpsertWorkflowStates,
  createAlert,
  createFeedbackReport,
  createWatchlist,
  deleteScreen as deleteSavedScreen,
  deleteScannerDefinition,
  getScreens as getCachedScreens,
  getScannerDefinitions,
  getWatchlists as getCachedWatchlists,
  prefetchCandles,
  saveScreen as saveSavedScreen,
  shouldUseMockFallback as scannerUsesClientMockFallback,
  getPlanStatus,
  type SavedScreen,
  type ScannerDefinition,
} from '@/lib/api'
import { mockRunScan } from '@/lib/mock-data'
import { composeScannerResults, type ScannerCompositionMode } from '@/lib/scanner-composition'
import { scannerWatchlistPatch, scannerWatchlistPatches, scannerWorkflowPatch, selectedScannerSymbols } from '@/lib/scanner-workflow'
import { trackEvent } from '@/lib/analytics'
import { toast as sonnerToast } from '@/lib/toast'
import { Button, EmptyState, DataTable, DataTableHead, Th, Tr, Td, Num } from '@/components/ui'
import { formatMarketDataSource } from '@/lib/data-copy'
import { API_BASE_URL } from '@/lib/api-base'
import { describeMarketDataError } from '@/lib/data-errors'
import {
  appendScannerRunHistory,
  clearScannerRunHistory,
  formatScannerRunDuration,
  readScannerRunHistory,
  type ScannerRunHistoryEntry,
} from '@/lib/scanner-run-history'
import { buildMultiChartReviewHref, tradingViewNseSymbols } from '@/lib/multi-chart-review'
import {
  columnsForPreset,
  detectColumnPreset,
  formatScannerColumnValue,
  persistScannerVisibleColumns,
  persistScreenColumnBundle,
  readScannerVisibleColumns,
  resolveInitialScannerColumns,
  resolveScannerColumns,
  SCANNER_COLUMN_DEFS,
  SCANNER_COLUMN_PRESETS,
  SCANNER_DEFAULT_COLUMN_IDS,
  type ScannerColumnId,
  type ScannerColumnPresetId,
} from '@/lib/scanner-result-columns'
import {
  clampFilterRailWidth,
  persistFilterRailPreferences,
  persistScannerHeatmapEnabled,
  persistScannerRowDensity,
  persistScannerViewPreferences,
  readFilterRailPreferences,
  readScannerHeatmapEnabled,
  readScannerRowDensity,
  readScannerViewPreferences,
  type ScannerChartsLayout,
  type ScannerResultsView,
  type ScannerRowDensity,
} from '@/lib/scanner-ui-preferences'
import { ScannerChartsPanel } from '@/components/scanner/ScannerChartsPanel'
import { ScannerDefinitionBuilder } from '@/components/scanner/ScannerDefinitionBuilder'
import { ScannerFilterChips } from '@/components/scanner/ScannerFilterChips'
import { ScannerScreenTabs } from '@/components/scanner/ScannerScreenTabs'
import { ScannerSectorHeatmap } from '@/components/scanner/ScannerSectorHeatmap'
import { ScannerSelectionPanel } from '@/components/scanner/ScannerSelectionPanel'
import { ScannerTrustBanner } from '@/components/scanner/ScannerTrustBanner'
import type { ScannerFilterState } from '@/lib/scanner-active-filters'
import { scannerDefinitionToRunMapping } from '@/lib/scanner-definition'
import { getWatchlistChartRequest } from '@/lib/watchlist-chart-range'
import { countResultsMissingCoreFundamentals, FUNDAMENTALS_UNAVAILABLE_TOOLTIP, SCANNER_FUNDAMENTAL_COLUMN_IDS } from '@/lib/company-display'
import {
  PRESETS_VISIBLE_PER_GROUP,
  SCREENER_CATEGORIES,
  togglePresetGroupExpanded,
  type ScreenerCategoryId,
} from '@/lib/scanner-preset-groups'
import {
  countActiveFiltersInSection,
  readScannerFilterSectionOpen,
  writeScannerFilterSectionOpen,
  SCANNER_FILTER_SECTIONS,
  type ScannerFilterSectionId,
} from '@/lib/scanner-filter-sections'

const API = API_BASE_URL

const WATCHLISTS_UNAVAILABLE_MESSAGE = 'Open Data Status, then try again.'
const WATCHLIST_ADD_FAILED_MESSAGE = 'Check Watchlist or Data Status, then try again.'
const SCANNER_REPORT_FAILED_MESSAGE = 'Could not report the data issue. Try again from Feedback or Data Status.'
const SCAN_ALERT_FAILED_MESSAGE = 'Could not create the scan alert. Check alerts or Data Status, then try again.'
const SAVED_SCREEN_SAVE_FAILED_MESSAGE = 'Saved scanner screen could not be saved. Try again after checking Data Status.'
const SAVED_SCREEN_DELETE_FAILED_MESSAGE = 'Saved scanner screen could not be deleted. Try again after checking Data Status.'
const WATCHLIST_CREATION_FAILED_MESSAGE = 'Watchlist creation failed. Check Watchlist or Data Status, then try again.'
const INITIAL_SCANNER_ROW_RENDER_LIMIT = 60
const SCANNER_ROW_RENDER_INCREMENT = 60
const SCANNER_CHART_PREFETCH_LIMIT = 8

function scannerWatchlistAddFailure(symbol?: string) {
  return symbol
    ? `${symbol} could not be added. ${WATCHLIST_ADD_FAILED_MESSAGE}`
    : WATCHLIST_ADD_FAILED_MESSAGE
}

// ── Types ──────────────────────────────────────────────────
interface ScanResult {
  symbol: string
  company_name: string | null
  sector: string
  close: number
  pct_change: number
  volume: number
  avg_volume_20d: number
  volume_ratio: number
  rsi_14: number | null
  ema_20: number | null
  ema_50: number | null
  ema_150?: number | null
  ema_200: number | null
  ema_200_slope_30d?: number | null
  macd_hist: number | null
  atr_14: number | null
  atr_pct?: number | null
  adx_14: number | null
  week_52_high: number | null
  week_52_low: number | null
  week_52_high_pct: number | null
  is_new_52w_high: boolean
  is_nr7?: boolean | null
  rs_score: number | null
  bb_width: number | null
  avg_volume_50d?: number | null
  price_perf_6m_pct?: number | null
  high_3w?: number | null
  low_3w?: number | null
  darvas_box_height_pct?: number | null
  match_reasons?: string[]
  data_warnings?: string[]
  setup_score?: number | null
  setup_grade?: string | null
  confidence_label?: string | null
  confidence_reasons?: string[]
  scan_run_id?: string | null
  candidate_id?: string | null
  market_cap_cr: number | null
  pe_ratio: number | null
  pb_ratio: number | null
  eps: number | null
  dividend_yield: number | null
  roe: number | null
  roce: number | null
  screen_matches?: string[]
}

type ScanTrust = {
  mode: 'demo' | 'eod' | 'fallback' | 'live' | 'unknown'
  source: string
  asOf: string | null
  coveragePct: number | null
  universeSize: number | null
  message?: string
}

type ScannerRunResponse = {
  results?: ScanResult[]
  total_matches?: number
  total_pages?: number
  page?: number
  trade_date?: string
  is_limited?: boolean
  coverage_pct?: number | null
  universe_size?: number | null
  mode?: string
  status?: string
  source?: string
  message?: string
  detail?: string
  recovery_mode?: string
  incomplete_indicator_count?: number | null
  source_metadata?: {
    mode?: string
    source_name?: string
    as_of?: string | null
    coverage_pct?: number | null
    universe_active?: number | null
    license_notes?: string
    symbols_count?: number | null
  }
  scan_run_id?: string | null
  lineage?: {
    status?: 'recorded' | 'unavailable'
    scan_run_id?: string | null
  }
}

interface Watchlist { id: string; name: string }

function normalizeScanMode(mode: unknown): ScanTrust['mode'] {
  return mode === 'demo' || mode === 'eod' || mode === 'fallback' || mode === 'live' ? mode : 'unknown'
}

function trustFromRunResponse(data: ScannerRunResponse, sourceFallback: string, defaultMode: ScanTrust['mode'] = 'unknown'): ScanTrust {
  return {
    mode: normalizeScanMode(data.source_metadata?.mode ?? data.mode ?? defaultMode),
    source: formatMarketDataSource(data.source_metadata?.source_name ?? data.source, sourceFallback),
    asOf: data.source_metadata?.as_of ?? data.trade_date ?? null,
    coveragePct: data.coverage_pct ?? data.source_metadata?.coverage_pct ?? null,
    universeSize: data.universe_size ?? data.source_metadata?.universe_active ?? null,
    message: data.message ?? data.source_metadata?.license_notes,
  }
}

type ScannerCacheSnapshot = {
  results: ScanResult[]
  totalMatches: number
  totalPages: number
  currentPage: number
  tradeDate: string
  isLimited: boolean
  scanTrust: ScanTrust | null
  scanElapsedMs?: number | null
  savedAt: number
}

const SCANNER_CACHE_KEY = 'alphavyuh-scanner-last-results-v1'
const SCANNER_CACHE_TTL_MS = 5 * 60 * 1000
type ScannerRunRequestBody = {
  filters: Record<string, unknown>
  sort_by: string
  sort_order: string
  limit?: number
  preset_id: string | null
  page: number
  page_size: number
  scanner_definition_id?: string | null
}

const scannerRunInFlight = new Map<string, Promise<ScannerRunResponse>>()

function stableScannerRunKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableScannerRunKey).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableScannerRunKey(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

async function scannerAuthScope(headers: HeadersInit): Promise<string> {
  const authorization = new Headers(headers).get('Authorization') ?? 'anonymous'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function scannerRunRequestKey(body: ScannerRunRequestBody, authScope: string) {
  return `scanner-page-run:${authScope}:${stableScannerRunKey(body)}`
}

async function fetchScannerRunResponse(
  body: ScannerRunRequestBody,
  getHeaders: () => Promise<HeadersInit>,
): Promise<ScannerRunResponse> {
  const headers = await getHeaders()
  const cacheKey = scannerRunRequestKey(body, await scannerAuthScope(headers))
  const pending = scannerRunInFlight.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    const res = await fetch(`${API}/api/v1/scanner/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error((e as { detail?: string }).detail || `Error ${res.status}`)
    }
    const data = await res.json() as ScannerRunResponse
    if (data.mode === 'unavailable' || data.status === 'unavailable') {
      throw new Error(data.message || data.detail || 'Scanner data is temporarily unavailable.')
    }
    return data
  })()
  scannerRunInFlight.set(cacheKey, promise)
  promise.then(
    () => {
      if (scannerRunInFlight.get(cacheKey) === promise) scannerRunInFlight.delete(cacheKey)
    },
    () => {
      if (scannerRunInFlight.get(cacheKey) === promise) scannerRunInFlight.delete(cacheKey)
    },
  )
  return promise
}

function readScannerSnapshot(): ScannerCacheSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SCANNER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ScannerCacheSnapshot
    if (!parsed || !Array.isArray(parsed.results) || Date.now() - parsed.savedAt > SCANNER_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeScannerSnapshot(snapshot: Omit<ScannerCacheSnapshot, 'savedAt'>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SCANNER_CACHE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }))
  } catch {
    // Scanner cache is only a local speed layer.
  }
}

// ── Presets (no emoji) ─────────────────────────────────────
const PRESETS = [
  {
    id: 'trend_template',
    name: 'Trend Template',
    description: 'Daily trend screen using the available SMA stack, EMA 200, RSI, and 52-week range.',
    filters: {
      all_smas_bullish: true,
      price_vs_ema50: 'above',
      price_vs_ema150: 'above',
      price_vs_sma50: 'above',
      price_vs_sma150: 'above',
      price_vs_sma200: 'above',
      price_vs_ema200: 'above',
      ema50_above_ema150: true,
      ema150_above_ema200: true,
      ema_200_trending_up: true,
      rsi_min: 50,
      rs_score_min: 70,
      week_52_high_pct_max: 25,
      w52l_pct_min: 30,
      series: ['EQ'],
    },
  },
  {
    id: 'vcp_breakout',
    name: 'VCP Breakout',
    description: 'Volatility contraction candidates within 5% of recent highs, with trend alignment, contraction, and liquidity confirmation.',
    filters: {
      vcp_contraction: true,
      vcp_min_pivots: 2,
      vcp_max_depth_pct: 15,
      vcp_pivot_proximity_pct: 5,
      all_smas_bullish: true,
      price_vs_ema50: 'above',
      price_vs_ema150: 'above',
      price_vs_sma50: 'above',
      ema50_above_ema150: true,
      ema150_above_ema200: true,
      ema_200_trending_up: true,
      rs_score_min: 70,
      week_52_high_pct_max: 10,
      atr_pct_max: 8,
      volume_ratio_min: 1,
      avg_volume_50d_min: 100000,
      series: ['EQ'],
    },
  },
  {
    id: 'stage2_breakout',
    name: 'Stage 2 Breakout',
    description: 'Stage 2 breakout approximation: price above the SMA trend stack, rising EMA 200, near highs, with volume expansion.',
    filters: {
      all_smas_bullish: true,
      price_vs_sma50: 'above',
      price_vs_sma150: 'above',
      price_vs_sma200: 'above',
      ema_200_trending_up: true,
      week_52_high_pct_max: 15,
      volume_ratio_min: 1.5,
      rsi_min: 50,
      rs_score_min: 70,
      avg_volume_50d_min: 100000,
      series: ['EQ'],
    },
  },
  {
    id: 'high_52w_breakout',
    name: '52W High Breakout',
    description: 'Stocks breaking to a new 52-week high or closing within 2% of the high with above-average volume.',
    filters: {
      week_52_high_pct_max: 2,
      new_52w_high: true,
      pct_change_min: 0,
      volume_ratio_min: 1.5,
      price_vs_sma50: 'above',
      avg_volume_50d_min: 100000,
      series: ['EQ'],
    },
  },
  {
    id: 'low_52w_breakout',
    name: '52W Low Breakdown',
    description: 'Stocks breaking to a new 52-week low on the latest EOD session.',
    filters: {
      new_52w_low: true,
      pct_change_max: 0,
      series: ['EQ'],
    },
  },
  {
    id: 'episodic_pivot',
    name: 'Episodic Pivot',
    description: 'Event-style pivot: strong six-month performance, large positive move, volume expansion, and close above the intermediate trend.',
    filters: {
      pct_change_min: 4,
      volume_ratio_min: 2,
      price_perf_6m_min: 20,
      price_vs_sma50: 'above',
      rsi_min: 55,
      week_52_high_pct_max: 30,
      series: ['EQ'],
    },
  },
  {
    id: 'darvas_box_breakout',
    name: 'Box Breakout',
    description: 'Tight box breakout: 3-week box height under 15%, near 52-week highs, above SMA 50, with volume confirmation and manageable ATR.',
    filters: {
      week_52_high_pct_max: 8,
      price_vs_sma50: 'above',
      volume_ratio_min: 1.5,
      atr_pct_max: 6,
      darvas_box_height_pct_max: 15,
      avg_volume_50d_min: 100000,
      series: ['EQ'],
    },
  },
] as const

type Preset = (typeof PRESETS)[number]
type WorkflowMark = 'shortlist' | 'ignored' | 'review_later' | 'watch'

function presetFiltersForState(preset: Preset): Filters {
  const normalizedFilters = Object.fromEntries(
    Object.entries(preset.filters).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value]),
  )
  return { ...emptyFilters(), ...normalizedFilters } as Filters
}

type Filters = {
  price_min: string; price_max: string
  pct_change_min: string; pct_change_max: string
  volume_ratio_min: string; volume_ratio_max: string
  rsi_min: string; rsi_max: string
  adx_min: string; adx_max: string
  price_vs_ema20: string; price_vs_ema50: string; price_vs_ema150: string; price_vs_ema200: string
  price_vs_sma20: string; price_vs_sma50: string; price_vs_sma150: string; price_vs_sma200: string
  ema20_vs_ema50: string; ema50_vs_ema200: string
  macd_hist_positive: string
  bb_position: string
  bb_width_min: string; bb_width_max: string
  atr_pct_min: string; atr_pct_max: string
  week_52_high_pct_max: string
  rs_score_min: string
  w52l_pct_min: string
  ema_200_trending_up: boolean
  ema50_above_ema150: boolean
  ema150_above_ema200: boolean
  ema_200_slope_30d_min: string
  price_perf_6m_min: string
  avg_volume_50d_min: string
  darvas_box_height_pct_max: string
  nr7: boolean
  all_emas_bullish: boolean
  all_smas_bullish: boolean
  vcp_contraction: boolean
  vcp_min_pivots: string
  vcp_max_depth_pct: string
  vcp_pivot_proximity_pct: string
  new_52w_high: boolean; new_52w_low: boolean
  is_inside_bar: boolean
  series: string[]
  market_cap_min: string; market_cap_max: string
  pe_min: string; pe_max: string
  pb_min: string; pb_max: string
  eps_min: string; eps_max: string
  dividend_yield_min: string; dividend_yield_max: string
  debt_to_equity_max: string
  roe_min: string
  roce_min: string
}

const emptyFilters = (): Filters => ({
  price_min: '', price_max: '',
  pct_change_min: '', pct_change_max: '',
  volume_ratio_min: '', volume_ratio_max: '',
  rsi_min: '', rsi_max: '',
  adx_min: '', adx_max: '',
  price_vs_ema20: '', price_vs_ema50: '', price_vs_ema150: '', price_vs_ema200: '',
  price_vs_sma20: '', price_vs_sma50: '', price_vs_sma150: '', price_vs_sma200: '',
  ema20_vs_ema50: '', ema50_vs_ema200: '',
  macd_hist_positive: '',
  bb_position: '',
  bb_width_min: '', bb_width_max: '',
  atr_pct_min: '', atr_pct_max: '',
  week_52_high_pct_max: '',
  rs_score_min: '',
  w52l_pct_min: '',
  ema_200_trending_up: false,
  ema50_above_ema150: false,
  ema150_above_ema200: false,
  ema_200_slope_30d_min: '',
  price_perf_6m_min: '',
  avg_volume_50d_min: '',
  darvas_box_height_pct_max: '',
  nr7: false,
  all_emas_bullish: false,
  all_smas_bullish: false,
  vcp_contraction: false,
  vcp_min_pivots: '',
  vcp_max_depth_pct: '',
  vcp_pivot_proximity_pct: '',
  new_52w_high: false, new_52w_low: false,
  is_inside_bar: false,
  series: ['EQ'],
  market_cap_min: '', market_cap_max: '',
  pe_min: '', pe_max: '',
  pb_min: '', pb_max: '',
  eps_min: '', eps_max: '',
  dividend_yield_min: '', dividend_yield_max: '',
  debt_to_equity_max: '',
  roe_min: '',
  roce_min: '',
})

const EMPTY_FILTERS = emptyFilters()

function countActiveFilters(f: Filters): number {
  let count = 0
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof Filters)[]) {
    const current = f[key]
    const empty = EMPTY_FILTERS[key]
    if (typeof current === 'boolean') {
      if (current !== empty) count++
    } else if (Array.isArray(current)) {
      if (JSON.stringify(current) !== JSON.stringify(empty)) count++
    } else {
      if (current !== empty) count++
    }
  }
  return count
}

function rsScoreColor(score: number | null | undefined): string {
  if (score == null) return 'var(--text-primary)'
  if (score >= 80) return '#00D9A7'
  if (score >= 60) return '#F1EFE8'
  return '#A8A29E'
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%',
}

function FilterSection({
  sectionId,
  title,
  activeCount,
  children,
}: {
  sectionId: ScannerFilterSectionId
  title: string
  activeCount: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => {
    if (activeCount > 0) return true
    return readScannerFilterSectionOpen(sectionId) ?? false
  })

  useEffect(() => {
    if (activeCount > 0) setOpen(true)
  }, [activeCount])

  return (
    <div className="scanner-filter-section">
      <button
        type="button"
        className="scanner-filter-section-header"
        onClick={() => {
          setOpen((current) => {
            const next = !current
            writeScannerFilterSectionOpen(sectionId, next)
            return next
          })
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {title}
          {activeCount > 0 ? (
            <span className="scanner-filter-section-active" aria-label={`${activeCount} active filters`}>
              ({activeCount})
            </span>
          ) : null}
        </span>
        <span style={{ fontSize: 12, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && <div className="scanner-filter-section-body">{children}</div>}
    </div>
  )
}

function ScannerRowActions({
  result,
  watchlists,
  onMark,
  onAddToWatchlist,
  onOpenChart,
  onReport,
}: {
  result: ScanResult
  watchlists: Watchlist[]
  onMark: (symbols: string[], mark: Exclude<WorkflowMark, 'watch'>) => void
  onAddToWatchlist: (symbol: string, wlId: string) => void
  onOpenChart: (symbol: string) => void
  onReport: (symbol: string) => void
}) {
  return (
    <div
      className="scanner-row-actions"
      data-testid={`scanner-primary-actions-${result.symbol}`}
      style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}
    >
      <button
        type="button"
        className="scanner-row-action scanner-row-action-primary"
        title={`Shortlist ${result.symbol}`}
        onClick={(e) => { e.stopPropagation(); onMark([result.symbol], 'shortlist') }}
        style={{ color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}
      >
        Shortlist
      </button>
      <select
        aria-label={`More actions for ${result.symbol}`}
        className="scanner-row-menu scanner-more-select"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation()
          const action = e.target.value
          e.target.value = ''
          if (action === 'chart') onOpenChart(result.symbol)
          if (action === 'review_later') onMark([result.symbol], 'review_later')
          if (action === 'ignore') onMark([result.symbol], 'ignored')
          if (action === 'journal') window.location.assign(`/journal?symbol=${encodeURIComponent(result.symbol)}&review=needs-review`)
          if (action === 'report') onReport(result.symbol)
          if (action.startsWith('wl:')) onAddToWatchlist(result.symbol, action.slice(3))
        }}
      >
        <option value="">⋯</option>
        <option value="chart">Open chart</option>
        {watchlists.map((w) => (
          <option key={w.id} value={`wl:${w.id}`}>Add to {w.name}</option>
        ))}
        <option value="review_later">Review later</option>
        <option value="ignore">Ignore</option>
        <option value="journal">Review journal</option>
        <option value="report">Report data</option>
      </select>
    </div>
  )
}

export default function ScannerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const filterSectionActiveCount = useCallback((sectionId: ScannerFilterSectionId) => {
    const section = SCANNER_FILTER_SECTIONS.find((item) => item.id === sectionId)
    if (!section) return 0
    return countActiveFiltersInSection(
      filters as unknown as Record<string, unknown>,
      EMPTY_FILTERS as unknown as Record<string, unknown>,
      section.keys,
    )
  }, [filters])
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 150 | 200>(25)
  const [tradeDate, setTradeDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState('volume_ratio')
  const [sortDesc, setSortDesc] = useState(true)
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [watchlistsError, setWatchlistsError] = useState('')
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([])
  const [savedScreensError, setSavedScreensError] = useState('')
  const [scannerDefinitions, setScannerDefinitions] = useState<ScannerDefinition[]>([])
  const [scannerDefinitionsError, setScannerDefinitionsError] = useState('')
  const [showDefinitionBuilder, setShowDefinitionBuilder] = useState(false)
  const [editingDefinition, setEditingDefinition] = useState<ScannerDefinition | null>(null)
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null)
  const [activeDefinitionName, setActiveDefinitionName] = useState<string | null>(null)
  const [activeDefinitionUnsupported, setActiveDefinitionUnsupported] = useState<string[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showWlModal, setShowWlModal] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [newScreenName, setNewScreenName] = useState('')
  const [newWlName, setNewWlName] = useState('')
  const [alertName, setAlertName] = useState('')
  const [alertSaving, setAlertSaving] = useState(false)
  const [activeScreenName, setActiveScreenName] = useState<string | null>(null)
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null)
  const [activeCompositionName, setActiveCompositionName] = useState<string | null>(null)
  const [selectedScreenIds, setSelectedScreenIds] = useState<Set<string>>(new Set())
  const [compositionMode, setCompositionMode] = useState<ScannerCompositionMode>('and')
  const [composingScreens, setComposingScreens] = useState(false)
  const [filterTab, setFilterTab] = useState<'technicals' | 'fundamentals'>('technicals')
  const [resultSymbolFilter, setResultSymbolFilter] = useState('')
  const [chartsLayout, setChartsLayout] = useState<ScannerChartsLayout>('2-up')
  const [expandedPresetGroups, setExpandedPresetGroups] = useState<Set<ScreenerCategoryId>>(new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultsView, setResultsView] = useState<ScannerResultsView>('list')
  const [visibleColumnIds, setVisibleColumnIds] = useState<ScannerColumnId[]>([...SCANNER_DEFAULT_COLUMN_IDS])
  const [activeColumnPreset, setActiveColumnPreset] = useState<ScannerColumnPresetId | 'custom'>('custom')
  const [rowDensity, setRowDensity] = useState<ScannerRowDensity>('comfortable')
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [filterRailWidth, setFilterRailWidth] = useState(300)
  const [filterRailCollapsed, setFilterRailCollapsed] = useState(false)
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1)
  const [renderedRowLimit, setRenderedRowLimit] = useState(INITIAL_SCANNER_ROW_RENDER_LIMIT)
  const [columnsPickerOpen, setColumnsPickerOpen] = useState(false)
  const symbolFilterRef = useRef<HTMLInputElement>(null)
  const resultsScrollRef = useRef<HTMLDivElement>(null)
  const prefetchedScannerChartKeyRef = useRef('')
  const scannerRequestSeqRef = useRef(0)
  const [hasCachedResults, setHasCachedResults] = useState(false)
  const [isLimited, setIsLimited] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [workflowMarks, setWorkflowMarks] = useState<Record<string, WorkflowMark>>({})
  const [scanTrust, setScanTrust] = useState<ScanTrust | null>(null)
  const [scanElapsedMs, setScanElapsedMs] = useState<number | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [incompleteIndicatorCount, setIncompleteIndicatorCount] = useState(0)
  const [symbolsScanned, setSymbolsScanned] = useState<number | null>(null)
  const [runHistory, setRunHistory] = useState<ScannerRunHistoryEntry[]>([])
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)

  const getAuthHeaders = useCallback(() => authHeaders(), [])

  const beginScannerRequest = useCallback(() => {
    scannerRequestSeqRef.current += 1
    return scannerRequestSeqRef.current
  }, [])

  const isCurrentScannerRequest = useCallback((requestSeq: number) => {
    return scannerRequestSeqRef.current === requestSeq
  }, [])

  useEffect(() => {
    const cached = readScannerSnapshot()
    if (cached) {
      setResults(cached.results)
      setTotalMatches(cached.totalMatches)
      setTotalPages(cached.totalPages)
      setCurrentPage(cached.currentPage)
      setTradeDate(cached.tradeDate)
      setIsLimited(cached.isLimited)
      setScanTrust(cached.scanTrust)
      setScanElapsedMs(cached.scanElapsedMs ?? null)
      setHasRun(true)
      setHasCachedResults(true)
      setActiveCompositionName(null)
    }
    setRunHistory(readScannerRunHistory())
    loadWatchlists()
    loadSavedScreens()
    loadScannerDefinitions()
  }, [])

  function showToast(msg: string) {
    sonnerToast.success(msg)
  }

  async function loadWatchlists() {
    try {
      const lists = await getCachedWatchlists()
      setWatchlists(lists.map(({ id, name }) => ({ id, name })))
      setWatchlistsError('')
    } catch {
      setWatchlists([])
      setWatchlistsError(WATCHLISTS_UNAVAILABLE_MESSAGE)
    }
  }

  async function reportScannerDataIssue(symbol?: string) {
    try {
      await createFeedbackReport({
        category: 'data_issue',
        page: '/scanner',
        symbol,
        severity: 'high',
        message: symbol
          ? `Scanner data issue reported for ${symbol}.`
          : `Scanner returned no matches for filters that may need data review.`,
        context: { filters: buildPayload(filters, sortBy, sortDesc).filters, trade_date: tradeDate, total_matches: totalMatches },
      });
      showToast('Data issue reported')
    } catch {
      showToast(SCANNER_REPORT_FAILED_MESSAGE)
    }
  }

  async function loadSavedScreens() {
    if (scannerUsesClientMockFallback()) {
      setSavedScreensError('')
      setSavedScreens([
        { id: 'mock-trend-template', name: 'Trend Template', filters: PRESETS[0].filters, is_default: false, created_at: '2026-04-24T09:15:00Z' },
        { id: 'mock-vcp-breakout', name: 'VCP Breakout', filters: PRESETS[1].filters, is_default: false, created_at: '2026-04-24T09:20:00Z' },
      ])
      return
    }
    try {
      setSavedScreensError('')
      const screens = await getCachedScreens()
      setSavedScreens(screens)
    } catch (error) {
      setSavedScreens([])
      setSavedScreensError(error instanceof Error ? error.message : 'Saved scanner screens are temporarily unavailable.')
    }
  }

  async function loadScannerDefinitions() {
    try {
      setScannerDefinitionsError('')
      setScannerDefinitions(await getScannerDefinitions())
    } catch (error) {
      setScannerDefinitions([])
      setScannerDefinitionsError(error instanceof Error ? error.message : 'Scanner definitions are temporarily unavailable.')
    }
  }

  function clearActiveDefinition() {
    setActiveDefinitionId(null)
    setActiveDefinitionName(null)
    setActiveDefinitionUnsupported([])
  }

  function applyScannerDefinition(definition: ScannerDefinition) {
    const mapping = scannerDefinitionToRunMapping(definition)
    const filterState = Object.fromEntries(
      Object.entries(mapping.filters).map(([key, value]) => [
        key,
        typeof value === 'number' ? String(value) : value,
      ]),
    )
    setFilters({ ...emptyFilters(), ...filterState } as Filters)
    setActivePreset('normalized_definition')
    setActiveScreenName(null)
    setActiveScreenId(null)
    setActiveCompositionName(null)
    setActiveDefinitionId(definition.id)
    setActiveDefinitionName(definition.name)
    setActiveDefinitionUnsupported(mapping.unsupported)
    setCurrentPage(1)
    if (mapping.unsupported.length > 0) {
      setError(`"${definition.name}" is saved, but cannot run yet: ${mapping.unsupported.join(' · ')}`)
    } else {
      setError('')
    }
  }

  function openNewDefinitionBuilder() {
    setEditingDefinition(null)
    setShowDefinitionBuilder(true)
  }

  function handleDefinitionSaved(definition: ScannerDefinition) {
    setScannerDefinitions((current) => [definition, ...current.filter((item) => item.id !== definition.id)])
    setShowDefinitionBuilder(false)
    setEditingDefinition(null)
    applyScannerDefinition(definition)
    showToast(`"${definition.name}" saved`)
  }

  async function handleDeleteDefinition(definition: ScannerDefinition) {
    try {
      await deleteScannerDefinition(definition.id)
      setScannerDefinitions((current) => current.filter((item) => item.id !== definition.id))
      if (activeDefinitionId === definition.id) {
        clearActiveDefinition()
        setActivePreset(null)
      }
      showToast(`"${definition.name}" deleted`)
    } catch {
      showToast('Scanner definition could not be deleted. Try again after checking Data Status.')
    }
  }

  const scannerRunLabel = useCallback((eventPreset: string | null | undefined) => {
    if (eventPreset === 'saved_screen') return activeScreenName ?? 'Saved screen'
    if (eventPreset === 'normalized_definition') return activeDefinitionName ?? 'Scanner definition'
    if (eventPreset && eventPreset !== 'custom') return PRESETS.find(p => p.id === eventPreset)?.name ?? 'Custom scan'
    return 'Custom scan'
  }, [activeDefinitionName, activeScreenName])

  const scannerRunPresetId = useCallback((eventPreset: string | null | undefined) => {
    return eventPreset ?? 'custom'
  }, [])

  const rememberScannerRun = useCallback((params: {
    eventPreset: string | null | undefined
    results: ScanResult[]
    totalMatches: number
    totalPages: number
    currentPage: number
    tradeDate: string
    isLimited: boolean
    scanTrust: ScanTrust
    filters: Filters
    sortBy: string
    sortDesc: boolean
    pageSize: number
    elapsedMs: number | null
  }) => {
    const nextHistory = appendScannerRunHistory({
      label: scannerRunLabel(params.eventPreset),
      presetId: scannerRunPresetId(params.eventPreset),
      totalMatches: params.totalMatches,
      totalPages: params.totalPages,
      currentPage: params.currentPage,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortDesc: params.sortDesc,
      tradeDate: params.tradeDate,
      isLimited: params.isLimited,
      dataSource: params.scanTrust.source,
      dataMode: params.scanTrust.mode,
      dataAsOf: params.scanTrust.asOf ?? params.tradeDate,
      coveragePct: params.scanTrust.coveragePct,
      universeSize: params.scanTrust.universeSize,
      elapsedMs: params.elapsedMs,
      filters: params.filters,
      results: params.results,
    })
    setRunHistory(nextHistory)
  }, [scannerRunLabel, scannerRunPresetId])

  function restoreScannerRun(entry: ScannerRunHistoryEntry) {
    const restoredResults = entry.results as unknown as ScanResult[]
    const restoredTrust = {
      mode: (entry.dataMode ?? 'unknown') as ScanTrust['mode'],
      source: entry.dataSource ?? 'Scanner run history',
      asOf: entry.dataAsOf ?? entry.tradeDate ?? null,
      coveragePct: entry.coveragePct,
      universeSize: entry.universeSize,
    } satisfies ScanTrust
    setResults(restoredResults)
    setSelectedResults(new Set())
    setTotalMatches(entry.totalMatches)
    setTotalPages(entry.totalPages)
    setCurrentPage(entry.currentPage)
    setPageSize([25, 50, 150, 200].includes(entry.pageSize) ? entry.pageSize as 25 | 50 | 150 | 200 : 25)
    setTradeDate(entry.tradeDate)
    setIsLimited(entry.isLimited)
    setScanTrust(restoredTrust)
    setSortBy(entry.sortBy)
    setSortDesc(entry.sortDesc)
    setScanElapsedMs(entry.elapsedMs)
    setFilters({ ...emptyFilters(), ...(entry.filters ?? {}) } as Filters)
    setActivePreset(entry.presetId === 'custom' ? null : entry.presetId)
    setActiveScreenName(entry.presetId === 'saved_screen' ? entry.label : null)
    clearActiveDefinition()
    setHasRun(true)
    setHasCachedResults(true)
    setError('')
    writeScannerSnapshot({
      results: restoredResults,
      totalMatches: entry.totalMatches,
      totalPages: entry.totalPages,
      currentPage: entry.currentPage,
      tradeDate: entry.tradeDate,
      isLimited: entry.isLimited,
      scanTrust: restoredTrust,
      scanElapsedMs: entry.elapsedMs,
    })
    trackEvent('scanner_run_history_restored', {
      label: entry.label,
      results: entry.resultCount,
      mode: entry.dataMode ?? 'unknown',
    })
  }

  function clearRecentRuns() {
    clearScannerRunHistory()
    setRunHistory([])
  }

  const buildPayload = useCallback((f: Filters, sb: string, sd: boolean) => {
    const fil: Record<string, unknown> = { series: f.series || ['EQ'] }
    const num = (v: string) => v !== '' ? parseFloat(v) : undefined
    const set = (key: string, v: unknown) => { if (v !== undefined && v !== '' && v !== null) fil[key] = v }

    set('price_min', num(f.price_min)); set('price_max', num(f.price_max))
    set('pct_change_min', num(f.pct_change_min)); set('pct_change_max', num(f.pct_change_max))
    set('volume_ratio_min', num(f.volume_ratio_min)); set('volume_ratio_max', num(f.volume_ratio_max))
    set('rsi_min', num(f.rsi_min)); set('rsi_max', num(f.rsi_max))
    set('adx_min', num(f.adx_min)); set('adx_max', num(f.adx_max))
    set('week_52_high_pct_max', num(f.week_52_high_pct_max))
    set('rs_score_min', num(f.rs_score_min))
    set('w52l_pct_min', num(f.w52l_pct_min))
    set('ema_200_slope_30d_min', num(f.ema_200_slope_30d_min))
    set('price_perf_6m_min', num(f.price_perf_6m_min))
    set('avg_volume_50d_min', num(f.avg_volume_50d_min))
    set('darvas_box_height_pct_max', num(f.darvas_box_height_pct_max))
    if (f.ema_200_trending_up) fil.ema_200_trending_up = true
    if (f.ema50_above_ema150) fil.ema50_above_ema150 = true
    if (f.ema150_above_ema200) fil.ema150_above_ema200 = true
    if (f.nr7) fil.nr7 = true
    if (f.all_emas_bullish) fil.all_emas_bullish = true
    if (f.all_smas_bullish) fil.all_smas_bullish = true
    if (f.vcp_contraction) fil.vcp_contraction = true
    set('vcp_min_pivots', num(f.vcp_min_pivots))
    set('vcp_max_depth_pct', num(f.vcp_max_depth_pct))
    set('vcp_pivot_proximity_pct', num(f.vcp_pivot_proximity_pct))
    set('bb_width_min', num(f.bb_width_min)); set('bb_width_max', num(f.bb_width_max))
    set('atr_pct_min', num(f.atr_pct_min)); set('atr_pct_max', num(f.atr_pct_max))
    if (f.price_vs_ema20) set('price_vs_ema20', f.price_vs_ema20)
    if (f.price_vs_ema50) set('price_vs_ema50', f.price_vs_ema50)
    if (f.price_vs_ema150) set('price_vs_ema150', f.price_vs_ema150)
    if (f.price_vs_ema200) set('price_vs_ema200', f.price_vs_ema200)
    if (f.price_vs_sma20) set('price_vs_sma20', f.price_vs_sma20)
    if (f.price_vs_sma50) set('price_vs_sma50', f.price_vs_sma50)
    if (f.price_vs_sma150) set('price_vs_sma150', f.price_vs_sma150)
    if (f.price_vs_sma200) set('price_vs_sma200', f.price_vs_sma200)
    if (f.ema20_vs_ema50) set('ema20_vs_ema50', f.ema20_vs_ema50)
    if (f.ema50_vs_ema200) set('ema50_vs_ema200', f.ema50_vs_ema200)
    if (f.bb_position) set('bb_position', f.bb_position)
    if (f.macd_hist_positive === 'positive') fil.macd_hist_positive = true
    if (f.macd_hist_positive === 'negative') fil.macd_hist_positive = false
    if (f.new_52w_high) fil.new_52w_high = true
    if (f.new_52w_low) fil.new_52w_low = true
    if (f.is_inside_bar) fil.is_inside_bar = true
    set('market_cap_min', num(f.market_cap_min)); set('market_cap_max', num(f.market_cap_max))
    set('pe_min', num(f.pe_min)); set('pe_max', num(f.pe_max))
    set('pb_min', num(f.pb_min)); set('pb_max', num(f.pb_max))
    set('eps_min', num(f.eps_min)); set('eps_max', num(f.eps_max))
    set('dividend_yield_min', num(f.dividend_yield_min)); set('dividend_yield_max', num(f.dividend_yield_max))
    set('debt_to_equity_max', num(f.debt_to_equity_max))
    set('roe_min', num(f.roe_min))
    set('roce_min', num(f.roce_min))

    return { filters: fil, sort_by: sb, sort_order: sd ? 'desc' : 'asc', limit: 200 }
  }, [])

  const runScan = useCallback(async (overrideFilters?: Filters, sb = sortBy, sd = sortDesc, page = currentPage, size = pageSize, eventPreset = activePreset ?? 'custom') => {
    if (activeDefinitionId && activeDefinitionUnsupported.length > 0) {
      setError(`This definition cannot run yet: ${activeDefinitionUnsupported.join(' · ')}`)
      return
    }
    const requestSeq = beginScannerRequest()
    const hadResults = results.length > 0
    const scanStartedAt = performance.now()
    const activeFilters = overrideFilters || filters
    setLoading(true); setError(''); if (!hadResults) setResults([])
    setScanElapsedMs(null)
    try {
      if (scannerUsesClientMockFallback()) {
        const data = mockRunScan()
        const nextResults = data.results as unknown as ScanResult[]
        const nextTotalMatches = data.total_matches || 0
        const nextTotalPages = data.total_pages || 1
        const nextCurrentPage = data.page || page
        const nextTradeDate = data.trade_date || ''
        const nextIsLimited = data.is_limited || false
        const nextTrust = trustFromRunResponse(data as ScannerRunResponse, 'Demo data', 'demo')
        const elapsedMs = Math.round(performance.now() - scanStartedAt)
        if (!isCurrentScannerRequest(requestSeq)) return
        setResults(nextResults)
        setActiveCompositionName(null)
        setTotalMatches(nextTotalMatches)
        setTotalPages(nextTotalPages)
        setCurrentPage(nextCurrentPage)
        setTradeDate(nextTradeDate)
        setIsLimited(nextIsLimited)
        setScanTrust(nextTrust)
        setRecoveryMode(false)
        setIncompleteIndicatorCount(0)
        setSymbolsScanned(data.source_metadata?.symbols_count ?? null)
        setScanElapsedMs(elapsedMs)
        setHasCachedResults(false)
        writeScannerSnapshot({
          results: nextResults,
          totalMatches: nextTotalMatches,
          totalPages: nextTotalPages,
          currentPage: nextCurrentPage,
          tradeDate: nextTradeDate,
          isLimited: nextIsLimited,
          scanTrust: nextTrust,
          scanElapsedMs: elapsedMs,
        })
        rememberScannerRun({
          eventPreset,
          results: nextResults,
          totalMatches: nextTotalMatches,
          totalPages: nextTotalPages,
          currentPage: nextCurrentPage,
          tradeDate: nextTradeDate,
          isLimited: nextIsLimited,
          scanTrust: nextTrust,
          filters: activeFilters,
          sortBy: sb,
          sortDesc: sd,
          pageSize: size,
          elapsedMs,
        })
        setHasRun(true)
        trackEvent('scanner_run', {
          mode: 'demo',
          results: data.results.length,
          preset: eventPreset,
          confidence_available: data.results.some((result) => (result as ScanResult).setup_score != null),
        })
        return
      }
      const payload = buildPayload(activeFilters, sb, sd)
      const data = await fetchScannerRunResponse({
        ...payload,
        preset_id: eventPreset === 'custom' || eventPreset === 'saved_screen' ? null : eventPreset,
        scanner_definition_id: eventPreset === 'normalized_definition' ? activeDefinitionId : null,
        page,
        page_size: size,
      }, getAuthHeaders)
      const nextResults = data.results || []
      const nextTotalMatches = data.total_matches || 0
      const nextTotalPages = data.total_pages || 1
      const nextCurrentPage = data.page || page
      const nextTradeDate = data.trade_date || ''
      const nextIsLimited = data.is_limited || false
      const nextTrust = trustFromRunResponse(data, 'Market data', 'eod')
      const elapsedMs = Math.round(performance.now() - scanStartedAt)
      if (!isCurrentScannerRequest(requestSeq)) return
      setResults(nextResults)
      setSelectedResults(new Set())
      setActiveCompositionName(null)
      setTotalMatches(nextTotalMatches)
      setTotalPages(nextTotalPages)
      setCurrentPage(nextCurrentPage)
      setTradeDate(nextTradeDate)
      setIsLimited(nextIsLimited)
      setScanTrust(nextTrust)
      setRecoveryMode(data.recovery_mode === 'vercel_readonly' || API_BASE_URL === '')
      setIncompleteIndicatorCount(
        data.incomplete_indicator_count
        ?? nextResults.filter((result: ScanResult) => (result.data_warnings?.length ?? 0) > 0).length,
      )
      setSymbolsScanned(data.source_metadata?.symbols_count ?? null)
      setScanElapsedMs(elapsedMs)
      setHasCachedResults(false)
      writeScannerSnapshot({
        results: nextResults,
        totalMatches: nextTotalMatches,
        totalPages: nextTotalPages,
        currentPage: nextCurrentPage,
        tradeDate: nextTradeDate,
        isLimited: nextIsLimited,
        scanTrust: nextTrust,
        scanElapsedMs: elapsedMs,
      })
      rememberScannerRun({
        eventPreset,
        results: nextResults,
        totalMatches: nextTotalMatches,
        totalPages: nextTotalPages,
        currentPage: nextCurrentPage,
        tradeDate: nextTradeDate,
        isLimited: nextIsLimited,
        scanTrust: nextTrust,
        filters: activeFilters,
        sortBy: sb,
        sortDesc: sd,
        pageSize: size,
        elapsedMs,
      })
      setHasRun(true)
      trackEvent('scanner_run', {
        mode: data.source_metadata?.mode ?? data.mode ?? 'eod',
        results: (data.results || []).length,
        preset: eventPreset,
        confidence_available: (data.results || []).some((result: ScanResult) => result.setup_score != null),
      })
    } catch (e: unknown) {
      if (isCurrentScannerRequest(requestSeq)) setError(describeMarketDataError(e))
    } finally {
      if (isCurrentScannerRequest(requestSeq)) setLoading(false)
    }
  }, [activeDefinitionId, activeDefinitionUnsupported, activePreset, beginScannerRequest, buildPayload, currentPage, filters, getAuthHeaders, isCurrentScannerRequest, pageSize, rememberScannerRun, results.length, sortBy, sortDesc])

  const selectPreset = useCallback((p: Preset) => {
    const f = presetFiltersForState(p)
    setFilters(f)
    setActivePreset(p.id)
    setActiveScreenName(null)
    setActiveScreenId(null)
    setActiveCompositionName(null)
    clearActiveDefinition()
    setCurrentPage(1)
    const columns = readScannerVisibleColumns()
    setVisibleColumnIds(columns)
    setActiveColumnPreset(detectColumnPreset(columns))
  }, [])

  useEffect(() => {
    const presetId = searchParams.get('preset')
    if (!presetId) return
    const preset = PRESETS.find((entry) => entry.id === presetId)
    if (preset) selectPreset(preset)
  }, [searchParams, selectPreset])

  useEffect(() => {
    const viewPrefs = readScannerViewPreferences()
    setResultsView(viewPrefs.resultsView)
    setChartsLayout(viewPrefs.chartsLayout)
    setRowDensity(readScannerRowDensity())
    setHeatmapEnabled(readScannerHeatmapEnabled())
    const railPrefs = readFilterRailPreferences()
    setFilterRailWidth(railPrefs.width)
    setFilterRailCollapsed(railPrefs.collapsed)
    const columns = readScannerVisibleColumns()
    setVisibleColumnIds(columns)
    setActiveColumnPreset(detectColumnPreset(columns))
  }, [])

  useEffect(() => {
    persistScannerViewPreferences({ resultsView, chartsLayout })
  }, [resultsView, chartsLayout])

  useEffect(() => {
    persistScannerRowDensity(rowDensity)
  }, [rowDensity])

  useEffect(() => {
    persistScannerHeatmapEnabled(heatmapEnabled)
  }, [heatmapEnabled])

  useEffect(() => {
    persistFilterRailPreferences({ width: filterRailWidth, collapsed: filterRailCollapsed })
  }, [filterRailWidth, filterRailCollapsed])

  function applyColumnPreset(presetId: ScannerColumnPresetId) {
    const columns = columnsForPreset(presetId)
    setVisibleColumnIds(columns)
    setActiveColumnPreset(presetId)
    persistScannerVisibleColumns(columns)
    if (activeScreenId) {
      persistScreenColumnBundle(activeScreenId, presetId, columns)
    }
  }

  function loadScreen(screen: SavedScreen) {
    const f = { ...emptyFilters(), ...screen.filters } as Filters
    setFilters(f)
    setActivePreset('saved_screen')
    setActiveScreenName(screen.name)
    setActiveScreenId(screen.id)
    setActiveCompositionName(null)
    clearActiveDefinition()
    setCurrentPage(1)
    const columns = resolveInitialScannerColumns(screen.id)
    setVisibleColumnIds(columns)
    setActiveColumnPreset(detectColumnPreset(columns))
  }

  function startFilterRailResize(event: React.MouseEvent<HTMLDivElement>) {
    if (filterRailCollapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = filterRailWidth
    function onMove(moveEvent: MouseEvent) {
      setFilterRailWidth(clampFilterRailWidth(startWidth + moveEvent.clientX - startX))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function currentScanName() {
    return activeCompositionName ?? activePresetMeta?.name ?? activeDefinitionName ?? activeScreenName ?? (hasRun ? 'Custom scan' : 'Saved scan')
  }

  function toggleCompositionScreen(screenId: string, checked: boolean) {
    setSelectedScreenIds(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(screenId)
      } else {
        next.delete(screenId)
      }
      return next
    })
  }

  async function runSavedScreen(screen: SavedScreen): Promise<{ screen: SavedScreen; results: ScanResult[]; trust: ScanTrust; tradeDate: string; isLimited: boolean }> {
    if (scannerUsesClientMockFallback()) {
      const data = mockRunScan() as unknown as ScannerRunResponse
      return {
        screen,
        results: data.results ?? [],
        trust: trustFromRunResponse(data, 'Demo data', 'demo'),
        tradeDate: data.trade_date ?? '',
        isLimited: data.is_limited === true,
      }
    }

    const data = await fetchScannerRunResponse({
      filters: screen.filters,
      sort_by: sortBy,
      sort_order: sortDesc ? 'desc' : 'asc',
      preset_id: null,
      page: 1,
      page_size: 200,
    }, getAuthHeaders)
    return {
      screen,
      results: data.results ?? [],
      trust: trustFromRunResponse(data, 'Market data', 'eod'),
      tradeDate: data.trade_date ?? '',
      isLimited: data.is_limited === true,
    }
  }

  async function runSavedScreenComposition() {
    const screens = savedScreens.filter(screen => selectedScreenIds.has(screen.id))
    if (screens.length < 2) {
      showToast('Select at least two saved screens')
      return
    }
    const requestSeq = beginScannerRequest()
    setComposingScreens(true)
    setLoading(true)
    setError('')
    try {
      const runs = await Promise.all(screens.map(screen => runSavedScreen(screen)))
      const composed = composeScannerResults(
        runs.map(run => ({ screenId: run.screen.id, screenName: run.screen.name, results: run.results })),
        compositionMode,
      )
      const nextTrust = {
        ...runs[0].trust,
        source: 'Saved scan composition',
        message: `${compositionMode.toUpperCase()} composition across ${screens.length} saved screens.`,
      } satisfies ScanTrust
      const label = `${screens.map(screen => screen.name).join(compositionMode === 'and' ? ' + ' : ' / ')}`
      if (!isCurrentScannerRequest(requestSeq)) return
      setResults(composed)
      setSelectedResults(new Set())
      setWorkflowMarks({})
      setTotalMatches(composed.length)
      setTotalPages(1)
      setCurrentPage(1)
      setTradeDate(runs.find(run => run.tradeDate)?.tradeDate ?? '')
      setIsLimited(runs.some(run => run.isLimited))
      setScanTrust(nextTrust)
      setHasCachedResults(false)
      setHasRun(true)
      setActivePreset('saved_screen')
      setActiveScreenName(null)
      clearActiveDefinition()
      setActiveCompositionName(`${compositionMode.toUpperCase()} · ${label}`)
      writeScannerSnapshot({
        results: composed,
        totalMatches: composed.length,
        totalPages: 1,
        currentPage: 1,
        tradeDate: runs.find(run => run.tradeDate)?.tradeDate ?? '',
        isLimited: runs.some(run => run.isLimited),
        scanTrust: nextTrust,
        scanElapsedMs: null,
      })
      trackEvent('scanner_saved_screen_composition', {
        mode: compositionMode,
        screens: screens.length,
        results: composed.length,
      })
      showToast(`${composed.length} ${composed.length === 1 ? 'match' : 'matches'} from ${compositionMode.toUpperCase()} composition`)
    } catch (e: unknown) {
      if (isCurrentScannerRequest(requestSeq)) setError(describeMarketDataError(e))
    } finally {
      if (isCurrentScannerRequest(requestSeq)) {
        setLoading(false)
        setComposingScreens(false)
      }
    }
  }

  function openAlertModal() {
    setAlertName(currentScanName())
    setShowAlertModal(true)
  }

  async function createEodAlert() {
    const name = alertName.trim()
    if (!name) return
    setAlertSaving(true)
    try {
      const payload = buildPayload(filters, sortBy, sortDesc)
      await createAlert({
        name,
        filters: payload.filters,
        sort_by: payload.sort_by,
        sort_order: payload.sort_order,
      })
      setShowAlertModal(false)
      showToast(`Scan alert created for "${name}"`)
      trackEvent('scan_alert_created', {
        source: 'scanner',
        preset: activePresetMeta?.id ?? activePreset ?? 'custom',
        mode: scanTrust?.mode ?? 'unknown',
      })
    } catch {
      showToast(SCAN_ALERT_FAILED_MESSAGE)
    } finally {
      setAlertSaving(false)
    }
  }

  async function saveCurrentScreen() {
    const screenName = newScreenName.trim()
    if (!screenName) return
    if (screenName.toLowerCase() === 'recommended') {
      showToast('"Recommended" cannot be used as a preset name')
      return
    }
    try {
      const status = await getPlanStatus()
      if (status.plan === 'free' && savedScreens.length >= 3) {
        showToast('Free plan allows up to 3 saved presets. Upgrade to save more.')
        setShowSaveModal(false)
        return
      }
    } catch { /* proceed if plan check fails */ }
    if (scannerUsesClientMockFallback()) {
      setSavedScreens(prev => [
        ...prev,
        { id: `mock-${Date.now()}`, name: screenName, filters, is_default: false, created_at: new Date().toISOString() },
      ])
      setNewScreenName(''); setShowSaveModal(false)
      showToast('Screen saved in mock mode')
      return
    }
    try {
      const payload = buildPayload(filters, sortBy, sortDesc)
      await saveSavedScreen(screenName, payload.filters)
      setNewScreenName(''); setShowSaveModal(false)
      await loadSavedScreens()
      showToast(`"${screenName}" saved`)
    } catch {
      const message = SAVED_SCREEN_SAVE_FAILED_MESSAGE
      setError(message)
      showToast(message)
    }
  }

  async function handleDeleteScreen(id: string, name: string) {
    if (scannerUsesClientMockFallback()) {
      setSavedScreens(prev => prev.filter(screen => screen.id !== id))
      showToast(`"${name}" deleted`)
      return
    }
    try {
      await deleteSavedScreen(id)
      await loadSavedScreens()
      showToast(`"${name}" deleted`)
    } catch {
      showToast(SAVED_SCREEN_DELETE_FAILED_MESSAGE)
    }
  }

  const scanContextOptions = useCallback(() => {
    const presetMeta = PRESETS.find(p => p.id === activePreset) ?? null
    return {
      presetId: activePreset,
      presetName: activeCompositionName ?? presetMeta?.name ?? (activePreset === 'saved_screen' ? activeScreenName ?? 'Saved screen' : activePreset === 'normalized_definition' ? activeDefinitionName ?? 'Scanner definition' : activePreset === 'custom' ? 'Custom scan' : null),
      tradeDate,
      dataSource: scanTrust?.source ?? null,
      dataMode: scanTrust?.mode ?? null,
      dataAsOf: scanTrust?.asOf ?? tradeDate ?? null,
    }
  }, [activeCompositionName, activeDefinitionName, activePreset, activeScreenName, scanTrust?.asOf, scanTrust?.mode, scanTrust?.source, tradeDate])

  async function addToWatchlist(symbol: string, wlId: string) {
    try {
      await addSymbolToWatchlist(wlId, symbol)
      const result = results.find((row) => row.symbol === symbol)
      await bulkUpsertWorkflowStates([
        result ? scannerWatchlistPatch(result, wlId, scanContextOptions()) : scannerWatchlistPatch(symbol, wlId, scanContextOptions()),
      ])
      setWorkflowMarks(prev => ({ ...prev, [symbol]: 'watch' }))
      trackEvent('add_to_watchlist', { source: 'scanner', symbol, watchlist_id: wlId })
      showToast(`${symbol} added`)
    } catch {
      showToast(scannerWatchlistAddFailure(symbol))
    }
  }

  async function markWorkflow(symbols: string[], label: 'shortlist' | 'ignored' | 'review_later') {
    if (symbols.length === 0) return
    setWorkflowMarks(prev => {
      const next = { ...prev }
      for (const symbol of symbols) next[symbol] = label
      return next
    })
    await bulkUpsertWorkflowStates(symbols.map(symbol => {
      const result = results.find((row) => row.symbol === symbol)
      return scannerWorkflowPatch(symbol, label, undefined, result, scanContextOptions())
    }))
    trackEvent(label === 'shortlist' ? 'scanner_shortlist' : label === 'review_later' ? 'scanner_review_later' : 'scanner_ignore', {
      count: symbols.length,
    })
    showToast(`${symbols.length} ${symbols.length === 1 ? 'symbol' : 'symbols'} marked ${label === 'shortlist' ? 'shortlist' : label.replace('_', ' ')}`)
  }

  function fallbackCopyText(text: string) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  async function copyTradingViewSymbols(symbols: string[]) {
    const formatted = tradingViewNseSymbols(symbols)
    if (!formatted) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formatted)
      } else {
        fallbackCopyText(formatted)
      }
      trackEvent('scanner_tradingview_symbols_copied', { count: symbols.length })
      showToast(`Copied ${symbols.length} TradingView ${symbols.length === 1 ? 'symbol' : 'symbols'}`)
    } catch {
      showToast('Could not copy TradingView symbols. Try Review charts or copy from the table.')
    }
  }

  function exportScannerCsv(rows: ScanResult[]) {
    if (rows.length === 0) return
    const headers = visibleColumns.map(col => col.label)
    const lines = [
      headers.join(','),
      ...rows.map(row => visibleColumns.map(col => {
        const raw = formatScannerColumnValue(col.id, row)
        const escaped = raw.includes(',') || raw.includes('"') ? `"${raw.replace(/"/g, '""')}"` : raw
        return escaped
      }).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `alphavyuh-scanner-${tradeDate || 'results'}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${rows.length} rows to CSV`)
  }

  const openScannerChart = useCallback(async (result: ScanResult) => {
    await bulkUpsertWorkflowStates([
      scannerWorkflowPatch(result.symbol, 'shortlist', undefined, result, scanContextOptions()),
    ])
    trackEvent('scanner_chart_review_opened', { symbol: result.symbol, preset: activePreset ?? 'custom' })
    router.push(`/charts/${result.symbol}?from=scanner&full=1`)
  }, [activePreset, router, scanContextOptions])

  function selectedSymbols() {
    return selectedScannerSymbols(results, selectedResults)
  }

  async function createWatchlistFromResults() {
    if (!newWlName.trim()) return
    try {
      setError('')
      const wl = await createWatchlist(newWlName.trim())
      const toAdd = selectedResults.size > 0 ? results.filter(r => selectedResults.has(r.symbol)) : results
      const rowsToAdd = toAdd.slice(0, 50)
      const addedRows: ScanResult[] = []
      let failureCount = 0
      for (const row of rowsToAdd) {
        try {
          await addSymbolToWatchlist(wl.id, row.symbol)
          addedRows.push(row)
        } catch {
          failureCount += 1
        }
      }
      if (addedRows.length > 0) {
        await bulkUpsertWorkflowStates(scannerWatchlistPatches(addedRows, wl.id, scanContextOptions()))
      }
      if (failureCount) {
        const message = `${failureCount}/${rowsToAdd.length} symbols could not be added to "${wl.name}". ${WATCHLIST_ADD_FAILED_MESSAGE}`
        setError(message)
        showToast(message)
        return
      }
      const symbols = addedRows.map((row) => row.symbol)
      trackEvent('add_to_watchlist', { source: 'scanner_bulk_create', count: symbols.length, watchlist_id: wl.id })
      setShowWlModal(false); setNewWlName('')
      showToast(`"${wl.name}" created`)
      const focusParam = symbols[0] ? `&symbol=${encodeURIComponent(symbols[0])}` : ""
      router.push(`/watchlist?id=${wl.id}${focusParam}`)
    } catch {
      const message = WATCHLIST_CREATION_FAILED_MESSAGE
      setError(message)
      showToast(message)
    }
  }

  function setF(key: keyof Filters, val: unknown) {
    setFilters(f => ({ ...f, [key]: val }))
    clearActiveDefinition()
    setActivePreset('custom')
    setActiveScreenName(null)
    setActiveScreenId(null)
  }

  function rangeRow(label: string, minK: keyof Filters, maxK: keyof Filters) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['min', 'max'] as const).map((t, i) => {
            const k = i === 0 ? minK : maxK
            return (
              <input key={t} type="number" placeholder={t} value={(filters[k] as string) || ''}
                onChange={e => setF(k, e.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
            )
          })}
        </div>
      </div>
    )
  }

  function numberRow(label: string, key: keyof Filters, placeholder = 'value') {
    return (
      <div style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>{label}</div>
        <input
          type="number"
          placeholder={placeholder}
          value={(filters[key] as string) || ''}
          onChange={e => setF(key, e.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
    )
  }

  function numRow(label: string, k: keyof Filters, placeholder = '') {
    return (
      <div style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>{label}</div>
        <input type="number" placeholder={placeholder} value={(filters[k] as string) || ''}
          onChange={e => setF(k, e.target.value)} style={inputStyle} />
      </div>
    )
  }

  function segRow(label: string, k: keyof Filters, opts: { value: string; label: string }[]) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>{label}</div>
        <div className="scanner-filter-seg-options">
          {opts.map(o => {
            const active = filters[k] === o.value
            return (
              <button key={o.value} onClick={() => setF(k, active ? '' : o.value)} style={{
                padding: '3px 9px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                transition: 'all var(--motion-instant) var(--ease-out)',
              }}>{o.label}</button>
            )
          })}
        </div>
      </div>
    )
  }

  function toggleRow(label: string, key: 'new_52w_high' | 'new_52w_low' | 'is_inside_bar' | 'all_emas_bullish' | 'all_smas_bullish' | 'vcp_contraction' | 'ema50_above_ema150' | 'ema150_above_ema200' | 'ema_200_trending_up' | 'nr7') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!filters[key]} onChange={e => setF(key, e.target.checked)}
          style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      </label>
    )
  }

  const resetFilters = () => {
    setFilters(emptyFilters())
    setActivePreset(null)
    setActiveScreenName(null)
    setActiveScreenId(null)
    clearActiveDefinition()
    setActiveCompositionName(null)
    setResults([])
    setError('')
    setHasRun(false)
    setCurrentPage(1)
    setTotalPages(1)
  }

  function dismissFilterChip(patch: Partial<ScannerFilterState>, clearPreset = false) {
    if (clearPreset) {
      setActivePreset(null)
      setActiveScreenName(null)
      setActiveScreenId(null)
      clearActiveDefinition()
      setFilters(emptyFilters())
      return
    }
    setFilters(prev => ({ ...prev, ...patch }))
    setActivePreset(null)
    setActiveScreenName(null)
    setActiveScreenId(null)
    clearActiveDefinition()
  }

  const activePresetMeta = PRESETS.find(p => p.id === activePreset) ?? null
  const activePresetLabel = activePresetMeta?.name ?? activeDefinitionName ?? activeScreenName
  const selectedCompositionCount = savedScreens.filter(screen => selectedScreenIds.has(screen.id)).length
  const pageSizeOptions = [
    { value: 25, label: '25' },
    { value: 50, label: '50' },
    { value: 150, label: '150' },
    { value: 200, label: '200 max' },
  ] satisfies Array<{ value: 25 | 50 | 150 | 200; label: string }>;
  const visibleStart = totalMatches === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const visibleEnd = totalMatches === 0 ? 0 : Math.min(totalMatches, visibleStart + results.length - 1);
  const paginationWindow = 2;
  const pageWindowStart = Math.max(1, currentPage - paginationWindow);
  const pageWindowEnd = Math.min(totalPages, currentPage + paginationWindow);
  const pageNumbers = Array.from(
    { length: Math.max(0, pageWindowEnd - pageWindowStart + 1) },
    (_, idx) => pageWindowStart + idx,
  );
  const visibleColumns = useMemo(() => resolveScannerColumns(visibleColumnIds), [visibleColumnIds]);
  const filteredResults = useMemo(() => {
    const query = resultSymbolFilter.trim().toUpperCase()
    if (!query) return results
    return results.filter(row =>
      row.symbol.toUpperCase().includes(query) ||
      (row.company_name?.toUpperCase().includes(query) ?? false),
    )
  }, [resultSymbolFilter, results])
  const fundamentalsMissingCount = useMemo(
    () => countResultsMissingCoreFundamentals(results),
    [results],
  )
  const renderedResults = useMemo(
    () => filteredResults.slice(0, renderedRowLimit),
    [filteredResults, renderedRowLimit],
  )
  const hasDeferredScannerRows = renderedResults.length < filteredResults.length
  const scannerChartPrefetchKey = renderedResults
    .slice(0, SCANNER_CHART_PREFETCH_LIMIT)
    .map(row => row.symbol)
    .join(',')

  const prefetchScannerChart = useCallback((symbol: string) => {
    const request = getWatchlistChartRequest('3M')
    prefetchCandles(symbol, {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    })
  }, [])

  useEffect(() => {
    setRenderedRowLimit(Math.min(INITIAL_SCANNER_ROW_RENDER_LIMIT, filteredResults.length))
  }, [filteredResults.length, currentPage, resultSymbolFilter, resultsView])

  useEffect(() => {
    setFocusedRowIndex(-1)
  }, [filteredResults.length, resultSymbolFilter, currentPage, resultsView])

  useEffect(() => {
    if (resultsView !== 'list' || !scannerChartPrefetchKey) return
    const cacheKey = `${tradeDate || 'pending'}:${scannerChartPrefetchKey}`
    if (prefetchedScannerChartKeyRef.current === cacheKey) return
    prefetchedScannerChartKeyRef.current = cacheKey

    const timer = window.setTimeout(() => {
      renderedResults
        .slice(0, SCANNER_CHART_PREFETCH_LIMIT)
        .forEach(row => prefetchScannerChart(row.symbol))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [prefetchScannerChart, renderedResults, resultsView, scannerChartPrefetchKey, tradeDate])

  useEffect(() => {
    if (resultsView !== 'list' || filteredResults.length === 0) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        if (event.key === 'Escape') {
          (target as HTMLElement).blur()
        }
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        symbolFilterRef.current?.focus()
        return
      }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        setFocusedRowIndex(prev => {
          if (renderedResults.length === 0) return -1
          if (prev < 0) return event.key === 'j' ? 0 : renderedResults.length - 1
          const next = event.key === 'j' ? prev + 1 : prev - 1
          return Math.max(0, Math.min(renderedResults.length - 1, next))
        })
        return
      }
      if (focusedRowIndex < 0 || focusedRowIndex >= renderedResults.length) return
      const row = renderedResults[focusedRowIndex]
      if (event.key === 'Enter') {
        event.preventDefault()
        void openScannerChart(row)
      }
      if (event.key === ' ') {
        event.preventDefault()
        setSelectedResults(prev => {
          const next = new Set(prev)
          if (next.has(row.symbol)) next.delete(row.symbol)
          else next.add(row.symbol)
          return next
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredResults.length, focusedRowIndex, renderedResults, resultsView, openScannerChart])

  useEffect(() => {
    if (focusedRowIndex < 0) return
    const result = renderedResults[focusedRowIndex]
    if (result) prefetchScannerChart(result.symbol)
    const row = resultsScrollRef.current?.querySelector(`[data-scanner-row-index="${focusedRowIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [focusedRowIndex, prefetchScannerChart, renderedResults])

  function handleColumnSort(sortKey: string) {
    const newDesc = sortKey === sortBy ? !sortDesc : true
    setSortBy(sortKey)
    setSortDesc(newDesc)
    setCurrentPage(1)
    if (hasRun) runScan(undefined, sortKey, newDesc, 1, pageSize)
  }

  function toggleVisibleColumn(id: ScannerColumnId, checked: boolean) {
    setVisibleColumnIds(prev => {
      const next = checked ? [...prev, id] : prev.filter(col => col !== id)
      const resolved = next.length > 0 ? next : [...SCANNER_DEFAULT_COLUMN_IDS]
      setActiveColumnPreset(detectColumnPreset(resolved))
      persistScannerVisibleColumns(resolved)
      if (activeScreenId) {
        persistScreenColumnBundle(activeScreenId, detectColumnPreset(resolved), resolved)
      }
      return resolved
    })
  }

  return (
    <div className="workspace-page">
      <div className="workspace-desk-header calm-desk-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="calm-page-title">Scanner</h1>
          {countActiveFilters(filters) > 0 && (
            <span style={{
              background: 'rgba(0,217,167,0.10)',
              color: '#00D9A7',
              fontSize: 11,
              borderRadius: 20,
              padding: '2px 8px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {countActiveFilters(filters)} filter{countActiveFilters(filters) !== 1 ? 's' : ''} active
            </span>
          )}
        </div>
        <p className="calm-page-copy">Choose a screener, refine filters if needed, then run scan when you are ready.</p>
      </div>
      <div
        className={`workspace-grid scanner-workspace-grid${filterRailCollapsed ? ' scanner-filter-rail-collapsed' : ''}`}
        style={{
          gridTemplateColumns: filterRailCollapsed
            ? '48px minmax(0, 1fr)'
            : `${filterRailWidth}px minmax(0, 1fr)`,
        }}
      >

      {filterDrawerOpen && (
        <button
          type="button"
          className="scanner-filter-drawer-backdrop"
          aria-label="Close filters"
          onClick={() => setFilterDrawerOpen(false)}
        />
      )}

      {/* ── LEFT PANEL ── */}
      <div
        className={`workspace-card workspace-card-muted scanner-filter-rail${filterDrawerOpen ? ' scanner-filter-drawer-open' : ''}${filterRailCollapsed ? ' scanner-filter-rail-icons' : ''}`}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="scanner-filter-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0', flexShrink: 0 }}>
          {!filterRailCollapsed && <div className="label">Filters</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button
              type="button"
              className="workspace-chip-button scanner-filter-rail-toggle"
              aria-label={filterRailCollapsed ? 'Expand filters' : 'Collapse filters'}
              data-testid="scanner-filter-rail-toggle"
              onClick={() => setFilterRailCollapsed(collapsed => !collapsed)}
            >
              {filterRailCollapsed ? '▸' : '◂'}
            </button>
            <button
              type="button"
              className="scanner-filter-drawer-close"
              aria-label="Close filters"
              onClick={() => setFilterDrawerOpen(false)}
            >
              ×
            </button>
          </div>
        </div>

        <div className="scanner-filter-rail-body">
        {/* Presets */}
        <div className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="label" style={{ marginBottom: 8 }}>Screeners</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {SCREENER_CATEGORIES.map((category) => {
              const categoryPresets = category.presetIds
                .map((id) => PRESETS.find((preset) => preset.id === id))
                .filter((preset): preset is Preset => preset != null)
              const showAll = expandedPresetGroups.has(category.id)
              const visiblePresets = showAll
                ? categoryPresets
                : categoryPresets.slice(0, PRESETS_VISIBLE_PER_GROUP)
              return (
                <div key={category.id} className="scanner-preset-group" data-testid={`scanner-preset-group-${category.id}`}>
                  <div className="scanner-preset-group-label">{category.label}</div>
                  <div className="scanner-preset-group-list">
                    {visiblePresets.map((p) => {
                      const active = activePreset === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => selectPreset(p)}
                          title={p.description}
                          className={`workspace-chip-button${active ? ' active' : ''}`}
                          style={{
                            justifyContent: 'center',
                            minHeight: 34,
                            padding: '7px 10px',
                            borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                  {categoryPresets.length > PRESETS_VISIBLE_PER_GROUP && (
                    <button
                      type="button"
                      className="scanner-preset-group-toggle"
                      onClick={() => setExpandedPresetGroups((current) => togglePresetGroupExpanded(current, category.id))}
                      data-testid={`scanner-preset-group-toggle-${category.id}`}
                      aria-expanded={showAll}
                    >
                      {showAll ? 'Show less' : 'Show all'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Saved screens */}
        {savedScreens.length > 0 && (
          <div className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 236, overflowY: 'auto', flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 8 }}>My screens</div>
            {savedScreens.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedScreenIds.has(s.id)}
                  onChange={e => toggleCompositionScreen(s.id, e.target.checked)}
                  aria-label={`Select saved screen ${s.name}`}
                  style={{ accentColor: 'var(--accent)', width: 13, height: 13, flex: '0 0 auto' }}
                />
                <button onClick={() => loadScreen(s)} style={{
                  flex: 1, textAlign: 'left', padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                  background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.name}</button>
                <button
                  onClick={() => handleDeleteScreen(s.id, s.name)}
                  aria-label={`Delete saved screen ${s.name}`}
                  title={`Delete saved screen ${s.name}`}
                  data-testid={`scanner-screen-delete-${s.id}`}
                  style={{ color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              {(['and', 'or'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setCompositionMode(mode)}
                  className={`workspace-chip-button${compositionMode === mode ? ' active' : ''}`}
                  style={{ justifyContent: 'center', minHeight: 30 }}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              className="workspace-chip-button"
              onClick={runSavedScreenComposition}
              disabled={selectedCompositionCount < 2 || composingScreens}
              style={{
                width: '100%',
                justifyContent: 'center',
                marginTop: 6,
                opacity: selectedCompositionCount < 2 || composingScreens ? 0.48 : 1,
              }}
            >
              {composingScreens ? 'Combining…' : `Combine ${selectedCompositionCount || 0} screens`}
            </button>
          </div>
        )}
        <div className="workspace-section" data-testid="scanner-definitions-section" style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 280, overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div className="label">Definitions</div>
            <button type="button" className="workspace-chip-button" onClick={openNewDefinitionBuilder} data-testid="scanner-definition-new">
              Build
            </button>
          </div>
          {scannerDefinitions.length === 0 && !scannerDefinitionsError && (
            <div className="caption" style={{ lineHeight: 1.5 }}>Store a reusable universe and filter tree for the scanner lineage.</div>
          )}
          {scannerDefinitions.map((definition) => {
            const mapping = scannerDefinitionToRunMapping(definition)
            const active = activeDefinitionId === definition.id
            return (
              <div key={definition.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <button
                  type="button"
                  onClick={() => applyScannerDefinition(definition)}
                  data-testid={`scanner-definition-use-${definition.id}`}
                  style={{ flex: 1, textAlign: 'left', padding: '5px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, background: active ? 'var(--accent-subtle)' : 'var(--surface-2)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, color: active ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {definition.name}
                </button>
                <button type="button" className="workspace-chip-button" onClick={() => { setEditingDefinition(definition); setShowDefinitionBuilder(true) }} aria-label={`Edit scanner definition ${definition.name}`} title={`Edit scanner definition ${definition.name}`}>
                  Edit
                </button>
                <button type="button" onClick={() => void handleDeleteDefinition(definition)} aria-label={`Delete scanner definition ${definition.name}`} title={`Delete scanner definition ${definition.name}`} style={{ color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                {!mapping.runnable && <span title="This definition cannot run until its unsupported filters are resolved." style={{ color: 'var(--warn)', fontSize: 12 }}>!</span>}
              </div>
            )
          })}
          {scannerDefinitionsError && (
            <div style={{ marginTop: 8 }}>
              <div className="caption" style={{ color: 'var(--warn)', marginBottom: 6 }}>{scannerDefinitionsError}</div>
              <button type="button" className="workspace-chip-button" onClick={loadScannerDefinitions}>Retry</button>
            </div>
          )}
        </div>
        {savedScreensError && (
          <div className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 6, color: 'var(--warn)' }}>My screens unavailable</div>
            <div className="caption" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{savedScreensError}</div>
            <button className="workspace-chip-button" onClick={loadSavedScreens}>
              Retry
            </button>
          </div>
        )}
        {watchlistsError && (
          <div data-testid="scanner-watchlists-outage" className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 6, color: 'var(--warn)' }}>Watchlists unavailable</div>
            <div className="caption" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{watchlistsError}</div>
            <button className="workspace-chip-button" onClick={loadWatchlists}>
              Retry
            </button>
          </div>
        )}

        <div className="scanner-filter-tabs" data-testid="scanner-filter-tabs">
          {(['technicals', 'fundamentals'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`scanner-filter-tab${filterTab === tab ? ' active' : ''}`}
              onClick={() => setFilterTab(tab)}
              data-testid={`scanner-filter-tab-${tab}`}
            >
              {tab === 'technicals' ? 'Technicals' : 'Fundamentals'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360 }}>
        {filterTab === 'technicals' ? (
            <>
              <FilterSection sectionId="price-change" title="Price and change" activeCount={filterSectionActiveCount('price-change')}>
                {rangeRow('Price (₹)', 'price_min', 'price_max')}
                {rangeRow('Change %', 'pct_change_min', 'pct_change_max')}
              </FilterSection>
              <FilterSection sectionId="liquidity" title="Liquidity" activeCount={filterSectionActiveCount('liquidity')}>
                {rangeRow('Vol ratio (× avg)', 'volume_ratio_min', 'volume_ratio_max')}
              </FilterSection>
              <FilterSection sectionId="trend-quality" title="Trend quality" activeCount={filterSectionActiveCount('trend-quality')}>
                {segRow('vs EMA 20', 'price_vs_ema20', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs EMA 50', 'price_vs_ema50', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs EMA 150', 'price_vs_ema150', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs EMA 200', 'price_vs_ema200', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs SMA 50', 'price_vs_sma50', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs SMA 150', 'price_vs_sma150', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs SMA 200', 'price_vs_sma200', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('EMA 20 vs 50', 'ema20_vs_ema50', [{ value: 'golden', label: 'Golden' }, { value: 'death', label: 'Death' }])}
                {segRow('EMA 50 vs 200', 'ema50_vs_ema200', [{ value: 'golden', label: 'Golden' }, { value: 'death', label: 'Death' }])}
                {toggleRow('EMA 50 above EMA 150', 'ema50_above_ema150')}
                {toggleRow('EMA 150 above EMA 200', 'ema150_above_ema200')}
                {toggleRow('All EMAs bullish (20>50>200)', 'all_emas_bullish')}
                {toggleRow('All SMAs bullish (close>50>150>200)', 'all_smas_bullish')}
              </FilterSection>
              <FilterSection sectionId="relative-strength" title="Relative strength" activeCount={filterSectionActiveCount('relative-strength')}>
                {rangeRow('RSI 14', 'rsi_min', 'rsi_max')}
                {rangeRow('ADX 14', 'adx_min', 'adx_max')}
                {segRow('MACD histogram', 'macd_hist_positive', [{ value: 'positive', label: 'Positive' }, { value: 'negative', label: 'Negative' }])}
              </FilterSection>
              <FilterSection sectionId="setup-structure" title="Setup structure" activeCount={filterSectionActiveCount('setup-structure')}>
                {toggleRow('VCP contraction pass', 'vcp_contraction')}
                {numberRow('VCP minimum pivots', 'vcp_min_pivots', '2')}
                {numberRow('VCP max depth %', 'vcp_max_depth_pct', '15')}
                {numberRow('Pivot proximity %', 'vcp_pivot_proximity_pct', '10')}
                {segRow('Position', 'bb_position', [
                  { value: 'above_upper', label: 'Above upper' },
                  { value: 'below_lower', label: 'Below lower' },
                  { value: 'near_upper', label: 'Near upper' },
                  { value: 'near_lower', label: 'Near lower' },
                  { value: 'inside', label: 'Inside' },
                ])}
                {rangeRow('BB Width', 'bb_width_min', 'bb_width_max')}
              </FilterSection>
              <FilterSection sectionId="volatility-risk" title="Volatility and risk" activeCount={filterSectionActiveCount('volatility-risk')}>
                {rangeRow('ATR % of price', 'atr_pct_min', 'atr_pct_max')}
              </FilterSection>
              <FilterSection sectionId="week-range" title="52-week range" activeCount={filterSectionActiveCount('week-range')}>
                {numRow('Max % below 52W high', 'week_52_high_pct_max', 'e.g. 25')}
                {numRow('Min % above 52W low', 'w52l_pct_min', 'e.g. 30')}
                {numRow('RS Score ≥', 'rs_score_min', 'e.g. 70')}
                {toggleRow('New 52W high today', 'new_52w_high')}
                {toggleRow('New 52W low today', 'new_52w_low')}
              </FilterSection>
              <FilterSection sectionId="candle-patterns" title="Candle patterns" activeCount={filterSectionActiveCount('candle-patterns')}>
                {toggleRow('Inside bar', 'is_inside_bar')}
              </FilterSection>
            </>
        ) : (
            <>
              <FilterSection sectionId="market-cap" title="Market cap" activeCount={filterSectionActiveCount('market-cap')}>
                {rangeRow('Market cap (₹ Cr)', 'market_cap_min', 'market_cap_max')}
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: -4, marginBottom: 6, lineHeight: 1.5 }}>
                  Large: 20000+  ·  Mid: 5000–20000  ·  Small: &lt;5000
                </div>
              </FilterSection>
              <FilterSection sectionId="valuation" title="Valuation" activeCount={filterSectionActiveCount('valuation')}>
                {rangeRow('P/E ratio', 'pe_min', 'pe_max')}
                {rangeRow('P/B ratio', 'pb_min', 'pb_max')}
                {rangeRow('EPS (₹)', 'eps_min', 'eps_max')}
              </FilterSection>
              <FilterSection sectionId="returns-efficiency" title="Returns and efficiency" activeCount={filterSectionActiveCount('returns-efficiency')}>
                {numRow('ROE ≥ %', 'roe_min', 'e.g. 15')}
                {numRow('ROCE ≥ %', 'roce_min', 'e.g. 15')}
              </FilterSection>
              <FilterSection sectionId="dividends-debt" title="Dividends & Debt" activeCount={filterSectionActiveCount('dividends-debt')}>
                {rangeRow('Dividend yield %', 'dividend_yield_min', 'dividend_yield_max')}
                {numRow('Debt/Equity ≤', 'debt_to_equity_max', 'e.g. 1')}
              </FilterSection>
            </>
        )}
        </div>

        {/* Bottom actions */}
        <div className="workspace-section" style={{ borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <Button
            variant="primary"
            size="md"
            onClick={() => { setFilterDrawerOpen(false); void runScan() }}
            loading={loading}
            fullWidth
          >
            Run scan
          </Button>
          <div style={{ display: 'flex', gap: 6 }}>
            {results.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowSaveModal(true)} fullWidth>
                Save screen
              </Button>
            )}
            {results.length > 0 && (
              <Button variant="ghost" size="sm" onClick={openAlertModal} fullWidth>
                Add alert
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={resetFilters} fullWidth>
              Reset
            </Button>
          </div>
        </div>
        </div>
        {!filterRailCollapsed && (
          <div
            className="scanner-filter-resize-handle"
            data-testid="scanner-filter-resize-handle"
            onMouseDown={startFilterRailResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize filter panel"
          />
        )}
      </div>

      {/* ── CENTER: Results ── */}
      <div className="workspace-card" style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Results header */}
        <div className="scanner-results-header">
          {hasRun ? (
            <div className="scanner-results-toolbar">
              <div className="scanner-toolbar-primary workspace-toolbar-group">
                <button
                  type="button"
                  className="workspace-chip-button scanner-mobile-filters-trigger"
                  onClick={() => setFilterDrawerOpen(true)}
                  data-testid="scanner-mobile-filters-trigger"
                >
                  Filters
                </button>
                <span className="heading-card" data-testid="scanner-match-summary">
                  {totalMatches > 0 ? (
                    <>
                      <Num>{totalMatches.toLocaleString('en-IN')}</Num> matches
                      {symbolsScanned != null && scanTrust?.universeSize != null ? (
                        <span className="caption" style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>
                          from <Num>{symbolsScanned.toLocaleString('en-IN')}</Num> pre-filtered symbols (<Num>{scanTrust.universeSize.toLocaleString('en-IN')}</Num> universe)
                        </span>
                      ) : null}
                    </>
                  ) : 'No matches'}
                </span>
                <div className="scanner-view-tier-primary">
                  <button
                    type="button"
                    className={`workspace-chip-button${resultsView === 'list' ? ' active' : ''}`}
                    onClick={() => setResultsView('list')}
                    data-testid="scanner-view-list"
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className={`workspace-chip-button${resultsView === 'charts' ? ' active' : ''}`}
                    onClick={() => setResultsView('charts')}
                    data-testid="scanner-view-charts"
                  >
                    Charts
                  </button>
                  {(['2-up', '4-up'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      className={`workspace-chip-button${resultsView === 'charts' && chartsLayout === option ? ' active' : ''}${resultsView !== 'charts' ? ' scanner-view-tier-muted' : ''}`}
                      onClick={() => {
                        setResultsView('charts')
                        setChartsLayout(option)
                      }}
                      data-testid={`scanner-charts-layout-${option}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <input
                  ref={symbolFilterRef}
                  value={resultSymbolFilter}
                  onChange={(e) => setResultSymbolFilter(e.target.value)}
                  placeholder="Filter symbols (/)"
                  className="scanner-symbol-filter"
                  data-testid="scanner-result-symbol-filter"
                  aria-label="Filter scan results by symbol or company name"
                />
                {selectedResults.size > 0 && (
                  <span className="workspace-pill" aria-live="polite">
                    <Num>{selectedResults.size}</Num> selected
                  </span>
                )}
                <select
                  value={String(pageSize)}
                  onChange={e => {
                    const nextSize = Number(e.target.value) as 25 | 50 | 150 | 200
                    setPageSize(nextSize)
                    setCurrentPage(1)
                    if (hasRun) runScan(undefined, sortBy, sortDesc, 1, nextSize)
                  }}
                  style={{ fontSize: 11, padding: '7px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                >
                  {pageSizeOptions.map(option => (
                    <option key={option.label} value={option.value}>
                      {option.value === 200 ? '200 / page (scan cap)' : `${option.label} / page`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="scanner-toolbar-lens workspace-toolbar-group">
                <div className="scanner-view-tier-secondary">
                  {SCANNER_COLUMN_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`workspace-chip-button${activeColumnPreset === preset.id ? ' active' : ''}`}
                      onClick={() => applyColumnPreset(preset.id)}
                      data-testid={`scanner-column-preset-${preset.id}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`workspace-chip-button${rowDensity === 'compact' ? ' active' : ''}`}
                    onClick={() => setRowDensity(density => density === 'compact' ? 'comfortable' : 'compact')}
                    data-testid="scanner-row-density-toggle"
                    title="Toggle compact row density"
                  >
                    {rowDensity === 'compact' ? 'Compact' : 'Comfort'}
                  </button>
                  <button
                    type="button"
                    className={`workspace-chip-button${heatmapEnabled ? ' active' : ''}`}
                    onClick={() => setHeatmapEnabled(enabled => !enabled)}
                    data-testid="scanner-heatmap-toggle"
                  >
                    Heatmap
                  </button>
                  <button
                    type="button"
                    className={`workspace-chip-button${columnsPickerOpen ? ' active' : ''}`}
                    onClick={() => setColumnsPickerOpen(open => !open)}
                    data-testid="scanner-columns-toggle"
                  >
                    Columns
                  </button>
                </div>
                <select
                  className="scanner-view-options-select"
                  data-testid="scanner-view-options-select"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'trader' || value === 'vcp' || value === 'fundamentals') {
                      applyColumnPreset(value)
                    } else if (value === 'comfort') {
                      setRowDensity(density => density === 'compact' ? 'comfortable' : 'compact')
                    } else if (value === 'heatmap') {
                      setHeatmapEnabled(enabled => !enabled)
                    } else if (value === 'columns') {
                      setColumnsPickerOpen(true)
                    }
                    e.currentTarget.value = ''
                  }}
                  aria-label="View options"
                >
                  <option value="" disabled>View options</option>
                  {SCANNER_COLUMN_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.label} lens</option>
                  ))}
                  <option value="comfort">{rowDensity === 'compact' ? 'Comfort rows' : 'Compact rows'}</option>
                  <option value="heatmap">{heatmapEnabled ? 'Hide heatmap' : 'Show heatmap'}</option>
                  <option value="columns">Columns…</option>
                </select>
              </div>
              <div className="scanner-toolbar-secondary workspace-toolbar-group">
                <div className="scanner-toolbar-actions">
                  <Button size="sm" variant="secondary" onClick={() => setShowWlModal(true)}>
                    Create watchlist
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyTradingViewSymbols(selectedResults.size > 0 ? selectedSymbols() : filteredResults.map(r => r.symbol))}
                    data-testid="scanner-copy-tv-symbols"
                  >
                    Copy TV symbols
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportScannerCsv(filteredResults)}
                    data-testid="scanner-export-csv"
                  >
                    Export CSV
                  </Button>
                </div>
                <button
                  type="button"
                  className={`workspace-chip-button${historyOpen ? ' active' : ''}`}
                  onClick={() => setHistoryOpen(o => !o)}
                  data-testid="scanner-history-toggle"
                  title="View past scan results for this preset"
                >
                  History
                </button>
                {selectedResults.size > 0 && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => markWorkflow(selectedSymbols(), 'shortlist')}>
                      Shortlist
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push(buildMultiChartReviewHref(selectedSymbols(), { source: 'scanner' }))}>
                      Review charts
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markWorkflow(selectedSymbols(), 'review_later')}>
                      Review later
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markWorkflow(selectedSymbols(), 'ignored')}>
                      Ignore
                    </Button>
                  </>
                )}
              </div>
              <div className="scanner-toolbar-tertiary workspace-toolbar-group" data-testid="scanner-data-trust">
                {(activeCompositionName || (activePresetLabel && !activeCompositionName)) && (
                  <span
                    className="workspace-pill"
                    style={{ color: activeCompositionName ? 'var(--accent)' : 'var(--text-secondary)' }}
                    data-testid="scanner-active-preset-pill"
                  >
                    {activeCompositionName ?? activePresetLabel}
                  </span>
                )}
                {tradeDate && (
                  <span className="workspace-pill" style={{ color: 'var(--text-tertiary)' }} data-testid="scanner-trade-date-pill">
                    {tradeDate}
                  </span>
                )}
                {scanTrust && (
                  <span className="workspace-pill scanner-meta-pill" title={scanTrust.message ?? scanTrust.source}>
                    {hasCachedResults ? 'Cached results · ' : ''}Source: {scanTrust.source}{scanTrust.coveragePct != null ? ` · Coverage: ${scanTrust.coveragePct}%` : ''}
                  </span>
                )}
                {(loading || scanElapsedMs != null) && (
                  <span
                    className="workspace-pill scanner-meta-pill"
                    style={{ color: loading ? 'var(--text-secondary)' : (scanElapsedMs != null && scanElapsedMs > 3000 ? 'var(--warn)' : 'var(--text-secondary)') }}
                    data-testid="scanner-scan-time"
                  >
                    {loading ? 'Scanning…' : `Scanned in ${(scanElapsedMs! / 1000).toFixed(1)}s`}
                  </span>
                )}
                {scanTrust?.universeSize != null && symbolsScanned != null && (
                  <span
                    className="workspace-pill scanner-meta-pill"
                    data-testid="scanner-coverage-pill"
                    title={`${symbolsScanned.toLocaleString('en-IN')} symbols passed liquidity/price pre-filters before the scan ran`}
                  >
                    <Num>{symbolsScanned.toLocaleString('en-IN')}</Num> / <Num>{scanTrust.universeSize.toLocaleString('en-IN')}</Num> symbols
                  </span>
                )}
                {incompleteIndicatorCount > 0 && (
                  <span className="workspace-pill" style={{ color: 'var(--warn)' }} data-testid="scanner-incomplete-warning">
                    <Num>{incompleteIndicatorCount}</Num> with incomplete indicator data
                  </span>
                )}
                {fundamentalsMissingCount > 0 && (
                  <span
                    className="workspace-pill scanner-meta-pill"
                    style={{ color: 'var(--text-tertiary)' }}
                    data-testid="scanner-fundamentals-coverage-pill"
                    title={`${fundamentalsMissingCount.toLocaleString('en-IN')} result${fundamentalsMissingCount === 1 ? '' : 's'} missing P/E, P/B, ROE, and ROCE`}
                  >
                    <Num>{fundamentalsMissingCount}</Num> missing fundamentals
                  </span>
                )}
                {loading && results.length > 0 && (
                  <span className="workspace-pill" style={{ color: 'var(--warn)' }}>
                    Refreshing scan…
                  </span>
                )}
                {isLimited && (
                  <span className="workspace-pill" style={{ background: 'var(--warn-subtle)', color: 'var(--warn)' }}>
                    Free plan · 200 cap
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="scanner-toolbar-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%' }}>
              <div>
                <div className="workspace-card-title">Results</div>
                <div className="workspace-card-copy">
                  {loading ? 'Scanning…' : 'Select a screener or filters, then click Run scan.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="workspace-chip-button scanner-mobile-filters-trigger"
                  onClick={() => setFilterDrawerOpen(true)}
                  data-testid="scanner-mobile-filters-trigger"
                >
                  Filters
                </button>
                <button
                  type="button"
                  className={`workspace-chip-button${historyOpen ? ' active' : ''}`}
                  onClick={() => setHistoryOpen(o => !o)}
                  data-testid="scanner-history-toggle"
                  title="View past scan results for this preset"
                >
                  History
                </button>
              </div>
            </div>
          )}
        </div>

        {(hasRun || activePreset || activeScreenName) && (
          <ScannerFilterChips
            filters={filters}
            activePresetName={activePresetLabel}
            onDismiss={dismissFilterChip}
          />
        )}

        {savedScreens.length > 0 && (
          <ScannerScreenTabs
            screens={savedScreens}
            activeScreenId={activeScreenId}
            onSelect={loadScreen}
          />
        )}

        {scanTrust && (scanTrust.mode === 'live' || scanTrust.mode === 'eod' || scanTrust.mode === 'demo') && (
          <ScannerTrustBanner mode={scanTrust.mode} asOf={scanTrust.asOf} source={scanTrust.source} />
        )}

        {selectedResults.size > 0 && (
          <ScannerSelectionPanel
            symbols={selectedSymbols()}
            watchlists={watchlists}
            onClear={() => setSelectedResults(new Set())}
            onAddToWatchlist={async (watchlistId) => {
              for (const symbol of selectedSymbols()) {
                await addToWatchlist(symbol, watchlistId)
              }
              showToast(`${selectedResults.size} symbols added to watchlist`)
            }}
            onReviewCharts={() => router.push(buildMultiChartReviewHref(selectedSymbols(), { source: 'scanner' }))}
          />
        )}

        {recoveryMode && hasRun && !error && (
          <div
            data-testid="scanner-recovery-banner"
            style={{ margin: '12px 16px', padding: '10px 14px', background: 'var(--warn-subtle)', border: '1px solid rgba(217,119,6,0.24)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--warn)', lineHeight: 1.6 }}
          >
            Read-only recovery is active while the Railway scanner API is unavailable. VCP and multi-day pivot filters need the full API; single-day EOD presets still run against the latest Supabase session.
          </div>
        )}

        {historyOpen && (
          <div className="scanner-history-panel" data-testid="scanner-history-panel">
            {runHistory.length === 0 ? (
              <div className="caption" style={{ padding: '12px 14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                No past scans saved yet. Run a scan to record results.
              </div>
            ) : (
          <div
            data-testid="scanner-run-history"
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div className="label">Run history</div>
              <button className="caption" onClick={clearRecentRuns} style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {runHistory.slice(0, 8).map(entry => {
                const runtimeLabel = formatScannerRunDuration(entry.elapsedMs)
                return (
                  <button
                    key={entry.id}
                    data-testid="scanner-run-history-entry"
                    onClick={() => restoreScannerRun(entry)}
                    title={`Restore ${entry.label}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 9px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-primary)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
                      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{entry.totalMatches.toLocaleString('en-IN')}</span>
                    </span>
                    <span className="caption" style={{ display: 'block', marginTop: 3 }}>
                      {entry.tradeDate || entry.dataAsOf || 'Latest'} · {entry.dataSource ?? 'Source pending'}
                      {runtimeLabel ? ` · Runtime ${runtimeLabel}` : ''}
                    </span>
                    {entry.topSymbols.length > 0 && (
                      <span className="caption mono" style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.topSymbols.slice(0, 4).join(' · ')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'var(--loss-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--loss)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ flex: '1 1 320px' }}>{error}</span>
            <button className="workspace-chip-button" onClick={() => runScan()}>
              Retry scan
            </button>
            <a className="workspace-chip-button" href="/data" style={{ textDecoration: 'none' }}>
              Data status
            </a>
          </div>
        )}

        {/* Skeleton */}
        {loading && results.length === 0 && (
          <div style={{ padding: '12px 16px' }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 36, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 4, opacity: 0.3 + i * 0.07 }} />
            ))}
          </div>
        )}

        {/* Empty — no scan run yet */}
        {!loading && !hasRun && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              title="Run your first scan"
              description="Choose a saved filter or set your own price, volume, trend, and RS conditions. If market data looks stale, check Data Status before running."
              action={{ label: 'Select Trend Template', onClick: () => selectPreset(PRESETS[0]) }}
            />
          </div>
        )}

        {/* Empty — scan ran but 0 results */}
        {!loading && hasRun && results.length === 0 && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <EmptyState
              title="No stocks matched"
              description={tradeDate
                ? `No matches for ${tradeDate} with the current filters. Widen RSI/volume filters or start from a preset. If this looks like missing market data, check Data Status before reporting.`
                : 'No matches with the current filters. Try a broader preset. If this looks like missing market data, check Data Status before reporting.'}
              action={{ label: 'Reset filters', onClick: resetFilters }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a className="workspace-chip-button" href="/data" style={{ textDecoration: 'none' }}>
                Data status
              </a>
              <button className="workspace-chip-button" onClick={() => reportScannerDataIssue()}>
                Report data issue
              </button>
            </div>
          </div>
        )}

        {columnsPickerOpen && hasRun && (
          <div
            data-testid="scanner-columns-picker"
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            {SCANNER_COLUMN_DEFS.map(col => (
              <label key={col.id} className="caption" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={visibleColumnIds.includes(col.id)}
                  onChange={(e) => toggleVisibleColumn(col.id, e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                {col.label}
              </label>
            ))}
          </div>
        )}

        {!loading && results.length > 0 && heatmapEnabled && (
          <ScannerSectorHeatmap results={filteredResults} />
        )}

        {!loading && results.length > 0 && resultsView === 'charts' && (
          <ScannerChartsPanel
            results={filteredResults}
            selected={selectedResults}
            layout={chartsLayout}
            onToggleSelect={(symbol, checked) => {
              setSelectedResults(prev => {
                const next = new Set(prev)
                if (checked) next.add(symbol)
                else next.delete(symbol)
                return next
              })
            }}
            onOpenChart={(row) => {
              const full = results.find(result => result.symbol === row.symbol)
              if (full) void openScannerChart(full)
            }}
            onMark={markWorkflow}
            watchlists={watchlists}
            onAddToWatchlist={addToWatchlist}
            onReport={reportScannerDataIssue}
          />
        )}

        {/* Results table */}
        {!loading && results.length > 0 && resultsView === 'list' && (
          <div
            ref={resultsScrollRef}
            className={`scanner-results-scroll scanner-results-scroll-x${rowDensity === 'compact' ? ' scanner-results-density-compact' : ''}`}
          >
            <DataTable
              className="scanner-results-table scanner-results-table-tv"
              style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'transparent' }}
              tableStyle={{ minWidth: 720, tableLayout: 'fixed' }}
            >
              <DataTableHead>
	                <Th width={32} className="scanner-sticky-col scanner-sticky-col-check">
	                  <input type="checkbox" style={{ accentColor: 'var(--accent)' }}
	                    onChange={e => setSelectedResults(e.target.checked ? new Set(filteredResults.map(r => r.symbol)) : new Set())} />
	                </Th>
                {visibleColumns.map(col => {
                  const sortable = col.sortKey != null
                  const active = sortable && sortBy === col.sortKey
                  const stickyClass = col.id === 'symbol' || col.id === 'pct_change' ? ' scanner-sticky-col' : ''
                  const stickyOffsetClass = col.id === 'symbol' ? ' scanner-sticky-col-symbol' : col.id === 'pct_change' ? ' scanner-sticky-col-change' : ''
                  return (
                    <Th key={col.id} align={col.align ?? 'left'} width={col.width} className={`${sortable ? 'scanner-sortable' : ''}${stickyClass}${stickyOffsetClass}`.trim()}>
                      {sortable ? (
                        <button
                          type="button"
                          className="scanner-col-sort"
                          onClick={() => handleColumnSort(col.sortKey!)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: active ? 'var(--accent)' : 'inherit',
                            font: 'inherit',
                            fontWeight: 600,
                          }}
                        >
                          {col.id === 'rs_score' ? (<span title="Relative strength score (alpha — being calibrated)">RS<sup style={{ fontSize: 8 }}>α</sup></span>) : col.label}{active ? (sortDesc ? ' ↓' : ' ↑') : ''}
                        </button>
                      ) : col.id === 'rs_score' ? (<span title="Relative strength score (alpha — being calibrated)">RS<sup style={{ fontSize: 8 }}>α</sup></span>) : col.label}
                    </Th>
                  )
                })}
                <Th width={88} align="right">{'\u00A0'}</Th>
	              </DataTableHead>
	              <tbody>
	                {renderedResults.map((r, rowIndex) => {
                  const focused = focusedRowIndex === rowIndex
                  return (
                    <Fragment key={r.symbol}>
                      <Tr
                        data-testid="scanner-result-row"
                        data-scanner-row-index={rowIndex}
	                        className={focused ? 'scanner-row-focused' : undefined}
	                        onClick={() => void openScannerChart(r)}
	                        onMouseEnter={() => prefetchScannerChart(r.symbol)}
	                        onFocus={() => prefetchScannerChart(r.symbol)}
	                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void openScannerChart(r)
                          }
                        }}
                        tabIndex={focused ? 0 : -1}
                      >
                        <Td className="scanner-sticky-col scanner-sticky-col-check">
                          <input type="checkbox" checked={selectedResults.has(r.symbol)} style={{ accentColor: 'var(--accent)' }}
                            onChange={e => { e.stopPropagation(); setSelectedResults(s => { const n = new Set(s); if (e.target.checked) { n.add(r.symbol) } else { n.delete(r.symbol) } return n }) }}
                            onClick={e => e.stopPropagation()} />
                        </Td>
                        {visibleColumns.map(col => {
                          const value = formatScannerColumnValue(col.id, r)
                          const fundamentalMissing = SCANNER_FUNDAMENTAL_COLUMN_IDS.has(col.id)
                            && (r as unknown as Record<string, unknown>)[col.id] == null
                          const align = col.align ?? 'left'
                          const isPct = col.id === 'pct_change'
                          const tone = isPct && r.pct_change != null
                            ? (r.pct_change >= 0 ? 'var(--gain)' : 'var(--loss)')
                            : 'var(--text-primary)'
                          const stickyClass = col.id === 'symbol' || col.id === 'pct_change' ? ' scanner-sticky-col' : ''
                          const stickyOffsetClass = col.id === 'symbol' ? ' scanner-sticky-col-symbol' : col.id === 'pct_change' ? ' scanner-sticky-col-change' : ''
                          return (
                            <Td
                              key={col.id}
                              align={align}
                              mono={col.id !== 'company_name' && col.id !== 'sector'}
                              emphasized={col.id === 'close' || col.id === 'rs_score'}
                              className={`${stickyClass}${stickyOffsetClass}`.trim() || undefined}
                            >
                              {col.id === 'symbol' ? (
                                <div>
                                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.symbol}</div>
                                  {r.screen_matches?.length ? (
                                    <div className="caption" style={{ color: 'var(--accent)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {r.screen_matches.join(' + ')}
                                    </div>
                                  ) : null}
                                  {workflowMarks[r.symbol] && (
                                    <div className="caption" style={{ color: workflowMarks[r.symbol] === 'ignored' ? 'var(--loss)' : workflowMarks[r.symbol] === 'review_later' ? 'var(--warn)' : 'var(--accent)' }}>
                                      {workflowMarks[r.symbol] === 'shortlist' ? 'Shortlisted' : workflowMarks[r.symbol] === 'review_later' ? 'Review later' : workflowMarks[r.symbol] === 'watch' ? 'Watching' : 'Ignored'}
                                    </div>
                                  )}
                                </div>
                              ) : col.id === 'close' ? (
                                `₹${value}`
                              ) : col.id === 'rs_score' ? (
                                <span className="scanner-rs-cell" style={{ color: rsScoreColor(r.rs_score) }}>{value}</span>
                              ) : (
                                <span
                                  style={{ color: isPct ? tone : undefined, fontWeight: isPct ? 600 : undefined, fontSize: isPct ? 12 : undefined }}
                                  title={fundamentalMissing ? FUNDAMENTALS_UNAVAILABLE_TOOLTIP : undefined}
                                >
                                  {value}
                                </span>
                              )}
                            </Td>
                          )
                        })}
                        <Td align="right">
                          <ScannerRowActions
                            result={r}
                            watchlists={watchlists}
                            onMark={markWorkflow}
                            onAddToWatchlist={addToWatchlist}
                            onOpenChart={() => void openScannerChart(r)}
                            onReport={reportScannerDataIssue}
                          />
                        </Td>
                      </Tr>
                    </Fragment>
                  )
                })}
              </tbody>
	            </DataTable>
	            <div className="workspace-toolbar scanner-pagination-footer">
	              <div className="workspace-card-copy">
	                Showing <Num>{renderedResults.length === 0 ? 0 : visibleStart}</Num>-<Num>{renderedResults.length === 0 ? 0 : Math.min(visibleEnd, visibleStart + renderedResults.length - 1)}</Num> of <Num>{totalMatches.toLocaleString('en-IN')}</Num> matches
	                {resultSymbolFilter.trim() ? ` · ${filteredResults.length} filtered on page` : ''}
	                {hasDeferredScannerRows ? ` · rendering ${renderedResults.length}/${filteredResults.length} rows for speed` : ''}.
	              </div>
	              <div className="workspace-toolbar-group">
	                {hasDeferredScannerRows && (
	                  <button
	                    className="workspace-chip-button"
	                    data-testid="scanner-render-more-rows"
	                    onClick={() => setRenderedRowLimit(limit => Math.min(filteredResults.length, limit + SCANNER_ROW_RENDER_INCREMENT))}
	                  >
	                    Render more rows
	                  </button>
	                )}
	                <button
                  className="workspace-chip-button"
                  disabled={currentPage <= 1}
                  onClick={() => {
                    const nextPage = Math.max(1, currentPage - 1)
                    setCurrentPage(nextPage)
                    runScan(undefined, sortBy, sortDesc, nextPage, pageSize)
                  }}
                  style={{ opacity: currentPage <= 1 ? 0.45 : 1 }}
                >
                  ← Prev
                </button>
                {pageNumbers[0] > 1 && (
                  <>
                    <button
                      className={`workspace-chip-button${currentPage === 1 ? ' active' : ''}`}
                      onClick={() => {
                        setCurrentPage(1)
                        runScan(undefined, sortBy, sortDesc, 1, pageSize)
                      }}
                    >
                      1
                    </button>
                    {pageNumbers[0] > 2 && <span className="caption" style={{ padding: '0 2px' }}>…</span>}
                  </>
                )}
                {pageNumbers.map(pageNumber => (
                  <button
                    key={pageNumber}
                    className={`workspace-chip-button${currentPage === pageNumber ? ' active' : ''}`}
                    onClick={() => {
                      setCurrentPage(pageNumber)
                      runScan(undefined, sortBy, sortDesc, pageNumber, pageSize)
                    }}
                  >
                    {pageNumber}
                  </button>
                ))}
                {pageNumbers[pageNumbers.length - 1] < totalPages && (
                  <>
                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && <span className="caption" style={{ padding: '0 2px' }}>…</span>}
                    <button
                      className={`workspace-chip-button${currentPage === totalPages ? ' active' : ''}`}
                      onClick={() => {
                        setCurrentPage(totalPages)
                        runScan(undefined, sortBy, sortDesc, totalPages, pageSize)
                      }}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  className="workspace-chip-button"
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    const nextPage = Math.min(totalPages, currentPage + 1)
                    setCurrentPage(nextPage)
                    runScan(undefined, sortBy, sortDesc, nextPage, pageSize)
                  }}
                  style={{ opacity: currentPage >= totalPages ? 0.45 : 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ScannerDefinitionBuilder
        open={showDefinitionBuilder}
        initialDefinition={editingDefinition}
        onClose={() => { setShowDefinitionBuilder(false); setEditingDefinition(null) }}
        onSaved={handleDefinitionSaved}
      />

      {/* Save screen modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowSaveModal(false)}>
          <div style={{ background: 'var(--surface-float)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 24, width: 300, boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}>
            <div className="heading-card" style={{ marginBottom: 16 }}>Save current screen</div>
            <input autoFocus value={newScreenName} onChange={e => setNewScreenName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveCurrentScreen()}
              placeholder="Screen name…"
              style={{ ...inputStyle, marginBottom: 12, padding: '8px 12px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={() => setShowSaveModal(false)} fullWidth>Cancel</Button>
              <Button variant="primary" size="md" onClick={saveCurrentScreen} disabled={!newScreenName.trim()} fullWidth>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Scan alert modal */}
      {showAlertModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowAlertModal(false)}>
          <div style={{ background: 'var(--surface-float)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 24, width: 360, boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}>
            <div className="heading-card" style={{ marginBottom: 6 }}>Create scan alert</div>
            <div className="caption" style={{ marginBottom: 16, lineHeight: 1.6 }}>
              AlphaVyuh checks this cash-equity screen once after each completed EOD session. Use it for entry setup watches or exit/risk reviews; matches appear in Alerts for review.
            </div>
            <input autoFocus value={alertName} onChange={e => setAlertName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createEodAlert()}
              placeholder="Alert name…"
              style={{ ...inputStyle, marginBottom: 12, padding: '8px 12px' }} />
            <div className="caption" style={{ marginBottom: 12 }}>
              {scanTrust?.asOf || tradeDate ? `Data as of ${scanTrust?.asOf ?? tradeDate}` : 'Waiting for latest session context.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={() => setShowAlertModal(false)} fullWidth>Cancel</Button>
              <Button variant="primary" size="md" onClick={createEodAlert} loading={alertSaving} disabled={!alertName.trim()} fullWidth>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create watchlist modal */}
      {showWlModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowWlModal(false)}>
          <div style={{ background: 'var(--surface-float)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 24, width: 320, boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}>
            <div className="heading-card" style={{ marginBottom: 6 }}>Create watchlist</div>
            <div className="caption" style={{ marginBottom: 16 }}>
              {selectedResults.size > 0 ? `Adding ${selectedResults.size} selected stocks` : `Adding all ${Math.min(results.length, 50)} stocks`}
            </div>
            <input autoFocus value={newWlName} onChange={e => setNewWlName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createWatchlistFromResults()}
              placeholder="Watchlist name…"
              style={{ ...inputStyle, marginBottom: 12, padding: '8px 12px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="md" onClick={() => setShowWlModal(false)} fullWidth>Cancel</Button>
              <Button variant="primary" size="md" onClick={createWatchlistFromResults} disabled={!newWlName.trim()} fullWidth>Create</Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
