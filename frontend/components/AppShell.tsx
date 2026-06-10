'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import FeedbackWidget from '@/components/FeedbackWidget'
import { clearAuthHeaderCache, getDataHealth, searchSymbols, warmCoreMarketData, warmSecondaryWorkflowData } from '@/lib/api'
import type { DataHealth, SymbolSearchResult } from '@/lib/api'
import { checkApiReachability } from '@/lib/api-reachability'
import { dataModePresentation, type ApiReachability } from '@/lib/data-mode'
import { markAppTiming } from '@/lib/performance'
import { allowClientMockFallback } from '@/lib/runtime-mode'
import { useWorkflowState } from '@/lib/workflow'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Today' },
  { href: '/journal',   label: 'Journal' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/scanner',   label: 'Scanner' },
]

const IDLE_PREFETCH_ROUTES = [
  '/dashboard',
  '/scanner',
  '/watchlist',
]

type SymbolResult = SymbolSearchResult
type CommandResult = { command: string; label: string; detail: string; href: string }
type SearchResult = SymbolResult | CommandResult

const COMMAND_RESULTS: CommandResult[] = [
  { command: 'today dashboard', label: 'Open Today', detail: 'Review queue, active plans, watchlist focus, data health', href: '/dashboard' },
  { command: 'journal review', label: 'Review Journal', detail: 'Close the learning loop and process notes', href: '/journal?review=needs-review' },
  { command: 'watchlist desk', label: 'Open Watchlist', detail: 'Plan the active queue and Decision Desk', href: '/watchlist' },
  { command: 'scanner discovery', label: 'Discover Setups', detail: 'Find candidates to feed watchlist and journal review', href: '/scanner' },
  { command: 'chart', label: 'Open Full Chart', detail: 'Focused chart review', href: '/charts/RELIANCE?full=1' },
  { command: 'agents', label: 'Agent Mission Control', detail: 'Operator view of agent work, blockers, and next actions', href: '/agents' },
  { command: 'broker', label: 'Broker Settings', detail: 'Read-only/import status and reconnect flow', href: '/settings/broker' },
  { command: 'data', label: 'Data Status', detail: 'Freshness, coverage, and operator checks', href: '/data' },
]

