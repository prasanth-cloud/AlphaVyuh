'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import TraderReminderStrip from '@/components/TraderReminderStrip'
import FeedbackWidget from '@/components/FeedbackWidget'
import { clearAuthHeaderCache, warmCoreMarketData, warmSecondaryWorkflowData } from '@/lib/api'
import { markAppTiming } from '@/lib/performance'
import { useWorkflowState } from '@/lib/workflow'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/scanner',   label: 'Scanner' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/journal',   label: 'Journal' },
]

const IDLE_PREFETCH_ROUTES = [
  '/dashboard',
  '/scanner',
  '/watchlist',
]

type SymbolResult = { symbol: string; company_name: string; sector: string }

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fullChart = pathname.startsWith('/charts/') && searchParams.get('full') === '1'
  const router = useRouter()
  const [reminderDismissed, setReminderDismissed] = useState(false)

  useEffect(() => {
    window.requestAnimationFrame(() => markAppTiming('first-app-shell-paint'))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    window.localStorage.setItem('alphavyuh-theme', 'dark')
    window.dispatchEvent(new CustomEvent('alphavyuh:theme-changed', { detail: 'dark' }))
    setReminderDismissed(window.localStorage.getItem('alphavyuh-reminder-strip') === 'dismissed')
  }, [])

  useEffect(() => {
    const prefetchCoreRoutes = () => {
      for (const href of IDLE_PREFETCH_ROUTES) {
        if (href !== pathname) {
          router.prefetch(href)
        }
      }
    }

    const warmData = () => warmCoreMarketData()
    const warmSecondaryData = () => warmSecondaryWorkflowData()

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
            <AccountMenuButton />
          </div>
        </div>
        {!reminderDismissed && (
          <div className="reminder-strip-shell">
            <TraderReminderStrip tone="app" />
            <button
              type="button"
              className="reminder-strip-dismiss"
              aria-label="Dismiss trading reminder strip"
              onClick={() => {
                window.localStorage.setItem('alphavyuh-reminder-strip', 'dismissed')
                setReminderDismissed(true)
              }}
            >
              ×
            </button>
          </div>
        )}
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
  const configuredMock = process.env.NEXT_PUBLIC_DATA_MODE === 'mock'
  const allowFallback = process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === 'true'
  const demo = !forceLive && (configuredMock || allowFallback)
  const label = forceLive ? 'Provider data' : demo ? 'Demo data' : 'EOD data'
  const color = forceLive ? 'var(--gain)' : demo ? 'var(--warn)' : 'var(--text-tertiary)'
  const title = forceLive
    ? 'Provider-data mode. Private beta still treats market data as informational and requires source/freshness checks.'
    : demo
      ? 'Demo data mode. Charts and market views use deterministic sample data when EOD data is unavailable.'
      : 'EOD data mode. Market views use the latest completed market session.'

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
        boxShadow: demo ? '0 0 0 3px rgba(217,119,6,0.14)' : undefined,
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
function AccountMenuButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    window.localStorage.setItem('alphavyuh-theme', 'dark')
  }, [])

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
            Authenticated workspace locked to dark trading desk mode.
          </div>
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
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { state, rememberSymbol } = useWorkflowState()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function search(q: string) {
    if (!q) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { data } = await sb
        .from('stock_universe')
        .select('symbol, company_name, sector')
        .or(`symbol.ilike.${q}%,company_name.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(7)
      setResults(data || [])
      setOpen(true)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.toUpperCase()
    setQuery(q)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 200)
  }

  function select(symbol: string) {
    setQuery('')
    setResults([])
    setOpen(false)
    rememberSymbol(symbol)
    router.push(`/watchlist?symbol=${symbol}`)
    inputRef.current?.blur()
  }

  const quickResults = query.length > 0
    ? [
        ...state.recentSymbols
          .filter(symbol => symbol.includes(query))
          .map(symbol => ({ symbol, company_name: 'Recent workflow symbol', sector: 'Recent' })),
        ...state.shortlist
          .filter(item => item.symbol.includes(query))
          .map(item => ({ symbol: item.symbol, company_name: item.companyName ?? 'Saved symbol', sector: item.lifecycle })),
      ].filter((item, index, arr) => arr.findIndex(other => other.symbol === item.symbol) === index).slice(0, 5)
    : []
  const displayResults = results.length > 0 ? results : quickResults

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
      <div className="app-search-shell">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
            if (e.key === 'Enter' && displayResults[0]) select(displayResults[0].symbol)
          }}
          placeholder="Search symbols, shortlist, recent..."
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
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No matches
            </div>
          )}
          {displayResults.map((r, i) => (
            <div
              key={r.symbol}
              onMouseDown={() => select(r.symbol)}
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
                  {r.symbol}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--text-tertiary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.company_name}
                </span>
              </div>
              <span style={{
                fontSize: 10, color: 'var(--text-tertiary)',
                flexShrink: 0, marginLeft: 12,
              }}>
                {r.sector}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
