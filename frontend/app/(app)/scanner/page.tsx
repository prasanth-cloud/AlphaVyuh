'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/api'
import { Button, Badge, EmptyState, DataTable, DataTableHead, Th, Tr, Td } from '@/components/ui'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
  ema_200: number | null
  macd_hist: number | null
  atr_14: number | null
  adx_14: number | null
  week_52_high: number | null
  week_52_low: number | null
  week_52_high_pct: number | null
  is_new_52w_high: boolean
  rs_rating: number | null
  bb_width: number | null
  market_cap_cr: number | null
  pe_ratio: number | null
  pb_ratio: number | null
  eps: number | null
  dividend_yield: number | null
  roe: number | null
  roce: number | null
}

interface SavedScreen { id: string; name: string; filters: Record<string, unknown>; created_at: string }
interface Watchlist { id: string; name: string }

// ── Presets (no emoji) ─────────────────────────────────────
const PRESETS = [
  { id: 'sepa',         name: 'SEPA',
    filters: { all_emas_bullish: true, rs_rating_min: 70, week_52_high_pct_max: 25, w52l_pct_min: 30 } },
  { id: 'momentum',     name: 'Momentum',
    filters: { rsi_min: 55, rsi_max: 80, volume_ratio_min: 1.5, price_vs_ema20: 'above', price_vs_ema50: 'above', pct_change_min: 1.0 } },
  { id: 'breakout',     name: 'Breakout',
    filters: { volume_ratio_min: 2.0, pct_change_min: 2.0, week_52_high_pct_max: 8.0, price_vs_ema20: 'above' } },
  { id: 'oversold',     name: 'Oversold',
    filters: { rsi_min: 20, rsi_max: 35, price_vs_ema200: 'above' } },
  { id: 'new_highs',    name: '52W Highs',
    filters: { new_52w_high: true, volume_ratio_min: 1.2 } },
  { id: 'high_volume',  name: 'High Vol',
    filters: { volume_ratio_min: 3.0 } },
  { id: 'golden_cross', name: 'Golden Cross',
    filters: { ema20_vs_ema50: 'golden', price_vs_ema200: 'above' } },
]

type Filters = {
  price_min: string; price_max: string
  pct_change_min: string; pct_change_max: string
  volume_ratio_min: string; volume_ratio_max: string
  rsi_min: string; rsi_max: string
  adx_min: string; adx_max: string
  price_vs_ema20: string; price_vs_ema50: string; price_vs_ema200: string
  price_vs_sma20: string; price_vs_sma50: string
  ema20_vs_ema50: string; ema50_vs_ema200: string
  macd_hist_positive: string
  bb_position: string
  bb_width_min: string; bb_width_max: string
  atr_pct_min: string; atr_pct_max: string
  week_52_high_pct_max: string
  rs_rating_min: string
  w52l_pct_min: string
  all_emas_bullish: boolean
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
  price_vs_ema20: '', price_vs_ema50: '', price_vs_ema200: '',
  price_vs_sma20: '', price_vs_sma50: '',
  ema20_vs_ema50: '', ema50_vs_ema200: '',
  macd_hist_positive: '',
  bb_position: '',
  bb_width_min: '', bb_width_max: '',
  atr_pct_min: '', atr_pct_max: '',
  week_52_high_pct_max: '',
  rs_rating_min: '',
  w52l_pct_min: '',
  all_emas_bullish: false,
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
  borderRadius: 'var(--radius-sm)',
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

// Inline detail expansion for a selected row
function RowExpansion({ r, watchlists, onAddToWatchlist, onOpenChart }: {
  r: ScanResult
  watchlists: Watchlist[]
  onAddToWatchlist: (symbol: string, wlId: string) => void
  onOpenChart: (symbol: string) => void
}) {
  function MetricCell({ label, value, direction }: { label: string; value: string; direction?: 'above' | 'below' }) {
    const color = direction === 'above' ? 'var(--gain)' : direction === 'below' ? 'var(--loss)' : 'var(--text-secondary)'
    return (
      <div>
        <div className="label" style={{ marginBottom: 4 }}>{label}</div>
        <div className="mono" style={{ fontSize: 13, fontWeight: 500, color }}>{value}</div>
      </div>
    )
  }

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0, background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 4 }}>
          <MetricCell label="EMA 20" value={r.ema_20 ? `₹${r.ema_20.toFixed(0)}` : '—'} direction={r.ema_20 ? (r.close > r.ema_20 ? 'above' : 'below') : undefined} />
          <MetricCell label="EMA 50" value={r.ema_50 ? `₹${r.ema_50.toFixed(0)}` : '—'} direction={r.ema_50 ? (r.close > r.ema_50 ? 'above' : 'below') : undefined} />
          <MetricCell label="EMA 200" value={r.ema_200 ? `₹${r.ema_200.toFixed(0)}` : '—'} direction={r.ema_200 ? (r.close > r.ema_200 ? 'above' : 'below') : undefined} />
          <MetricCell label="ATR 14" value={r.atr_14 ? `₹${r.atr_14.toFixed(1)}` : '—'} />
          <MetricCell label="Sector" value={r.sector || '—'} />
          <MetricCell label="P/E" value={r.pe_ratio?.toFixed(1) ?? '—'} />
          <MetricCell label="ROE" value={r.roe ? `${r.roe.toFixed(1)}%` : '—'} />
          <MetricCell label="ADX 14" value={r.adx_14?.toFixed(1) ?? '—'} />
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
          <Button size="sm" variant="primary" onClick={() => onOpenChart(r.symbol)}>
            Open chart
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

