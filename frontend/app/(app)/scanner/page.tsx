'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  addToWatchlist as addSymbolToWatchlist,
  authHeaders,
  bulkUpsertWorkflowStates,
  createAlert,
  createFeedbackReport,
  createWatchlist,
  deleteScreen as deleteSavedScreen,
  getScreens as getCachedScreens,
  getWatchlists as getCachedWatchlists,
  saveScreen as saveSavedScreen,
  shouldUseMockFallback as scannerUsesClientMockFallback,
  type SavedScreen,
} from '@/lib/api'
import { mockRunScan } from '@/lib/mock-data'
import { scannerWatchlistPatch, scannerWatchlistPatches, scannerWorkflowPatch, selectedScannerSymbols } from '@/lib/scanner-workflow'
import { trackEvent } from '@/lib/analytics'
import { Button, Badge, EmptyState, DataTable, DataTableHead, Th, Tr, Td, DataProvenanceBadge, Num } from '@/components/ui'
import { formatMarketDataSource } from '@/lib/data-copy'
import { API_BASE_URL } from '@/lib/api-base'
import { describeMarketDataError } from '@/lib/data-errors'
import { buildScannerMatchExplanation } from '@/lib/scanner-match-explanation'
import {
  appendScannerRunHistory,
  clearScannerRunHistory,
  readScannerRunHistory,
  type ScannerRunHistoryEntry,
} from '@/lib/scanner-run-history'
import { buildMultiChartReviewHref } from '@/lib/multi-chart-review'

const API = API_BASE_URL

const WATCHLISTS_UNAVAILABLE_MESSAGE = 'Open Data Status, then try again.'
const WATCHLIST_ADD_FAILED_MESSAGE = 'Check Watchlist or Data Status, then try again.'
const SCANNER_REPORT_FAILED_MESSAGE = 'Could not report the data issue. Try again from Feedback or Data Status.'
const SCAN_ALERT_FAILED_MESSAGE = 'Could not create the scan alert. Check alerts or Data Status, then try again.'
const SAVED_SCREEN_SAVE_FAILED_MESSAGE = 'Saved scanner screen could not be saved. Try again after checking Data Status.'
const SAVED_SCREEN_DELETE_FAILED_MESSAGE = 'Saved scanner screen could not be deleted. Try again after checking Data Status.'
const WATCHLIST_CREATION_FAILED_MESSAGE = 'Watchlist creation failed. Check Watchlist or Data Status, then try again.'

function scannerWatchlistAddFailure(symbol?: string) {
  return symbol
    ? `${symbol} could not be added. ${WATCHLIST_ADD_FAILED_MESSAGE}`
    : WATCHLIST_ADD_FAILED_MESSAGE
}

// ── Types ──────────────────────────────────────────────────
interface ScanResult {
  symbol: string
  company_name: string
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
  market_cap_cr: number | null
  pe_ratio: number | null
  pb_ratio: number | null
  eps: number | null
  dividend_yield: number | null
  roe: number | null
  roce: number | null
}

type ScanTrust = {
  mode: 'demo' | 'eod' | 'fallback' | 'live' | 'unknown'
  source: string
  asOf: string | null
  coveragePct: number | null
  universeSize: number | null
  message?: string
}

interface Watchlist { id: string; name: string }

type ScannerCacheSnapshot = {
  results: ScanResult[]
  totalMatches: number
  totalPages: number
  currentPage: number
  tradeDate: string
  isLimited: boolean
  scanTrust: ScanTrust | null
  savedAt: number
}

const SCANNER_CACHE_KEY = 'alphavyuh-scanner-last-results-v1'
const SCANNER_CACHE_TTL_MS = 5 * 60 * 1000

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

function Section({ title, children, open: def = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(def)
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}>
        {title}
        <span style={{ fontSize: 12, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && <div style={{ padding: '4px 14px 12px' }}>{children}</div>}
    </div>
  )
}

function MetricCell({ label, value, direction }: { label: string; value: string; direction?: 'above' | 'below' }) {
  const color = direction === 'above' ? 'var(--gain)' : direction === 'below' ? 'var(--loss)' : 'var(--text-secondary)'
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 500, color }}>{value}</div>
    </div>
  )
}