function isCommandResult(result: SearchResult): result is CommandResult {
  return 'href' in result
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fullChart = pathname.startsWith('/charts/') && searchParams.get('full') === '1'
  const router = useRouter()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    window.requestAnimationFrame(() => markAppTiming('first-app-shell-paint'))
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem('alphavyuh-theme') === 'light' ? 'light' : 'dark'
    setTheme(stored)
    document.documentElement.dataset.theme = stored

    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<'dark' | 'light'>).detail ?? document.documentElement.dataset.theme
      setTheme(next === 'light' ? 'light' : 'dark')
    }
    window.addEventListener('alphavyuh:theme-changed', syncTheme)
    return () => window.removeEventListener('alphavyuh:theme-changed', syncTheme)
  }, [])

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem('alphavyuh-theme', nextTheme)
    window.dispatchEvent(new CustomEvent('alphavyuh:theme-changed', { detail: nextTheme }))
  }

  useEffect(() => {
    const prefetchCoreRoutes = () => {
      for (const href of IDLE_PREFETCH_ROUTES) {
        if (href !== pathname) {
          router.prefetch(href)
        }
      }
    }

    const runWhenVisible = (task: () => void) => {
      if (document.visibilityState !== 'visible') return
      task()
    }

    const warmData = () => runWhenVisible(() => {
      if (pathname.startsWith('/charts/')) return
      warmCoreMarketData()
    })
    const warmSecondaryData = () => runWhenVisible(() => {
      if (!['/dashboard', '/watchlist', '/journal'].some((route) => pathname.startsWith(route))) return
      warmSecondaryWorkflowData()
    })

    if ('requestIdleCallback' in window) {
      const routeId = window.requestIdleCallback(prefetchCoreRoutes, { timeout: 3000 })
      const dataId = window.requestIdleCallback(warmData, { timeout: 6000 })
      const secondaryDataId = window.requestIdleCallback(warmSecondaryData, { timeout: 10_000 })
      return () => {
        window.cancelIdleCallback(routeId)
        window.cancelIdleCallback(dataId)
        window.cancelIdleCallback(secondaryDataId)
      }
    }

    const routeId = globalThis.setTimeout(prefetchCoreRoutes, 1200)
    const dataId = globalThis.setTimeout(warmData, 4500)
    const secondaryDataId = globalThis.setTimeout(warmSecondaryData, 9000)
    return () => {
      globalThis.clearTimeout(routeId)
      globalThis.clearTimeout(dataId)
      globalThis.clearTimeout(secondaryDataId)
    }
  }, [pathname, router])

  if (pathname.startsWith('/onboarding')) return <>{children}</>

  return (
    <div className={`app-shell${fullChart ? ' app-shell-full-chart' : ''}`}>
      {!fullChart && (
      <nav className="app-topbar">
        <div className="app-topbar-inner">
          <Link href="/dashboard" className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M2 14L6.5 8L10 11L14.5 4L16 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="16" cy="6" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <span className="app-brand-copy">
              <strong>AlphaVyuh</strong>
              <span>Trading Operating System</span>
            </span>
          </Link>

          <div className="app-nav">
            {NAV_LINKS.map(link => {
              const active = pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`app-navlink ${active ? 'app-navlink-active' : ''}`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          <div className="app-search-wrap">
            <SymbolSearch />
          </div>

          <div className="app-toolbar">
            <DataModePill />
            <MarketStatus />
            <AccountMenuButton theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </div>
      </nav>
      )}

      <main className={fullChart ? 'app-content app-content-full-chart' : 'app-content'}>{children}</main>
      {!fullChart && <FeedbackWidget />}
    </div>
  )
}

/* ── DATA MODE ───────────────────────────────────────────────────────────── */
function DataModePill() {
  const forceLive = process.env.NEXT_PUBLIC_FORCE_LIVE_DATA === 'true'
  const demo = allowClientMockFallback()
  const [apiReachable, setApiReachable] = useState<ApiReachability>(demo ? 'ok' : 'unknown')
  const [eodHealth, setEodHealth] = useState<DataHealth | null>(null)

  useEffect(() => {
    if (demo) return
    let cancelled = false

    checkApiReachability(1800).then((reachability) => {
      if (!cancelled) setApiReachable(reachability)
    })

    getDataHealth()
      .then((health) => {
        if (!cancelled) setEodHealth(health)
      })
      .catch(() => {
        if (!cancelled) setEodHealth(null)
      })

    return () => {
      cancelled = true
    }
  }, [demo])

  const liveMarket = eodHealth?.live_market
  const liveQuotesUnavailable = Boolean(
    liveMarket?.access_token_configured && !liveMarket?.access_token_valid,
  )
  const { label, tone, title } = dataModePresentation({
    forceLive,
    demo,
    apiReachable,
    eodStatus: eodHealth?.status,
    eodAsOf: eodHealth?.latest_trade_date ?? eodHealth?.last_successful_eod_date,
    liveQuotesUnavailable,
  })
  const down = tone === 'loss'
  const color = tone === 'loss' ? 'var(--loss)' : tone === 'gain' ? 'var(--gain)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-tertiary)'

  return (
    <Link
      href="/data"
      className="app-toolbar-pill"
      title={title}
      style={{ textDecoration: 'none' }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: down ? '0 0 0 3px rgba(255,92,108,0.14)' : demo ? '0 0 0 3px rgba(217,119,6,0.14)' : undefined,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </Link>
  )
}

/* ── MARKET STATUS ───────────────────────────────────────────────────────── */
function MarketStatus() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const check = () => {
      const now = new Date()
      const istOffset = 5.5 * 60 * 60 * 1000
      const ist = new Date(now.getTime() + istOffset)
      const h = ist.getUTCHours() + ist.getUTCMinutes() / 60
      const day = ist.getUTCDay()
      setIsOpen(day >= 1 && day <= 5 && h >= 9.25 && h < 15.5)
    }
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-toolbar-pill">
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isOpen ? 'var(--gain)' : 'var(--text-tertiary)',
        boxShadow: isOpen ? '0 0 0 3px rgba(45, 181, 116, 0.15)' : undefined,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: isOpen ? 'var(--gain)' : 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
      }}>
        NSE {isOpen ? 'Open' : 'Closed'}
      </span>
    </div>
  )
}

