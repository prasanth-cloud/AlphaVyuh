'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/api'

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
  bb_width: number | null
  // Fundamentals
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

// ── Presets ────────────────────────────────────────────────
const PRESETS = [
  { id: 'momentum',     name: 'Momentum',     emoji: '🚀',
    filters: { rsi_min: 55, rsi_max: 80, volume_ratio_min: 1.5, price_vs_ema20: 'above', price_vs_ema50: 'above', pct_change_min: 1.0 } },
  { id: 'breakout',     name: 'Breakout',     emoji: '⚡',
    filters: { volume_ratio_min: 2.0, pct_change_min: 2.0, week_52_high_pct_max: 8.0, price_vs_ema20: 'above' } },
  { id: 'oversold',     name: 'Oversold',     emoji: '📉',
    filters: { rsi_min: 20, rsi_max: 35, price_vs_ema200: 'above' } },
  { id: 'new_highs',    name: '52W Highs',    emoji: '📈',
    filters: { new_52w_high: true, volume_ratio_min: 1.2 } },
  { id: 'high_volume',  name: 'High Vol',     emoji: '🔥',
    filters: { volume_ratio_min: 3.0 } },
  { id: 'golden_cross', name: 'Golden Cross', emoji: '✨',
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
  new_52w_high: boolean; new_52w_low: boolean
  is_inside_bar: boolean
  series: string[]
  // Fundamentals
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
  padding: '5px 8px', background: 'var(--app-surface2)',
  border: '1px solid var(--app-border)', borderRadius: 5,
  fontSize: 12, color: 'var(--app-text1)', outline: 'none', width: '100%',
}
const thStyle: React.CSSProperties = {
  padding: '9px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--app-text3)', textAlign: 'left',
  borderBottom: '1px solid var(--app-border)', whiteSpace: 'nowrap',
  background: 'var(--app-surface2)', position: 'sticky', top: 0, zIndex: 10,
}

function Section({ title, children, open: def = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(def)
  return (
    <div style={{ borderBottom: '1px solid var(--app-border)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--app-text3)',
      }}>
        {title}
        <span style={{ fontSize: 12, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && <div style={{ padding: '4px 14px 12px' }}>{children}</div>}
    </div>
  )
}

export default function ScannerPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [tradeDate, setTradeDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState<ScanResult | null>(null)
  const [sortBy, setSortBy] = useState('volume_ratio')
  const [sortDesc, setSortDesc] = useState(true)
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showWlModal, setShowWlModal] = useState(false)
  const [newScreenName, setNewScreenName] = useState('')
  const [newWlName, setNewWlName] = useState('')
  const [toast, setToast] = useState('')
  const [filterTab, setFilterTab] = useState<'technical' | 'fundamental'>('technical')

  const getToken = useCallback(async () => {
    const h = await authHeaders() as Record<string, string>
    const auth = h['Authorization'] || ''
    return auth.replace('Bearer ', '')
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
    // Fundamentals
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
    setLoading(true); setError(''); setResults([]); setSelectedRow(null)
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
        <div style={{ fontSize: 10, color: 'var(--app-text3)', marginBottom: 3 }}>{label}</div>
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
        <div style={{ fontSize: 10, color: 'var(--app-text3)', marginBottom: 3 }}>{label}</div>
        <input type="number" placeholder={placeholder} value={(filters[k] as string) || ''}
          onChange={e => setF(k, e.target.value)} style={inputStyle} />
      </div>
    )
  }

  function segRow(label: string, k: keyof Filters, opts: { value: string; label: string }[]) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--app-text3)', marginBottom: 3 }}>{label}</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {opts.map(o => {
            const active = filters[k] === o.value
            return (
              <button key={o.value} onClick={() => setF(k, active ? '' : o.value)} style={{
                padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(0,229,196,0.4)' : 'var(--app-border)'}`,
                background: active ? 'var(--app-teal-dim)' : 'transparent',
                color: active ? 'var(--app-teal)' : 'var(--app-text2)', transition: 'all 0.12s',
              }}>{o.label}</button>
            )
          })}
        </div>
      </div>
    )
  }

  function toggleRow(label: string, key: 'new_52w_high' | 'new_52w_low' | 'is_inside_bar') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!filters[key]} onChange={e => setF(key, e.target.checked)}
          style={{ accentColor: 'var(--app-teal)', width: 13, height: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--app-text2)' }}>{label}</span>
      </label>
    )
  }

  function rsiBadge(rsi: number | null) {
    if (rsi == null) return <span style={{ color: 'var(--app-text3)', fontSize: 11 }}>—</span>
    const hot = rsi > 70, ok = rsi >= 40
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        background: hot ? 'rgba(0,229,196,0.12)' : ok ? 'rgba(38,166,91,0.12)' : 'rgba(245,158,11,0.12)',
        color: hot ? 'var(--app-teal)' : ok ? 'var(--app-gain)' : '#f59e0b',
      }}>{rsi.toFixed(0)}</span>
    )
  }

  const SORT_COLS = [
    ['volume_ratio', 'Vol ×'], ['pct_change', '% Chg'], ['rsi_14', 'RSI'], ['close', 'Price'],
  ] as const

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', background: 'var(--app-bg)', overflow: 'hidden' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ width: 300, flexShrink: 0, background: 'var(--app-surface)', borderRight: '1px solid var(--app-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Presets */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 8 }}>Presets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {PRESETS.map(p => {
              const active = activePreset === p.id
              return (
                <button key={p.id} onClick={() => applyPreset(p)} title={p.name} style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(0,229,196,0.5)' : 'var(--app-border)'}`,
                  background: active ? 'var(--app-teal-dim)' : 'transparent',
                  color: active ? 'var(--app-teal)' : 'var(--app-text2)',
                }}>
                  {p.emoji} {p.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Saved screens */}
        {savedScreens.length > 0 && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--app-border)', maxHeight: 120, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 6 }}>Saved</div>
            {savedScreens.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <button onClick={() => loadScreen(s)} style={{
                  flex: 1, textAlign: 'left', padding: '3px 8px', borderRadius: 4, fontSize: 11,
                  background: 'var(--app-surface2)', border: '1px solid var(--app-border)',
                  color: 'var(--app-text2)', cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.name}</button>
                <button onClick={() => deleteScreen(s.id, s.name)} style={{
                  background: 'none', border: 'none', color: 'var(--app-text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
          {(['technical', 'fundamental'] as const).map(tab => (
            <button key={tab} onClick={() => setFilterTab(tab)} style={{
              flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: 'none', border: 'none', textTransform: 'capitalize', letterSpacing: '0.03em',
              borderBottom: filterTab === tab ? '2px solid var(--app-teal)' : '2px solid transparent',
              color: filterTab === tab ? 'var(--app-teal)' : 'var(--app-text3)',
              transition: 'all 0.15s',
            }}>{tab}</button>
          ))}
        </div>

        {/* Filters scrollable */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filterTab === 'technical' ? (
            <>
              <Section title="Price & Change" open>
                {rangeRow('Price (₹)', 'price_min', 'price_max')}
                {rangeRow('Change %', 'pct_change_min', 'pct_change_max')}
              </Section>
              <Section title="Volume">
                {rangeRow('Vol ratio (×avg)', 'volume_ratio_min', 'volume_ratio_max')}
              </Section>
              <Section title="Moving Averages">
                {segRow('vs EMA 20', 'price_vs_ema20', [{ value: 'above', label: '↑ Above' }, { value: 'below', label: '↓ Below' }])}
                {segRow('vs EMA 50', 'price_vs_ema50', [{ value: 'above', label: '↑ Above' }, { value: 'below', label: '↓ Below' }])}
                {segRow('vs EMA 200', 'price_vs_ema200', [{ value: 'above', label: '↑ Above' }, { value: 'below', label: '↓ Below' }])}
                {segRow('EMA 20 vs 50', 'ema20_vs_ema50', [{ value: 'golden', label: 'Golden ↑' }, { value: 'death', label: 'Death ↓' }])}
                {segRow('EMA 50 vs 200', 'ema50_vs_ema200', [{ value: 'golden', label: 'Golden ↑' }, { value: 'death', label: 'Death ↓' }])}
              </Section>
              <Section title="Momentum">
                {rangeRow('RSI 14', 'rsi_min', 'rsi_max')}
                {rangeRow('ADX 14', 'adx_min', 'adx_max')}
                {segRow('MACD histogram', 'macd_hist_positive', [{ value: 'positive', label: '↑ +ve' }, { value: 'negative', label: '↓ −ve' }])}
              </Section>
              <Section title="Bollinger Bands">
                {segRow('Position', 'bb_position', [
                  { value: 'above_upper', label: 'Above ↑' },
                  { value: 'below_lower', label: 'Below ↓' },
                  { value: 'near_upper',  label: 'Near ↑' },
                  { value: 'near_lower',  label: 'Near ↓' },
                  { value: 'inside',      label: 'Inside' },
                ])}
                {rangeRow('BB Width', 'bb_width_min', 'bb_width_max')}
              </Section>
              <Section title="Volatility">
                {rangeRow('ATR % of price', 'atr_pct_min', 'atr_pct_max')}
              </Section>
              <Section title="52-Week Range">
                {numRow('Max % below 52W High', 'week_52_high_pct_max', 'e.g. 5')}
                {toggleRow('New 52W High today', 'new_52w_high')}
                {toggleRow('New 52W Low today', 'new_52w_low')}
              </Section>
              <Section title="Candle Patterns">
                {toggleRow('Inside bar', 'is_inside_bar')}
              </Section>
            </>
          ) : (
            <>
              <Section title="Market Cap" open>
                {rangeRow('Market Cap (₹ Cr)', 'market_cap_min', 'market_cap_max')}
                <div style={{ fontSize: 10, color: 'var(--app-text3)', marginTop: -4, marginBottom: 6 }}>
                  e.g. Large cap: 20000+, Mid: 5000–20000, Small: &lt;5000
                </div>
              </Section>
              <Section title="Valuation" open>
                {rangeRow('P/E Ratio', 'pe_min', 'pe_max')}
                {rangeRow('P/B Ratio', 'pb_min', 'pb_max')}
                {rangeRow('EPS (₹)', 'eps_min', 'eps_max')}
              </Section>
              <Section title="Returns & Efficiency" open>
                {numRow('ROE ≥ %', 'roe_min', 'e.g. 15')}
                {numRow('ROCE ≥ %', 'roce_min', 'e.g. 15')}
              </Section>
              <Section title="Dividends & Debt">
                {rangeRow('Dividend Yield %', 'dividend_yield_min', 'dividend_yield_max')}
                {numRow('Debt/Equity ≤', 'debt_to_equity_max', 'e.g. 1')}
              </Section>
              <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--app-text3)', lineHeight: 1.5 }}>
                Fundamental data updates daily via yfinance. Run <code style={{ fontSize: 10, background: 'var(--app-surface3)', padding: '1px 4px', borderRadius: 3 }}>fetch_fundamentals.py</code> to populate.
              </div>
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--app-border)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button onClick={() => runScan()} disabled={loading} style={{
            padding: '9px', borderRadius: 7, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? 'var(--app-surface3)' : 'var(--app-teal)',
            color: loading ? 'var(--app-text3)' : '#0D0F14',
            fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
          }}>
            {loading ? 'Scanning...' : 'Run Scan'}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {results.length > 0 && (
              <button onClick={() => setShowSaveModal(true)} style={{
                flex: 1, padding: '6px', borderRadius: 6, border: '1px solid var(--app-border)',
                background: 'transparent', color: 'var(--app-teal)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>Save screen</button>
            )}
            <button onClick={() => { setFilters(emptyFilters()); setActivePreset(null); setResults([]); setError('') }} style={{
              flex: 1, padding: '6px', borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--app-text3)', fontSize: 11, cursor: 'pointer',
            }}>Reset all</button>
          </div>
        </div>
      </div>

      {/* ── CENTER: Results ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ height: 44, background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
          {results.length > 0 ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--app-text2)' }}>
                <strong style={{ color: 'var(--app-text1)' }}>{totalMatches}</strong> stocks
                {tradeDate && <span style={{ color: 'var(--app-text3)', marginLeft: 6 }}>· EOD {tradeDate}</span>}
              </span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {SORT_COLS.map(([col, lbl]) => {
                  const active = sortBy === col
                  return (
                    <button key={col} onClick={() => {
                      const newDesc = col === sortBy ? !sortDesc : true
                      setSortBy(col); setSortDesc(newDesc); runScan(undefined, col, newDesc)
                    }} style={{
                      padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${active ? 'rgba(0,229,196,0.4)' : 'var(--app-border)'}`,
                      background: active ? 'var(--app-teal-dim)' : 'transparent',
                      color: active ? 'var(--app-teal)' : 'var(--app-text2)',
                    }}>
                      {lbl}{active ? (sortDesc ? ' ↓' : ' ↑') : ''}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setShowWlModal(true)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none',
                background: 'var(--app-teal)', color: '#0D0F14', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>+ Watchlist</button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--app-text3)' }}>
              {loading ? 'Scanning...' : 'Pick a preset or configure filters, then click Run Scan'}
            </span>
          )}
        </div>

        {error && (
          <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(229,56,59,0.08)', border: '1px solid rgba(229,56,59,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--app-loss)' }}>
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: 16 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ height: 44, background: 'var(--app-surface)', borderRadius: 6, marginBottom: 4, opacity: 0.3 + i * 0.06 }} />
            ))}
          </div>
        )}

        {/* Results table */}
        {!loading && results.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 32 }}>
                    <input type="checkbox" style={{ accentColor: 'var(--app-teal)' }}
                      onChange={e => setSelectedResults(e.target.checked ? new Set(results.map(r => r.symbol)) : new Set())} />
                  </th>
                  <th style={thStyle}>Symbol</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Chg %</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Vol ×</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RSI</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>EMA 20</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>52W H%</th>
                  <th style={{ ...thStyle, width: 64 }}></th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => {
                  const sel = selectedRow?.symbol === r.symbol
                  const chk = selectedResults.has(r.symbol)
                  return (
                    <tr key={r.symbol} onClick={() => setSelectedRow(sel ? null : r)}
                      style={{ borderBottom: '1px solid var(--app-border)', background: sel ? 'var(--app-teal-dim)' : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'var(--app-surface2)' }}
                      onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={chk} style={{ accentColor: 'var(--app-teal)' }}
                          onChange={e => setSelectedResults(s => { const n = new Set(s); if (e.target.checked) { n.add(r.symbol) } else { n.delete(r.symbol) } return n })} />
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--app-text1)', fontFamily: 'monospace' }}>{r.symbol}</div>
                        <div style={{ fontSize: 10, color: 'var(--app-text3)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name}</div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--app-text1)', fontFamily: 'monospace' }}>
                        ₹{r.close?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: r.pct_change >= 0 ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                        {r.pct_change >= 0 ? '+' : ''}{r.pct_change?.toFixed(2)}%
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#A78BFA', fontFamily: 'monospace' }}>
                        {r.volume_ratio?.toFixed(1)}×
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>{rsiBadge(r.rsi_14)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: r.close > (r.ema_20 || 0) ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                        {r.ema_20 ? (r.close > r.ema_20 ? '↑ ' : '↓ ') + '₹' + r.ema_20.toFixed(0) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, color: 'var(--app-text3)', fontFamily: 'monospace' }}>
                        {r.week_52_high_pct != null ? r.week_52_high_pct.toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                        {watchlists.length > 0 && (
                          <select onChange={e => { if (e.target.value) { addToWatchlist(r.symbol, e.target.value); e.target.value = '' } }}
                            style={{ fontSize: 10, padding: '2px 4px', background: 'var(--app-surface2)', border: '1px solid var(--app-border)', borderRadius: 4, color: 'var(--app-text2)', cursor: 'pointer' }}>
                            <option value="">+WL</option>
                            {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!loading && results.length === 0 && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--app-text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⊹</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text1)', marginBottom: 6 }}>No results yet</p>
            <p style={{ fontSize: 13 }}>Pick a preset or configure filters, then click Run Scan</p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Detail panel ── */}
      {selectedRow && (
        <div style={{ width: 256, flexShrink: 0, background: 'var(--app-surface)', borderLeft: '1px solid var(--app-border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--app-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--app-text1)', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{selectedRow.symbol}</span>
              <button onClick={() => setSelectedRow(null)} style={{ background: 'none', border: 'none', color: 'var(--app-text3)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--app-text3)', marginBottom: 10 }}>{selectedRow.company_name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--app-text1)', fontFamily: 'monospace' }}>
                ₹{selectedRow.close?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: selectedRow.pct_change >= 0 ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                {selectedRow.pct_change >= 0 ? '+' : ''}{selectedRow.pct_change?.toFixed(2)}%
              </span>
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--app-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 8 }}>Key Metrics</div>
            {([
              ['RSI 14', selectedRow.rsi_14?.toFixed(1)],
              ['Vol ratio', selectedRow.volume_ratio != null ? selectedRow.volume_ratio.toFixed(1) + '×' : null],
              ['ATR 14', selectedRow.atr_14 ? '₹' + selectedRow.atr_14.toFixed(1) : null],
              ['ADX 14', selectedRow.adx_14?.toFixed(1)],
              ['MACD hist', selectedRow.macd_hist?.toFixed(2)],
              ['BB Width', selectedRow.bb_width?.toFixed(3)],
            ] as [string, string | null | undefined][]).filter(([, v]) => v != null).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--app-text3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--app-text1)', fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--app-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 8 }}>EMA Stack</div>
            {([['EMA 20', selectedRow.ema_20], ['EMA 50', selectedRow.ema_50], ['EMA 200', selectedRow.ema_200]] as [string, number | null][]).map(([k, v]) => v != null ? (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--app-text3)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: selectedRow.close > v ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                  {selectedRow.close > v ? '↑' : '↓'} ₹{v.toFixed(0)}
                </span>
              </div>
            ) : null)}
          </div>

          {(selectedRow.pe_ratio != null || selectedRow.market_cap_cr != null || selectedRow.roe != null) && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--app-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 8 }}>Fundamentals</div>
              {([
                ['Market Cap', selectedRow.market_cap_cr != null ? `₹${selectedRow.market_cap_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : null],
                ['P/E Ratio', selectedRow.pe_ratio?.toFixed(1)],
                ['P/B Ratio', selectedRow.pb_ratio?.toFixed(2)],
                ['EPS', selectedRow.eps != null ? `₹${selectedRow.eps.toFixed(2)}` : null],
                ['ROE', selectedRow.roe != null ? `${selectedRow.roe.toFixed(1)}%` : null],
                ['ROCE', selectedRow.roce != null ? `${selectedRow.roce.toFixed(1)}%` : null],
                ['Div Yield', selectedRow.dividend_yield != null ? `${selectedRow.dividend_yield.toFixed(2)}%` : null],
              ] as [string, string | null | undefined][]).filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--app-text3)' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: 'var(--app-text1)', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {selectedRow.week_52_high != null && selectedRow.week_52_low != null && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--app-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--app-text3)', marginBottom: 8 }}>52-Week Range</div>
              {(() => {
                const range = selectedRow.week_52_high! - selectedRow.week_52_low!
                const pct = range > 0 ? Math.min(100, Math.max(0, ((selectedRow.close - selectedRow.week_52_low!) / range) * 100)) : 50
                return (
                  <>
                    <div style={{ height: 4, background: 'var(--app-surface3)', borderRadius: 2, marginBottom: 6, position: 'relative' }}>
                      <div style={{ height: '100%', width: pct + '%', background: 'var(--app-teal)', borderRadius: 2 }} />
                      <div style={{ position: 'absolute', top: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--app-teal)', left: pct + '%', transform: 'translateX(-50%)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--app-text3)' }}>
                      <span>₹{selectedRow.week_52_low?.toFixed(0)}</span>
                      <span style={{ color: 'var(--app-teal)', fontWeight: 600 }}>{selectedRow.week_52_high_pct?.toFixed(1)}% from high</span>
                      <span>₹{selectedRow.week_52_high?.toFixed(0)}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          <div style={{ padding: '12px 16px', marginTop: 'auto', borderTop: '1px solid var(--app-border)' }}>
            {watchlists.length > 0 && (
              <select onChange={e => { if (e.target.value) { addToWatchlist(selectedRow.symbol, e.target.value); e.target.value = '' } }}
                style={{ width: '100%', padding: '7px 10px', background: 'var(--app-surface2)', border: '1px solid var(--app-border)', borderRadius: 7, fontSize: 12, color: 'var(--app-text2)', cursor: 'pointer', marginBottom: 8 }}>
                <option value="">+ Add to watchlist...</option>
                {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button onClick={() => router.push(`/charts/${selectedRow.symbol}`)} style={{
              width: '100%', padding: '7px', borderRadius: 7, border: 'none',
              background: 'var(--app-teal)', color: '#0D0F14', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Open Chart →</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 60, right: 20, zIndex: 999, padding: '8px 16px', background: 'var(--app-surface2)', border: '1px solid var(--app-border)', borderRadius: 8, fontSize: 12, color: 'var(--app-teal)' }}>
          ✓ {toast}
        </div>
      )}

      {/* Save screen modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowSaveModal(false)}>
          <div style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 12, padding: 24, width: 300 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--app-text1)', marginBottom: 16 }}>Save current screen</div>
            <input autoFocus value={newScreenName} onChange={e => setNewScreenName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveCurrentScreen()}
              placeholder="Screen name..." style={{ ...inputStyle, marginBottom: 12, padding: '8px 12px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSaveModal(false)} style={{ flex: 1, padding: 8, borderRadius: 7, border: '1px solid var(--app-border)', background: 'transparent', color: 'var(--app-text2)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveCurrentScreen} disabled={!newScreenName.trim()} style={{ flex: 1, padding: 8, borderRadius: 7, border: 'none', background: 'var(--app-teal)', color: '#0D0F14', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: newScreenName.trim() ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Create watchlist modal */}
      {showWlModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowWlModal(false)}>
          <div style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 12, padding: 24, width: 320 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--app-text1)', marginBottom: 6 }}>Create Watchlist</div>
            <div style={{ fontSize: 12, color: 'var(--app-text3)', marginBottom: 16 }}>
              {selectedResults.size > 0 ? `Adding ${selectedResults.size} selected stocks` : `Adding all ${Math.min(results.length, 50)} stocks`}
            </div>
            <input autoFocus value={newWlName} onChange={e => setNewWlName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createWatchlistFromResults()}
              placeholder="Watchlist name..." style={{ ...inputStyle, marginBottom: 12, padding: '8px 12px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowWlModal(false)} style={{ flex: 1, padding: 8, borderRadius: 7, border: '1px solid var(--app-border)', background: 'transparent', color: 'var(--app-text2)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createWatchlistFromResults} disabled={!newWlName.trim()} style={{ flex: 1, padding: 8, borderRadius: 7, border: 'none', background: 'var(--app-teal)', color: '#0D0F14', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: newWlName.trim() ? 1 : 0.5 }}>Create & Go →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