function metricToneColor(tone?: 'good' | 'warn' | 'bad') {
  if (tone === 'good') return 'var(--gain)'
  if (tone === 'warn') return 'var(--warn)'
  if (tone === 'bad') return 'var(--loss)'
  return 'var(--text-secondary)'
}

// Inline detail expansion for a selected row
function RowExpansion({ r, watchlists, onAddToWatchlist, onOpenChart, presetName, tradeDate, scanTrust }: {
  r: ScanResult
  watchlists: Watchlist[]
  onAddToWatchlist: (symbol: string, wlId: string) => void
  onOpenChart: (symbol: string) => void
  presetName?: string | null
  tradeDate?: string | null
  scanTrust?: ScanTrust | null
}) {
  const explanation = buildScannerMatchExplanation(r, { presetName, tradeDate, scanTrust })
  return (
    <tr>
      <td colSpan={10} style={{ padding: 0, background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ padding: '16px 20px 8px', display: 'grid', gridTemplateColumns: 'minmax(220px,1.15fr) minmax(220px,1fr)', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div className="label">Why this matched</div>
              {r.setup_score != null && (
                <div className="workspace-pill" style={{
                  color: r.setup_score >= 80 ? 'var(--gain)' : r.setup_score >= 65 ? 'var(--text-primary)' : 'var(--warn)',
                  borderColor: r.setup_score >= 80 ? 'rgba(38,166,91,0.28)' : r.setup_score >= 65 ? 'var(--border-subtle)' : 'rgba(217,119,6,0.28)',
                }}>
                  {r.confidence_label || 'Setup score'} · {r.setup_grade || '—'} · {r.setup_score}
                </div>
              )}
            </div>
            <div className="caption" style={{ marginBottom: 8, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {explanation.headline}
            </div>
            <div data-testid={`scanner-match-context-${r.symbol}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {explanation.context.map(item => (
                <span key={`${item.label}-${item.value}`} className="workspace-pill" style={{ color: 'var(--text-secondary)' }}>
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>Triggered conditions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {explanation.reasons.map(reason => (
                    <span key={reason} className="workspace-pill" style={{ color: 'var(--text-secondary)' }}>{reason}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>Confirmations</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {explanation.confirmations.map(reason => (
                    <span key={`confidence-${reason}`} className="workspace-pill" style={{ color: 'var(--gain)' }}>{reason}</span>
                  ))}
                </div>
              </div>
            </div>
            {Boolean(explanation.warnings.length) && (
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {explanation.warnings.map(warning => (
                  <div key={warning} className="caption" style={{ color: 'var(--warn)' }}>{warning}</div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid var(--border-subtle)' }}>
              <div className="label" style={{ marginBottom: 3 }}>Next action</div>
              <div className="caption" style={{ color: 'var(--text-secondary)' }}>{explanation.nextAction}</div>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Latest values behind the match</div>
            <div data-testid={`scanner-match-metrics-${r.symbol}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {explanation.metrics.map(metric => (
                <div key={`${metric.label}-${metric.value}`} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
                  <div className="label" style={{ marginBottom: 4 }}>{metric.label}</div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: metricToneColor(metric.tone), overflowWrap: 'anywhere' }}>{metric.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '10px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 4 }}>
          <MetricCell label="EMA 20" value={r.ema_20 ? `₹${r.ema_20.toFixed(0)}` : '—'} direction={r.ema_20 ? (r.close > r.ema_20 ? 'above' : 'below') : undefined} />
          <MetricCell label="EMA 50" value={r.ema_50 ? `₹${r.ema_50.toFixed(0)}` : '—'} direction={r.ema_50 ? (r.close > r.ema_50 ? 'above' : 'below') : undefined} />
          <MetricCell label="EMA 150" value={r.ema_150 ? `₹${r.ema_150.toFixed(0)}` : '—'} direction={r.ema_150 ? (r.close > r.ema_150 ? 'above' : 'below') : undefined} />
          <MetricCell label="EMA 200" value={r.ema_200 ? `₹${r.ema_200.toFixed(0)}` : '—'} direction={r.ema_200 ? (r.close > r.ema_200 ? 'above' : 'below') : undefined} />
          <MetricCell label="Sector" value={r.sector || '—'} />
          <MetricCell label="P/E" value={r.pe_ratio?.toFixed(1) ?? '—'} />
          <MetricCell label="ROE" value={r.roe ? `${r.roe.toFixed(1)}%` : '—'} />
          <MetricCell label="ADX 14" value={r.adx_14?.toFixed(1) ?? '—'} />
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
          <Button size="sm" variant="primary" onClick={() => onOpenChart(r.symbol)}>
            Open chart
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.location.assign(`/journal?symbol=${encodeURIComponent(r.symbol)}&review=needs-review`)}>
            Review journal
          </Button>
          {watchlists.length > 0 && (
            <select
              onChange={e => { if (e.target.value) { onAddToWatchlist(r.symbol, e.target.value); e.target.value = '' } }}
              style={{ fontSize: 12, padding: '4px 8px', background: 'var(--surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <option value="">Add to watchlist…</option>
              {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
      </td>
    </tr>
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
    <div className="scanner-row-actions">
      <button
        className="scanner-row-action scanner-row-action-primary"
        title={`Shortlist ${result.symbol}`}
        onClick={e => { e.stopPropagation(); onMark([result.symbol], 'shortlist') }}
        style={{ color: 'var(--accent)', cursor: 'pointer' }}
      >
        Shortlist
      </button>
      <button
        className="scanner-row-action"
        title={`Open ${result.symbol} chart`}
        onClick={e => { e.stopPropagation(); onOpenChart(result.symbol) }}
        style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        Chart
      </button>
      <select
        aria-label={`More actions for ${result.symbol}`}
        className="scanner-row-select scanner-more-select"
        onClick={e => e.stopPropagation()}
        onChange={e => {
          e.stopPropagation()
          const action = e.target.value
          e.target.value = ''
          if (action.startsWith('add:')) onAddToWatchlist(result.symbol, action.slice(4))
          if (action === 'ignore') onMark([result.symbol], 'ignored')
          if (action === 'later') onMark([result.symbol], 'review_later')
          if (action === 'journal') window.location.assign(`/journal?symbol=${encodeURIComponent(result.symbol)}&review=needs-review`)
          if (action === 'report') onReport(result.symbol)
        }}
      >
        <option value="">More</option>
        {watchlists.map(w => <option key={w.id} value={`add:${w.id}`}>Add to {w.name}</option>)}
        <option value="ignore">Ignore</option>
        <option value="later">Review later</option>
        <option value="journal">Journal</option>
        <option value="report">Report</option>
      </select>
    </div>
  )
}

const SORT_COLS = [
  ['volume_ratio', 'Vol ×'], ['pct_change', '% Chg'], ['rsi_14', 'RSI'], ['close', 'Price'],
] as const

export default function ScannerPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [results, setResults] = useState<ScanResult[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 150 | 200>(25)
  const [tradeDate, setTradeDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('volume_ratio')
  const [sortDesc, setSortDesc] = useState(true)
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [watchlistsError, setWatchlistsError] = useState('')
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([])
  const [savedScreensError, setSavedScreensError] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showWlModal, setShowWlModal] = useState(false)
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [newScreenName, setNewScreenName] = useState('')
  const [newWlName, setNewWlName] = useState('')
  const [alertName, setAlertName] = useState('')
  const [alertSaving, setAlertSaving] = useState(false)
  const [activeScreenName, setActiveScreenName] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [filterTab, setFilterTab] = useState<'technical' | 'fundamental'>('technical')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hasCachedResults, setHasCachedResults] = useState(false)
  const [isLimited, setIsLimited] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [workflowMarks, setWorkflowMarks] = useState<Record<string, WorkflowMark>>({})
  const [scanTrust, setScanTrust] = useState<ScanTrust | null>(null)
  const [runHistory, setRunHistory] = useState<ScannerRunHistoryEntry[]>([])

  const getAuthHeaders = useCallback(() => authHeaders(), [])

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
      setHasRun(true)
      setHasCachedResults(true)
    }
    setRunHistory(readScannerRunHistory())
    loadWatchlists()
    loadSavedScreens()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
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

  const scannerRunLabel = useCallback((eventPreset: string | null | undefined) => {
    if (eventPreset === 'saved_screen') return activeScreenName ?? 'Saved screen'
    if (eventPreset && eventPreset !== 'custom') return PRESETS.find(p => p.id === eventPreset)?.name ?? 'Custom scan'
    return 'Custom scan'
  }, [activeScreenName])

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
    setFilters({ ...emptyFilters(), ...(entry.filters ?? {}) } as Filters)
    setActivePreset(entry.presetId === 'custom' ? null : entry.presetId)
    setActiveScreenName(entry.presetId === 'saved_screen' ? entry.label : null)
    setHasRun(true)
    setHasCachedResults(true)
    setExpandedSymbol(null)
    setError('')
    writeScannerSnapshot({
      results: restoredResults,
      totalMatches: entry.totalMatches,
      totalPages: entry.totalPages,
      currentPage: entry.currentPage,
      tradeDate: entry.tradeDate,
      isLimited: entry.isLimited,
      scanTrust: restoredTrust,
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
    const hadResults = results.length > 0
    const activeFilters = overrideFilters || filters
    setLoading(true); setError(''); if (!hadResults) setResults([]); setExpandedSymbol(null)
    try {
      if (scannerUsesClientMockFallback()) {
        const data = mockRunScan()
        const nextResults = data.results as unknown as ScanResult[]
        const nextTotalMatches = data.total_matches || 0
        const nextTotalPages = data.total_pages || 1
        const nextCurrentPage = data.page || page
        const nextTradeDate = data.trade_date || ''
        const nextIsLimited = data.is_limited || false
        const nextTrust = {
          mode: data.source_metadata?.mode ?? 'demo',
          source: formatMarketDataSource(data.source_metadata?.source_name, 'Demo data'),
          asOf: data.source_metadata?.as_of ?? data.trade_date ?? null,
          coveragePct: data.coverage_pct ?? data.source_metadata?.coverage_pct ?? null,
          universeSize: data.universe_size ?? data.source_metadata?.universe_active ?? null,
          message: data.source_metadata?.license_notes,
        } satisfies ScanTrust
        setResults(nextResults)
        setTotalMatches(nextTotalMatches)
        setTotalPages(nextTotalPages)
        setCurrentPage(nextCurrentPage)
        setTradeDate(nextTradeDate)
        setIsLimited(nextIsLimited)
        setScanTrust(nextTrust)
        setHasCachedResults(false)
        writeScannerSnapshot({
          results: nextResults,
          totalMatches: nextTotalMatches,
          totalPages: nextTotalPages,
          currentPage: nextCurrentPage,
          tradeDate: nextTradeDate,
          isLimited: nextIsLimited,
          scanTrust: nextTrust,
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
      const headers = await getAuthHeaders()
      const payload = buildPayload(activeFilters, sb, sd)
      const res = await fetch(`${API}/api/v1/scanner/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, preset_id: eventPreset === 'custom' || eventPreset === 'saved_screen' ? null : eventPreset, page, page_size: size }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail || `Error ${res.status}`) }
      const data = await res.json()
      if (data.mode === 'unavailable' || data.status === 'unavailable') {
        throw new Error(data.message || data.detail || 'Scanner data is temporarily unavailable.')
      }
      const nextResults = data.results || []
      const nextTotalMatches = data.total_matches || 0
      const nextTotalPages = data.total_pages || 1
      const nextCurrentPage = data.page || page
      const nextTradeDate = data.trade_date || ''
      const nextIsLimited = data.is_limited || false
      const nextTrust = {
        mode: data.source_metadata?.mode ?? data.mode ?? 'eod',
        source: formatMarketDataSource(data.source_metadata?.source_name ?? data.source, 'Market data'),
        asOf: data.source_metadata?.as_of ?? data.trade_date ?? null,
        coveragePct: data.coverage_pct ?? data.source_metadata?.coverage_pct ?? null,
        universeSize: data.universe_size ?? data.source_metadata?.universe_active ?? null,
        message: data.message ?? data.source_metadata?.license_notes,
      } satisfies ScanTrust
      setResults(nextResults)
      setSelectedResults(new Set())
      setTotalMatches(nextTotalMatches)
      setTotalPages(nextTotalPages)
      setCurrentPage(nextCurrentPage)
      setTradeDate(nextTradeDate)
      setIsLimited(nextIsLimited)
      setScanTrust(nextTrust)
      setHasCachedResults(false)
      writeScannerSnapshot({
        results: nextResults,
        totalMatches: nextTotalMatches,
        totalPages: nextTotalPages,
        currentPage: nextCurrentPage,
        tradeDate: nextTradeDate,
        isLimited: nextIsLimited,
        scanTrust: nextTrust,
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
      })
      setHasRun(true)
      trackEvent('scanner_run', {
        mode: data.source_metadata?.mode ?? data.mode ?? 'eod',
        results: (data.results || []).length,
        preset: eventPreset,
        confidence_available: (data.results || []).some((result: ScanResult) => result.setup_score != null),
      })
    } catch (e: unknown) {
      setError(describeMarketDataError(e))
    } finally { setLoading(false) }
  }, [activePreset, buildPayload, currentPage, filters, getAuthHeaders, pageSize, rememberScannerRun, results.length, sortBy, sortDesc])

  const applyPreset = useCallback((p: Preset) => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(p.filters).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value]),
    )
    const f = { ...emptyFilters(), ...normalizedFilters } as Filters
    setFilters(f); setActivePreset(p.id); setActiveScreenName(null); setCurrentPage(1); runScan(f, sortBy, sortDesc, 1, pageSize, p.id)
  }, [pageSize, runScan, sortBy, sortDesc])

  useEffect(() => {
    if (bootstrapped) return
    if (loading || hasRun || savedScreens.length > 0) return
    setBootstrapped(true)
    applyPreset(PRESETS[0])
  }, [applyPreset, bootstrapped, loading, hasRun, savedScreens.length])

  function loadScreen(screen: SavedScreen) {
    const f = { ...emptyFilters(), ...screen.filters } as Filters
    setFilters(f); setActivePreset('saved_screen'); setActiveScreenName(screen.name); setCurrentPage(1); runScan(f, sortBy, sortDesc, 1, pageSize, 'saved_screen')
  }

  function currentScanName() {
    return activePresetMeta?.name ?? activeScreenName ?? (hasRun ? 'Custom scan' : 'Saved scan')
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

  function scanContextOptions() {
    return {
      presetId: activePreset,
      presetName: activePresetMeta?.name ?? (activePreset === 'saved_screen' ? activeScreenName ?? 'Saved screen' : activePreset === 'custom' ? 'Custom scan' : null),
      tradeDate,
      dataSource: scanTrust?.source ?? null,
      dataMode: scanTrust?.mode ?? null,
      dataAsOf: scanTrust?.asOf ?? tradeDate ?? null,
    }
  }

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

  async function openScannerChart(result: ScanResult) {
    await bulkUpsertWorkflowStates([
      scannerWorkflowPatch(result.symbol, 'shortlist', undefined, result, scanContextOptions()),
    ])
    trackEvent('scanner_chart_review_opened', { symbol: result.symbol, preset: activePreset ?? 'custom' })
    router.push(`/charts/${result.symbol}?from=scanner&full=1`)
  }

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
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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

  const resetFilters = () => { setFilters(emptyFilters()); setActivePreset(null); setActiveScreenName(null); setResults([]); setError(''); setHasRun(false); setCurrentPage(1); setTotalPages(1) }
  const activePresetMeta = PRESETS.find(p => p.id === activePreset) ?? null
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
  return (
    <div className="workspace-page">
      <div className="workspace-grid" style={{ gridTemplateColumns: '320px minmax(0, 1fr)' }}>

      {/* ── LEFT PANEL ── */}
      <div className="workspace-card workspace-card-muted" style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Presets */}
        <div className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="label" style={{ marginBottom: 8 }}>Presets</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PRESETS.map(p => {
              const active = activePreset === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
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
          <div className="caption" style={{ marginTop: 8 }}>
            {activePresetMeta?.description ?? 'Choose a saved filter, then adjust the fields for your scan.'}
          </div>
        </div>

        {/* Saved screens */}
        {savedScreens.length > 0 && (
          <div className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 156, overflowY: 'auto', flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 8 }}>My screens</div>
            {savedScreens.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
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
          </div>
        )}
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

        {runHistory.length > 0 && (
          <div data-testid="scanner-run-history" className="workspace-section" style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 210, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div className="label">Recent runs</div>
              <button className="caption" onClick={clearRecentRuns} style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {runHistory.slice(0, 5).map(entry => (
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
                  </span>
                  {entry.topSymbols.length > 0 && (
                    <span className="caption mono" style={{ display: 'block', marginTop: 3, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.topSymbols.slice(0, 4).join(' · ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter groups */}
        <div className="workspace-section" style={{ paddingTop: 12, paddingBottom: 12, borderBottom: filtersOpen ? '1px solid var(--border-subtle)' : 'none', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <button onClick={() => setFiltersOpen(o => !o)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              color: filtersOpen ? 'var(--accent)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Filters {filtersOpen ? '▲' : '▼'}
            </button>
            <span className="caption">Technicals and fundamentals stay visible while you scan.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([
              ['technical', 'Technicals', 'Price, trend, RS, volume'],
              ['fundamental', 'Fundamentals', 'Valuation, ROE, debt'],
            ] as const).map(([tab, label, detail]) => (
              <button key={tab} onClick={() => { setFilterTab(tab) }} style={{
                textAlign: 'left',
                padding: '8px 9px',
                borderRadius: 'var(--radius-md)',
                fontSize: 11,
                cursor: 'pointer',
                border: `1px solid ${filterTab === tab ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: filterTab === tab ? 'var(--accent-subtle)' : 'rgba(255,255,255,0.02)',
                color: filterTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              }}>
                <div style={{ fontWeight: 800, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.35 }}>{detail}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Filters scrollable */}
        <div style={{ flex: filtersOpen ? 1 : 0, overflowY: 'auto', display: filtersOpen ? 'block' : 'none' }}>
          {filterTab === 'technical' ? (
            <>
              <Section title="Price and change">
                {rangeRow('Price (₹)', 'price_min', 'price_max')}
                {rangeRow('Change %', 'pct_change_min', 'pct_change_max')}
              </Section>
              <Section title="Liquidity">
                {rangeRow('Vol ratio (× avg)', 'volume_ratio_min', 'volume_ratio_max')}
              </Section>
              <Section title="Trend quality">
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
              </Section>
              <Section title="Relative strength">
                {rangeRow('RSI 14', 'rsi_min', 'rsi_max')}
                {rangeRow('ADX 14', 'adx_min', 'adx_max')}
                {segRow('MACD histogram', 'macd_hist_positive', [{ value: 'positive', label: 'Positive' }, { value: 'negative', label: 'Negative' }])}
              </Section>
              <Section title="Setup structure">
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
              </Section>
              <Section title="Volatility and risk">
                {rangeRow('ATR % of price', 'atr_pct_min', 'atr_pct_max')}
              </Section>
              <Section title="52-week range">
                {numRow('Max % below 52W high', 'week_52_high_pct_max', 'e.g. 25')}
                {numRow('Min % above 52W low', 'w52l_pct_min', 'e.g. 30')}
                {numRow('RS Score ≥', 'rs_score_min', 'e.g. 70')}
                {toggleRow('New 52W high today', 'new_52w_high')}
                {toggleRow('New 52W low today', 'new_52w_low')}
              </Section>
              <Section title="Candle patterns">
                {toggleRow('Inside bar', 'is_inside_bar')}
              </Section>
            </>
          ) : (
            <>
              <Section title="Market cap">
                {rangeRow('Market cap (₹ Cr)', 'market_cap_min', 'market_cap_max')}
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: -4, marginBottom: 6, lineHeight: 1.5 }}>
                  Large: 20000+  ·  Mid: 5000–20000  ·  Small: &lt;5000
                </div>
              </Section>
              <Section title="Valuation">
                {rangeRow('P/E ratio', 'pe_min', 'pe_max')}
                {rangeRow('P/B ratio', 'pb_min', 'pb_max')}
                {rangeRow('EPS (₹)', 'eps_min', 'eps_max')}
              </Section>
              <Section title="Returns and efficiency">
                {numRow('ROE ≥ %', 'roe_min', 'e.g. 15')}
                {numRow('ROCE ≥ %', 'roce_min', 'e.g. 15')}
              </Section>
              <Section title="Dividends & Debt">
                {rangeRow('Dividend yield %', 'dividend_yield_min', 'dividend_yield_max')}
                {numRow('Debt/Equity ≤', 'debt_to_equity_max', 'e.g. 1')}
              </Section>
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="workspace-section" style={{ borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <Button variant="primary" size="md" onClick={() => runScan()} loading={loading} fullWidth>
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

      {/* ── CENTER: Results ── */}
      <div className="workspace-card" style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Results header */}
        <div className="workspace-toolbar" style={{ minHeight: 64, alignItems: 'center' }}>
          {results.length > 0 ? (
            <>
              <div>
                <span className="heading-card">{totalMatches > 0 ? <><Num>{totalMatches.toLocaleString('en-IN')}</Num> stocks</> : 'Scanner'}</span>
                {(tradeDate || scanTrust?.asOf) && (
                  <DataProvenanceBadge
                    kind={scanTrust?.mode === 'demo' ? 'demo' : scanTrust?.mode === 'fallback' || scanTrust?.mode === 'unknown' ? 'fallback' : 'eod'}
                    asOf={scanTrust?.asOf ?? tradeDate}
                    compact
                    className="ml-2"
                  />
                )}
              </div>
              <div className="workspace-toolbar-group scanner-results-toolbar" data-testid="scanner-data-trust">
                {scanTrust && (
                  <span className="workspace-pill" title={scanTrust.message ?? scanTrust.source}>
                    {hasCachedResults ? 'Cached results · ' : ''}Source: {scanTrust.source}{scanTrust.coveragePct != null ? ` · Coverage: ${scanTrust.coveragePct}%` : ''}
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
                {selectedResults.size > 0 && (
                  <span className="workspace-pill" aria-live="polite">
                    <Num>{selectedResults.size}</Num> selected · bulk actions enabled
                  </span>
                )}
                {SORT_COLS.map(([col, lbl]) => {
                  const active = sortBy === col
                  return (
                    <button key={col} className={`workspace-chip-button${active ? ' active' : ''}`} onClick={() => {
                      const newDesc = col === sortBy ? !sortDesc : true
                      setSortBy(col); setSortDesc(newDesc); setCurrentPage(1); runScan(undefined, col, newDesc, 1, pageSize)
                    }}>
                      {lbl}{active ? (sortDesc ? ' ↓' : ' ↑') : ''}
                    </button>
                  )
                })}
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
                <Button size="sm" variant="secondary" onClick={() => setShowWlModal(true)}>
                  Create watchlist
                </Button>
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
            </>
          ) : (
            <div>
              <div className="workspace-card-title">Scanner queue</div>
              <div className="workspace-card-copy">
                {loading ? 'Scanning…' : 'Run your first scan or start with a saved filter.'}
              </div>
            </div>
          )}
        </div>

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
              description="Choose a saved filter or set your own price, volume, trend, and RS conditions."
              action={{ label: 'Run Trend Template', onClick: () => applyPreset(PRESETS[0]) }}
            />
          </div>
        )}

        {/* Empty — scan ran but 0 results */}
        {!loading && hasRun && results.length === 0 && !error && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              title="No stocks matched"
              description={tradeDate ? `No matches for ${tradeDate}. Widen RSI/volume filters, start from a preset, or report it if this looks like a data issue.` : 'No matches yet. Try a broader preset, or report it if this looks like a data issue.'}
              action={{ label: 'Reset filters', onClick: resetFilters }}
            />
            <button className="workspace-chip-button" style={{ marginTop: 12 }} onClick={() => reportScannerDataIssue()}>
              Report data issue
            </button>
          </div>
        )}

        {/* Results table */}
        {!loading && results.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <DataTable
              className="scanner-results-table"
              style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'transparent' }}
              tableStyle={{ minWidth: 860, tableLayout: 'fixed' }}
            >
              <DataTableHead>
                <Th width={32}>
                  <input type="checkbox" style={{ accentColor: 'var(--accent)' }}
                    onChange={e => setSelectedResults(e.target.checked ? new Set(results.map(r => r.symbol)) : new Set())} />
                </Th>
                <Th width={166}>Symbol</Th>
                <Th align="right" width={92}>Price</Th>
                <Th align="right" width={74}>Change</Th>
                <Th align="right" width={60}>Vol ×</Th>
                <Th align="right" width={50}>RSI</Th>
                <Th align="right" width={50}>RS</Th>
                <Th align="right" width={68}>52W H%</Th>
                <Th align="right" width={66}>Score</Th>
                <Th width={178}>Action</Th>
              </DataTableHead>
              <tbody>
                {results.map(r => {
                  const expanded = expandedSymbol === r.symbol
                  const rsiBadgeVariant = r.rsi_14 != null
                    ? (r.rsi_14 > 70 ? 'accent' : r.rsi_14 > 40 ? 'gain' : 'warn')
                    : 'neutral'
                  return (
                    <Fragment key={r.symbol}>
                      <Tr
                        onClick={() => setExpandedSymbol(expanded ? null : r.symbol)}
                        onDoubleClick={() => void openScannerChart(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void openScannerChart(r)
                          }
                          if (e.key === ' ') {
                            e.preventDefault()
                            setExpandedSymbol(expanded ? null : r.symbol)
                          }
                        }}
                        tabIndex={0}
                        selected={expanded}
                      >
                        <Td>
                          <input type="checkbox" checked={selectedResults.has(r.symbol)} style={{ accentColor: 'var(--accent)' }}
                            onChange={e => { e.stopPropagation(); setSelectedResults(s => { const n = new Set(s); if (e.target.checked) { n.add(r.symbol) } else { n.delete(r.symbol) } return n }) }}
                            onClick={e => e.stopPropagation()} />
                        </Td>
                        <Td>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.symbol}</div>
                          <div className="caption" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name}</div>
                          <div className="caption" title={r.match_reasons?.[0] ?? 'Matched the active scanner filters'} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }}>
                            Matched: {r.match_reasons?.[0] ?? 'Active filters'}
                          </div>
                          {workflowMarks[r.symbol] && (
                            <div className="caption" style={{ color: workflowMarks[r.symbol] === 'ignored' ? 'var(--loss)' : workflowMarks[r.symbol] === 'review_later' ? 'var(--warn)' : 'var(--accent)' }}>
                              {workflowMarks[r.symbol] === 'shortlist'
                                ? 'Shortlisted'
                                : workflowMarks[r.symbol] === 'review_later'
                                  ? 'Review later'
                                  : workflowMarks[r.symbol] === 'watch'
                                    ? 'Watching'
                                    : 'Ignored'}
                            </div>
                          )}
                        </Td>
                        <Td align="right" mono emphasized>₹{r.close?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Td>
                        <Td align="right">
                          <span className="mono" style={{ color: r.pct_change >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 600, fontSize: 12 }}>
                            {r.pct_change >= 0 ? '+' : ''}{r.pct_change?.toFixed(2)}%
                          </span>
                        </Td>
                        <Td align="right" mono>{r.volume_ratio?.toFixed(1)}×</Td>
                        <Td align="right">
                          {r.rsi_14 != null
                            ? <Badge variant={rsiBadgeVariant as 'accent' | 'gain' | 'warn'} mono>{r.rsi_14.toFixed(0)}</Badge>
                            : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                          }
                        </Td>
                        <Td align="right" mono>
                          {r.rs_score != null
                            ? <span style={{ color: r.rs_score >= 70 ? 'var(--accent)' : 'var(--text-secondary)' }}>{r.rs_score}</span>
                            : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                          }
                        </Td>
                        <Td align="right" mono>
                          {r.week_52_high_pct != null ? `${r.week_52_high_pct.toFixed(1)}%` : '—'}
                        </Td>
                        <Td align="right">
                          {r.setup_score != null ? (
                            <Badge
                              variant={r.setup_score >= 80 ? 'gain' : r.setup_score >= 65 ? 'accent' : 'warn'}
                              mono
                            >
                              {r.setup_grade ?? '—'} {r.setup_score}
                            </Badge>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                          )}
                        </Td>
                        <Td>
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
                      {expanded && (
                        <RowExpansion
                          r={r}
                          watchlists={watchlists}
                          onAddToWatchlist={addToWatchlist}
                          onOpenChart={() => void openScannerChart(r)}
                          presetName={currentScanName()}
                          tradeDate={tradeDate}
                          scanTrust={scanTrust}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </DataTable>
            <div className="workspace-toolbar" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none' }}>
              <div className="workspace-card-copy">
                Showing <Num>{visibleStart}</Num>-<Num>{visibleEnd}</Num> of <Num>{totalMatches.toLocaleString('en-IN')}</Num> matches.
              </div>
              <div className="workspace-toolbar-group">
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

      {/* Toast */}
      {toast && (
        <div data-testid="scanner-toast" style={{ position: 'fixed', top: 88, right: 28, zIndex: 999, padding: '10px 16px', background: 'var(--surface-float)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-primary)', boxShadow: 'var(--shadow-dropdown)' }}>
          {toast}
        </div>
      )}

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
              AlphaVyuh will check this scan when the next session data is available. Matches appear in Alerts for review.
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