/* ── ACCOUNT MENU ────────────────────────────────────────────────────────── */
function AccountMenuButton({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function signOut() {
    const { createClient } = await import('@/lib/supabase/client')
    clearAuthHeaderCache()
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 34, height: 34,
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(244,247,251,0.10), rgba(255,255,255,0.02)), var(--surface-2)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--text-primary)',
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        A
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 180,
          background: 'var(--surface-float)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-panel)',
          padding: 4,
          zIndex: 100,
        }}>
          {[
            { label: 'Settings', href: '/settings' },
            { label: 'Upload trade report', href: '/upload' },
            { label: 'Agent mission control', href: '/agents' },
            { label: 'Billing',  href: '/settings/billing' },
            { label: 'Broker',   href: '/settings/broker' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '7px 10px',
                fontSize: 12, color: 'var(--text-secondary)',
                borderRadius: 4,
                transition: 'background var(--motion-instant)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {item.label}
            </Link>
          ))}
          <div
            style={{
              padding: '7px 10px',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              lineHeight: 1.45,
            }}
          >
            Theme follows your site preference across public and app pages.
          </div>
          <button
            onClick={() => {
              onToggleTheme()
              setOpen(false)
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '7px 10px',
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderRadius: 4,
              transition: 'background var(--motion-instant)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Switch to {theme === 'light' ? 'dark' : 'light'} theme
          </button>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          <button
            onClick={signOut}
            style={{
              width: '100%', textAlign: 'left',
              padding: '7px 10px',
              fontSize: 12, color: 'var(--loss)',
              cursor: 'pointer', background: 'none', border: 'none',
              borderRadius: 4,
              transition: 'background var(--motion-instant)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--loss-subtle)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/* ── SYMBOL SEARCH ──────────────────────────────────────────────────────── */
function SymbolSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SymbolResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { state, rememberSymbol } = useWorkflowState()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (!typing && e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function search(q: string) {
    if (!q) { setResults([]); setError(''); setOpen(false); return }
    setLoading(true)
    try {
      const data = await searchSymbols(q)
      setResults(data.slice(0, 7))
      setError('')
      setOpen(true)
    } catch (error) {
      setResults([])
      setError(error instanceof Error ? error.message : 'Symbol search is temporarily unavailable.')
      setOpen(true)
    }
    finally { setLoading(false) }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.toUpperCase()
    setQuery(q)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 200)
  }

  function select(result: SearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    if (isCommandResult(result)) {
      router.push(result.href)
    } else {
      rememberSymbol(result.symbol)
      router.push(`/watchlist?symbol=${result.symbol}`)
    }
    inputRef.current?.blur()
  }

  const quickResults = useMemo<SearchResult[]>(() => {
    if (!query.length) return []
    const needle = query.replace(/^\//, '').toLowerCase()
    const commands = COMMAND_RESULTS
      .filter(item => item.command.includes(needle) || item.label.toLowerCase().includes(needle) || item.detail.toLowerCase().includes(needle))
      .slice(0, 4)
    const symbols = [
        ...state.recentSymbols
          .filter(symbol => symbol.includes(query))
          .map(symbol => ({ symbol, company_name: 'Recent workflow symbol', sector: 'Recent', series: 'EQ' })),
        ...state.shortlist
          .filter(item => item.symbol.includes(query))
          .map(item => ({ symbol: item.symbol, company_name: item.companyName ?? 'Saved symbol', sector: item.lifecycle, series: 'EQ' })),
      ].filter((item, index, arr) => arr.findIndex(other => other.symbol === item.symbol) === index).slice(0, 5)
    return [...commands, ...symbols]
  }, [query, state.recentSymbols, state.shortlist])
  const displayResults: SearchResult[] = results.length > 0 ? results : quickResults

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
      <div className="app-search-shell">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          suppressHydrationWarning
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
            if (e.key === 'Enter' && displayResults[0]) select(displayResults[0])
          }}
          placeholder="Search symbol or command..."
          className="app-search-input"
        />
        <kbd style={{
          fontSize: 10,
          padding: '2px 5px',
          background: 'var(--surface-3)',
          color: 'var(--text-tertiary)',
          borderRadius: 3,
          fontFamily: 'var(--font-mono)',
          border: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          ⌘K
        </kbd>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          borderRadius: '16px',
          overflow: 'hidden',
          zIndex: 100,
        }} className="app-float-panel">
          {loading && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Searching...
            </div>
          )}
          {!loading && displayResults.length === 0 && (
            <div data-testid={error ? 'global-symbol-search-unavailable' : undefined} style={{ padding: 14, fontSize: 12, color: error ? 'var(--warn)' : 'var(--text-tertiary)', textAlign: 'center' }}>
              {error || 'No matches'}
            </div>
          )}
          {!loading && error && displayResults.length > 0 && (
            <div data-testid="global-symbol-search-unavailable" style={{ padding: 10, fontSize: 12, color: 'var(--warn)', lineHeight: 1.45, borderBottom: '1px solid var(--border-subtle)' }}>
              {error}
            </div>
          )}
          {displayResults.map((r, i) => (
            <div
              key={isCommandResult(r) ? r.href : r.symbol}
              onMouseDown={() => select(r)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 12px',
                cursor: 'pointer',
                borderBottom: i < displayResults.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                transition: 'background var(--motion-instant) var(--ease-out)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {isCommandResult(r) ? r.label : r.symbol}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--text-tertiary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {isCommandResult(r) ? r.detail : r.company_name}
                </span>
              </div>
              <span style={{
                fontSize: 10, color: 'var(--text-tertiary)',
                flexShrink: 0, marginLeft: 12,
              }}>
                {isCommandResult(r) ? 'Command' : r.sector}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