const SORT_COLS = [
  ['volume_ratio', 'Vol ×'], ['pct_change', '% Chg'], ['rsi_14', 'RSI'], ['close', 'Price'],
] as const

export default function ScannerPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [tradeDate, setTradeDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('volume_ratio')
  const [sortDesc, setSortDesc] = useState(true)
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showWlModal, setShowWlModal] = useState(false)
  const [newScreenName, setNewScreenName] = useState('')
  const [newWlName, setNewWlName] = useState('')
  const [toast, setToast] = useState('')
  const [filterTab, setFilterTab] = useState<'technical' | 'fundamental'>('technical')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isLimited, setIsLimited] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())

  const getToken = useCallback(async () => {
    const h = await authHeaders() as Record<string, string>
    return (h['Authorization'] || '').replace('Bearer ', '')
  }, [])

  useEffect(() => {
    loadWatchlists()
    loadSavedScreens()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function loadWatchlists() {
    try {
      const token = await getToken()
      const res = await fetch(`${API}/api/v1/watchlists`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setWatchlists(d.watchlists || []) }
    } catch { /* ignore */ }
  }

  async function loadSavedScreens() {
    try {
      const token = await getToken()
      const res = await fetch(`${API}/api/v1/scanner/screens`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setSavedScreens(d.screens || []) }
    } catch { /* ignore */ }
  }

  function buildPayload(f: Filters, sb: string, sd: boolean) {
    const fil: Record<string, unknown> = { series: f.series || ['EQ'] }
    const num = (v: string) => v !== '' ? parseFloat(v) : undefined
    const set = (key: string, v: unknown) => { if (v !== undefined && v !== '' && v !== null) fil[key] = v }

    set('price_min', num(f.price_min)); set('price_max', num(f.price_max))
    set('pct_change_min', num(f.pct_change_min)); set('pct_change_max', num(f.pct_change_max))
    set('volume_ratio_min', num(f.volume_ratio_min)); set('volume_ratio_max', num(f.volume_ratio_max))
    set('rsi_min', num(f.rsi_min)); set('rsi_max', num(f.rsi_max))
    set('adx_min', num(f.adx_min)); set('adx_max', num(f.adx_max))
    set('week_52_high_pct_max', num(f.week_52_high_pct_max))
    set('rs_rating_min', num(f.rs_rating_min))
    set('w52l_pct_min', num(f.w52l_pct_min))
    if (f.all_emas_bullish) fil.all_emas_bullish = true
    set('bb_width_min', num(f.bb_width_min)); set('bb_width_max', num(f.bb_width_max))
    set('atr_pct_min', num(f.atr_pct_min)); set('atr_pct_max', num(f.atr_pct_max))
    if (f.price_vs_ema20) set('price_vs_ema20', f.price_vs_ema20)
    if (f.price_vs_ema50) set('price_vs_ema50', f.price_vs_ema50)
    if (f.price_vs_ema200) set('price_vs_ema200', f.price_vs_ema200)
    if (f.price_vs_sma20) set('price_vs_sma20', f.price_vs_sma20)
    if (f.price_vs_sma50) set('price_vs_sma50', f.price_vs_sma50)
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
  }

  async function runScan(overrideFilters?: Filters, sb = sortBy, sd = sortDesc) {
    setLoading(true); setError(''); setResults([]); setExpandedSymbol(null)
    try {
      const token = await getToken()
      const payload = buildPayload(overrideFilters || filters, sb, sd)
      const res = await fetch(`${API}/api/v1/scanner/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail || `Error ${res.status}`) }
      const data = await res.json()
      setResults(data.results || [])
      setTotalMatches(data.total_matches || 0)
      setTradeDate(data.trade_date || '')
      setIsLimited(data.is_limited || false)
      setHasRun(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally { setLoading(false) }
  }

  function applyPreset(p: typeof PRESETS[0]) {
    const f = { ...emptyFilters(), ...p.filters } as Filters
    setFilters(f); setActivePreset(p.id); runScan(f)
  }

  function loadScreen(screen: SavedScreen) {
    const f = { ...emptyFilters(), ...screen.filters } as Filters
    setFilters(f); setActivePreset(null); runScan(f)
  }

  async function saveCurrentScreen() {
    if (!newScreenName.trim()) return
    try {
      const token = await getToken()
      const payload = buildPayload(filters, sortBy, sortDesc)
      const res = await fetch(`${API}/api/v1/scanner/screens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newScreenName.trim(), filters: payload.filters }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error((e as { detail?: string }).detail || 'Save failed') }
      setNewScreenName(''); setShowSaveModal(false)
      await loadSavedScreens()
      showToast(`"${newScreenName}" saved`)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed') }
  }

  async function deleteScreen(id: string, name: string) {
    const token = await getToken()
    await fetch(`${API}/api/v1/scanner/screens/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    await loadSavedScreens()
    showToast(`"${name}" deleted`)
  }

  async function addToWatchlist(symbol: string, wlId: string) {
    const token = await getToken()
    await fetch(`${API}/api/v1/watchlists/${wlId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ symbol }),
    })
    showToast(`${symbol} added`)
  }

  async function createWatchlistFromResults() {
    if (!newWlName.trim()) return
    const token = await getToken()
    const res = await fetch(`${API}/api/v1/watchlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newWlName.trim() }),
    })
    const wl = await res.json() as { id: string }
    const toAdd = selectedResults.size > 0 ? results.filter(r => selectedResults.has(r.symbol)) : results
    for (const s of toAdd.slice(0, 50)) {
      await fetch(`${API}/api/v1/watchlists/${wl.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol: s.symbol }),
      })
    }
    setShowWlModal(false); setNewWlName('')
    router.push(`/watchlist?id=${wl.id}`)
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

  function toggleRow(label: string, key: 'new_52w_high' | 'new_52w_low' | 'is_inside_bar' | 'all_emas_bullish') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!filters[key]} onChange={e => setF(key, e.target.checked)}
          style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      </label>
    )
  }

  const resetFilters = () => { setFilters(emptyFilters()); setActivePreset(null); setResults([]); setError(''); setHasRun(false) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{
        padding: '22px 24px',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        background:
          'radial-gradient(circle at top right, rgba(86,215,193,0.12), transparent 28%), linear-gradient(180deg, rgba(13,22,26,0.94), rgba(10,14,18,0.96))',
        boxShadow: 'var(--shadow-panel)',
      }}>
        <div className="label" style={{ color: 'var(--accent)', marginBottom: 10 }}>Scanner Workspace</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.02, letterSpacing: '-0.04em', marginBottom: 8 }}>
              Build sharp scans and move ideas straight into action.
            </h1>
            <p style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              Run momentum and breakout presets, open the exact filters you care about, and turn strong names into watchlists without leaving the same surface.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              `${PRESETS.length} presets`,
              `${savedScreens.length} saved screens`,
              results.length > 0 ? `${results.length} visible results` : 'Custom filters ready',
            ].map((item) => (
              <div key={item} style={{
                minWidth: 120,
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 320px)', overflow: 'visible', flexWrap: 'wrap' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        width: 292,
        maxWidth: '100%',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(86,215,193,0.06), rgba(255,255,255,0.02) 18%, rgba(255,255,255,0.01)), var(--surface-1)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-panel)',
      }}>

        {/* Presets */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="label" style={{ marginBottom: 10 }}>Presets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {PRESETS.map(p => {
              const active = activePreset === p.id
              return (
                <button key={p.id} onClick={() => applyPreset(p)} style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'all var(--motion-instant) var(--ease-out)',
                }}>
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Saved screens */}
        {savedScreens.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', maxHeight: 120, overflowY: 'auto', flexShrink: 0 }}>
            <div className="label" style={{ marginBottom: 8 }}>My screens</div>
            {savedScreens.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <button onClick={() => loadScreen(s)} style={{
                  flex: 1, textAlign: 'left', padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                  background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.name}</button>
                <button onClick={() => deleteScreen(s.id, s.name)} style={{ color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Filters toggle */}
        <div style={{ padding: '8px 16px', borderBottom: filtersOpen ? '1px solid var(--border-subtle)' : 'none', flexShrink: 0 }}>
          <button onClick={() => setFiltersOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
            padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            color: filtersOpen ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
            <span>Filters {filtersOpen ? '▲' : '▼'}</span>
            {filtersOpen && (
              <div style={{ display: 'flex', gap: 4 }}>
                {(['technical', 'fundamental'] as const).map(tab => (
                  <button key={tab} onClick={e => { e.stopPropagation(); setFilterTab(tab) }} style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${filterTab === tab ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    background: filterTab === tab ? 'var(--accent-subtle)' : 'transparent',
                    color: filterTab === tab ? 'var(--accent)' : 'var(--text-tertiary)',
                    textTransform: 'capitalize',
                  }}>{tab}</button>
                ))}
              </div>
            )}
          </button>
        </div>

        {/* Filters scrollable */}
        <div style={{ flex: filtersOpen ? 1 : 0, overflowY: 'auto', display: filtersOpen ? 'block' : 'none' }}>
          {filterTab === 'technical' ? (
            <>
              <Section title="Price & Change" open>
                {rangeRow('Price (₹)', 'price_min', 'price_max')}
                {rangeRow('Change %', 'pct_change_min', 'pct_change_max')}
              </Section>
              <Section title="Volume">
                {rangeRow('Vol ratio (× avg)', 'volume_ratio_min', 'volume_ratio_max')}
              </Section>
              <Section title="Moving Averages">
                {segRow('vs EMA 20', 'price_vs_ema20', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs EMA 50', 'price_vs_ema50', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('vs EMA 200', 'price_vs_ema200', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])}
                {segRow('EMA 20 vs 50', 'ema20_vs_ema50', [{ value: 'golden', label: 'Golden' }, { value: 'death', label: 'Death' }])}
                {segRow('EMA 50 vs 200', 'ema50_vs_ema200', [{ value: 'golden', label: 'Golden' }, { value: 'death', label: 'Death' }])}
                {toggleRow('All EMAs bullish (20>50>200)', 'all_emas_bullish')}
              </Section>
              <Section title="Momentum">
                {rangeRow('RSI 14', 'rsi_min', 'rsi_max')}
                {rangeRow('ADX 14', 'adx_min', 'adx_max')}
                {segRow('MACD histogram', 'macd_hist_positive', [{ value: 'positive', label: 'Positive' }, { value: 'negative', label: 'Negative' }])}
              </Section>
              <Section title="Bollinger Bands">
                {segRow('Position', 'bb_position', [
                  { value: 'above_upper', label: 'Above upper' },
                  { value: 'below_lower', label: 'Below lower' },
                  { value: 'near_upper', label: 'Near upper' },
                  { value: 'near_lower', label: 'Near lower' },
                  { value: 'inside', label: 'Inside' },
                ])}
                {rangeRow('BB Width', 'bb_width_min', 'bb_width_max')}
              </Section>
              <Section title="Volatility">
                {rangeRow('ATR % of price', 'atr_pct_min', 'atr_pct_max')}
              </Section>
              <Section title="52-Week Range">
                {numRow('Max % below 52W high', 'week_52_high_pct_max', 'e.g. 25')}
                {numRow('Min % above 52W low', 'w52l_pct_min', 'e.g. 30')}
                {numRow('RS Score ≥', 'rs_rating_min', 'e.g. 70')}
                {toggleRow('New 52W high today', 'new_52w_high')}
                {toggleRow('New 52W low today', 'new_52w_low')}
              </Section>
              <Section title="Candle Patterns">
                {toggleRow('Inside bar', 'is_inside_bar')}
              </Section>
            </>
          ) : (
            <>
              <Section title="Market Cap" open>
                {rangeRow('Market cap (₹ Cr)', 'market_cap_min', 'market_cap_max')}
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: -4, marginBottom: 6, lineHeight: 1.5 }}>
                  Large: 20000+  ·  Mid: 5000–20000  ·  Small: &lt;5000
                </div>
              </Section>
              <Section title="Valuation" open>
                {rangeRow('P/E ratio', 'pe_min', 'pe_max')}
                {rangeRow('P/B ratio', 'pb_min', 'pb_max')}
                {rangeRow('EPS (₹)', 'eps_min', 'eps_max')}
              </Section>
              <Section title="Returns & Efficiency" open>
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
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <Button variant="primary" size="md" onClick={() => runScan()} loading={loading} fullWidth>
            Run scan
          </Button>
          <div style={{ display: 'flex', gap: 6 }}>
            {results.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowSaveModal(true)} fullWidth>
                Save screen
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={resetFilters} fullWidth>
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* ── CENTER: Results ── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(90,139,232,0.04), rgba(255,255,255,0.01) 14%), var(--surface-1)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        boxShadow: 'var(--shadow-panel)',
      }}>

        {/* Results header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          minHeight: 72,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          {results.length > 0 ? (
            <>
              <div>
                <span className="heading-card">{totalMatches > 0 ? `${totalMatches} stocks` : 'Scanner'}</span>
                {tradeDate && <span className="caption" style={{ marginLeft: 8 }}>EOD {tradeDate} · showing {results.length}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isLimited && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--warn-subtle)', color: 'var(--warn)', border: '1px solid rgba(232,163,59,0.25)' }}>
                    Free plan · 50 cap
                  </span>
                )}
                {SORT_COLS.map(([col, lbl]) => {
                  const active = sortBy === col
                  return (
                    <button key={col} onClick={() => {
                      const newDesc = col === sortBy ? !sortDesc : true
                      setSortBy(col); setSortDesc(newDesc); runScan(undefined, col, newDesc)
                    }} style={{
                      padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}>
                      {lbl}{active ? (sortDesc ? ' ↓' : ' ↑') : ''}
                    </button>
                  )
                })}
                <Button size="sm" variant="secondary" onClick={() => setShowWlModal(true)}>
                  + Watchlist
                </Button>
              </div>
            </>
          ) : (
            <span className="caption">
              {loading ? 'Scanning…' : 'Pick a preset or configure filters, then click Run scan'}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'var(--loss-subtle)', border: '1px solid rgba(225,85,96,0.2)', borderRadius: 14, fontSize: 12, color: 'var(--loss)' }}>
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: '12px 16px' }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 36, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 4, opacity: 0.3 + i * 0.07 }} />
            ))}
          </div>
        )}

        {/* Empty — no scan run yet */}
        {!loading && !hasRun && !error && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              title="Run your first scan"
              description="Pick a preset on the left, or open Filters to set custom conditions."
            />
          </div>
        )}

        {/* Empty — scan ran but 0 results */}
        {!loading && hasRun && results.length === 0 && !error && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              title="No stocks matched"
              description="Your filters are too strict. Try widening the RSI range or reducing the volume ratio."
              action={{ label: 'Reset filters', onClick: resetFilters }}
            />
          </div>
        )}

        {/* Results table */}
        {!loading && results.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <DataTable style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'transparent' }}>
              <DataTableHead>
                <Th width={32}>
                  <input type="checkbox" style={{ accentColor: 'var(--accent)' }}
                    onChange={e => setSelectedResults(e.target.checked ? new Set(results.map(r => r.symbol)) : new Set())} />
                </Th>
                <Th width={200}>Symbol</Th>
                <Th align="right" width={110}>Price</Th>
                <Th align="right" width={90}>Change</Th>
                <Th align="right" width={70}>Vol ×</Th>
                <Th align="right" width={60}>RSI</Th>
                <Th align="right" width={50}>RS</Th>
                <Th align="right" width={90}>52W H%</Th>
                <Th width={60}>{''}</Th>
              </DataTableHead>
              <tbody>
                {results.map(r => {
                  const expanded = expandedSymbol === r.symbol
                  const rsiBadgeVariant = r.rsi_14 != null
                    ? (r.rsi_14 > 70 ? 'accent' : r.rsi_14 > 40 ? 'gain' : 'warn')
                    : 'neutral'
                  return (
                    <>
                      <Tr key={r.symbol} onClick={() => setExpandedSymbol(expanded ? null : r.symbol)} selected={expanded}>
                        <Td>
                          <input type="checkbox" checked={selectedResults.has(r.symbol)} style={{ accentColor: 'var(--accent)' }}
                            onChange={e => { e.stopPropagation(); setSelectedResults(s => { const n = new Set(s); if (e.target.checked) { n.add(r.symbol) } else { n.delete(r.symbol) } return n }) }}
                            onClick={e => e.stopPropagation()} />
                        </Td>
                        <Td>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.symbol}</div>
                          <div className="caption" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name}</div>
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
                          {r.rs_rating != null
                            ? <span style={{ color: r.rs_rating >= 70 ? 'var(--gain)' : 'var(--text-secondary)' }}>{r.rs_rating}</span>
                            : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                          }
                        </Td>
                        <Td align="right" mono>
                          {r.week_52_high_pct != null ? `${r.week_52_high_pct.toFixed(1)}%` : '—'}
                        </Td>
                        <Td>
                          {watchlists.length > 0 && (
                            <select onChange={e => { if (e.target.value) { addToWatchlist(r.symbol, e.target.value); e.target.value = '' } }}
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 10, padding: '2px 4px', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                              <option value="">+WL</option>
                              {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          )}
                        </Td>
                      </Tr>
                      {expanded && (
                        <RowExpansion
                          r={r}
                          watchlists={watchlists}
                          onAddToWatchlist={addToWatchlist}
                          onOpenChart={sym => router.push(`/charts/${sym}`)}
                        />
                      )}
                    </>
                  )
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 88, right: 28, zIndex: 999, padding: '10px 16px', background: 'linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, fontSize: 12, color: 'var(--accent)', boxShadow: 'var(--shadow-panel)' }}>
          {toast}
        </div>
      )}

      {/* Save screen modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowSaveModal(false)}>
          <div style={{ background: 'linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, width: 300, boxShadow: 'var(--shadow-modal)' }}
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

      {/* Create watchlist modal */}
      {showWlModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowWlModal(false)}>
          <div style={{ background: 'linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, width: 320, boxShadow: 'var(--shadow-modal)' }}
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
