'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/scanner',   label: 'Scanner' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/journal',   label: 'Journal' },
]

type SymbolResult = { symbol: string; company_name: string; sector: string }

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname.startsWith('/onboarding')) return <>{children}</>

  return (
    <div className="app-shell">
      <nav className="app-topbar">
        <div className="app-topbar-inner">
          <Link href="/dashboard" className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path
                  d="M4 24 L12 8 L16 16 L20 10 L28 24"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="28" cy="24" r="2.5" fill="var(--accent)" />
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
            <MarketStatus />
            <AccountMenuButton />
          </div>
        </div>
      </nav>

      <main className="app-content">{children}</main>
    </div>
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
  const [initials, setInitials] = useState('P')
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => {
        const email = data.user?.email ?? ''
        setInitials(email[0]?.toUpperCase() ?? 'P')
      })
    })
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
          background: 'linear-gradient(180deg, rgba(86,215,193,0.12), rgba(255,255,255,0.02)), var(--surface-2)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-primary)',
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 180,
          background: 'linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-panel)',
          padding: 4,
          zIndex: 100,
        }}>
          {[
            { label: 'Settings', href: '/settings' },
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
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

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
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 200)
  }

  function select(symbol: string) {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/watchlist?symbol=${symbol}`)
    inputRef.current?.blur()
  }

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
            if (e.key === 'Enter' && results[0]) select(results[0].symbol)
          }}
          placeholder="Search symbols..."
          style={{
            flex: 1, height: '100%',
            fontSize: 12,
            color: 'var(--text-primary)',
            background: 'transparent', border: 'none', outline: 'none',
          }}
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
          {!loading && results.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No matches
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.symbol}
              onMouseDown={() => select(r.symbol)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 12px',
                cursor: 'pointer',
                borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
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
