'use client'

import { useMemo, useState } from 'react'
import { Button, Card, Num } from '@/components/ui'
import { countJournalReadyTrades, importTradeReportToJournal, type TradeReportJournalImportResult } from '@/lib/trade-report-journal'
import { parseTradeReportCsv, sampleTradeReportCsv, type TradeReportParseResult } from '@/lib/trade-report-import'

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return `${value < 0 ? '-' : ''}₹${formatted}`
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function formatRatio(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}×`
}

function formatDays(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} days`
}

function insight(result: TradeReportParseResult): string {
  const { summary } = result
  if (summary.parsedTrades === 0) return 'Upload a broker CSV with symbol and P&L columns to generate analytics.'
  if ((summary.chargesToGrossProfitPct ?? 0) >= 15) {
    return 'Transaction costs are taking a meaningful share of gross profit. Check whether sizing, churn, or product choice is diluting the edge.'
  }
  if ((summary.largestSymbolPnlSharePct ?? 0) >= 50) {
    return `${summary.largestSymbol} is driving more than half of absolute P&L. Review whether this is deliberate specialization or accidental concentration.`
  }
  if (summary.profitFactor != null && summary.profitFactor < 1) {
    return 'Losses are larger than wins in this report. Review worst symbols and holding periods before adding new risk.'
  }
  if (summary.winRate < 40 && summary.totalPnl > 0) {
    return 'The report is profitable with a low win rate, so preserving average winner size is critical.'
  }
  if (summary.maxDrawdown > Math.max(1, Math.abs(summary.totalPnl) * 0.5)) {
    return 'Drawdown is large relative to net P&L. Check whether position size or repeated setup losses caused the dip.'
  }
  return 'Use the symbol and monthly breakdowns to decide which setups deserve deeper journal review.'
}

export default function UploadPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<TradeReportParseResult | null>(null)
  const [journalImporting, setJournalImporting] = useState(false)
  const [journalImportResult, setJournalImportResult] = useState<TradeReportJournalImportResult | null>(null)
  const parsedPreview = useMemo(() => csvText.trim() ? parseTradeReportCsv(csvText) : null, [csvText])
  const result = analysisResult
  const journalReadyCount = result ? countJournalReadyTrades(result) : 0
  const previewJournalReadyCount = parsedPreview ? countJournalReadyTrades(parsedPreview) : 0

  async function loadFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    setFileName(file.name)
    setCsvText(text)
    setAnalysisResult(null)
    setJournalImportResult(null)
  }

  function analyseReport() {
    if (!parsedPreview) return
    setAnalysisResult(parsedPreview)
    setJournalImportResult(null)
  }

  async function importToJournal() {
    if (!result || journalReadyCount === 0) return
    setJournalImporting(true)
    setJournalImportResult(null)
    try {
      setJournalImportResult(await importTradeReportToJournal(result))
    } catch (error) {
      setJournalImportResult({
        imported: 0,
        skipped: 0,
        ineligible: result.trades.length - journalReadyCount,
        total: result.trades.length,
        message: error instanceof Error ? error.message : 'Journal import failed',
      })
    } finally {
      setJournalImporting(false)
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Trade report analytics</div>
        <h1 className="heading-page">Upload trade report</h1>
        <p className="body-secondary" style={{ marginTop: 8, maxWidth: 760 }}>
          Import a broker CSV or paste an export from Zerodha, Upstox, Groww, or a spreadsheet.
          AlphaVyuh normalizes completed trades locally and shows P&L, win rate, drawdown, symbol concentration, and rejected rows before you choose what to save.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
        <Card padding="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 className="heading-card" style={{ marginBottom: 4 }}>Import source</h2>
              <div className="caption">CSV is parsed in the browser. Convert PDF contract notes or screenshots to CSV before import.</div>
            </div>
            <label className="workspace-chip-button" style={{ display: 'inline-flex', alignSelf: 'flex-start', cursor: 'pointer' }}>
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void loadFile(event.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </label>
            {fileName && <div className="caption">Loaded {fileName}</div>}
            <textarea
              value={csvText}
              onChange={(event) => {
                setFileName(null)
                setCsvText(event.target.value)
                setAnalysisResult(null)
                setJournalImportResult(null)
              }}
              placeholder="Paste broker CSV here. Required: symbol and either P&L or entry/exit price with quantity."
              style={{
                minHeight: 260,
                width: '100%',
                resize: 'vertical',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                padding: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.55,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="primary" onClick={() => { setCsvText(sampleTradeReportCsv()); setAnalysisResult(null); setJournalImportResult(null); }}>Use sample report</Button>
              <Button size="sm" variant="ghost" onClick={() => { setCsvText(''); setFileName(null); setAnalysisResult(null); setJournalImportResult(null); }}>Clear</Button>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 className="heading-card" style={{ marginBottom: 4 }}>Import quality</h2>
              <div className="caption">Review the parse before converting rows into journal entries.</div>
            </div>
            {parsedPreview ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  {[
                    ['Broker format', parsedPreview.summary.broker],
                    ['Rows parsed', `${parsedPreview.summary.parsedTrades}/${parsedPreview.summary.totalRows}`],
                    ['Rejected rows', String(parsedPreview.summary.rejectedRows)],
                    ['Journal-ready', String(previewJournalReadyCount)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', padding: 12 }}>
                      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderRadius: 12, padding: 12, background: 'rgba(91, 99, 245, 0.10)', border: '1px solid rgba(91, 99, 245, 0.22)' }}>
                  <div className="label" style={{ marginBottom: 6 }}>{result ? 'Review prompt' : 'Ready to analyze'}</div>
                  <div className="body-secondary">
                    {result ? insight(result) : 'Preview looks loaded. Click Analyze report when you are ready to generate P&L, win rate, drawdown, concentration, and journal handoff analytics.'}
                  </div>
                  {!result && (
                    <div style={{ marginTop: 10 }}>
                      <Button size="sm" variant="primary" onClick={analyseReport} disabled={parsedPreview.summary.parsedTrades === 0}>
                        Analyze report
                      </Button>
                    </div>
                  )}
                </div>
                {parsedPreview.rejected.length > 0 && (
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Rows needing cleanup</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {parsedPreview.rejected.slice(0, 4).map((row) => (
                        <div key={row.row} className="caption" style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 8 }}>
                          Row {row.row}: {row.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result && (
                <div style={{ borderRadius: 12, padding: 12, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                  <div className="label" style={{ marginBottom: 6 }}>Journal handoff</div>
                  <div className="caption" style={{ marginBottom: 10 }}>
                    Rows with entry date, exit date, quantity, entry price, and exit price can be saved as closed journal trades with broker-report source labels.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void importToJournal()}
                      disabled={journalImporting || journalReadyCount === 0}
                      data-testid="trade-report-journal-import"
                    >
                      {journalImporting ? 'Importing...' : `Import ${journalReadyCount} to journal`}
                    </Button>
                    <a href="/journal?review=needs-review" className="workspace-chip-button" style={{ textDecoration: 'none' }}>
                      Open journal review
                    </a>
                  </div>
                  {journalImportResult && (
                    <div className="caption" data-testid="trade-report-journal-import-result" style={{ marginTop: 10 }}>
                      {journalImportResult.message} Imported {journalImportResult.imported}, skipped {journalImportResult.skipped}, not journal-ready {journalImportResult.ineligible}.
                    </div>
                  )}
                </div>
                )}
              </>
            ) : (
              <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No report loaded</div>
                <div className="caption">Choose a CSV or use the sample report to see the analytics preview.</div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {parsedPreview && !result && parsedPreview.summary.parsedTrades > 0 && (
        <Card padding="lg">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 className="heading-card" style={{ marginBottom: 4 }}>Report preview ready</h2>
              <div className="caption">
                Parsed {parsedPreview.summary.parsedTrades} rows. Analysis will run only after you confirm.
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={analyseReport}>
              Analyze report
            </Button>
          </div>
        </Card>
      )}

      {result && result.summary.parsedTrades > 0 && (
        <>
          <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            {[
              ['Net P&L', formatCurrency(result.summary.totalPnl), result.summary.totalPnl >= 0 ? 'var(--gain)' : 'var(--loss)'],
              ['Win rate', formatPercent(result.summary.winRate), result.summary.winRate >= 50 ? 'var(--gain)' : 'var(--warn)'],
              ['Profit factor', result.summary.profitFactor == null ? '—' : result.summary.profitFactor.toFixed(2), (result.summary.profitFactor ?? 0) >= 1.5 ? 'var(--gain)' : 'var(--warn)'],
              ['Max drawdown', formatCurrency(-result.summary.maxDrawdown), result.summary.maxDrawdown > 0 ? 'var(--loss)' : 'var(--gain)'],
            ].map(([label, value, color]) => (
              <Card key={label} padding="md">
                <div className="label" style={{ marginBottom: 8 }}>{label}</div>
                <Num style={{ color, fontSize: 24, fontWeight: 750 }}>{value}</Num>
              </Card>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
            <Card padding="lg">
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Symbol concentration</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.summary.symbolBreakdown.slice(0, 8).map((row) => (
                  <div key={row.symbol} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{row.symbol}</strong>
                    <span className="caption">{row.trades} trades</span>
                    <Num style={{ color: row.pnl >= 0 ? 'var(--gain)' : 'var(--loss)', textAlign: 'right' }}>{formatCurrency(row.pnl)}</Num>
                    <Num style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{formatPercent(row.winRate)}</Num>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Monthly P&amp;L</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.summary.monthlyPnl.map((row) => (
                  <div key={row.month} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{row.month}</strong>
                    <span className="caption">{row.trades} trades</span>
                    <Num style={{ color: row.pnl >= 0 ? 'var(--gain)' : 'var(--loss)', textAlign: 'right' }}>{formatCurrency(row.pnl)}</Num>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Trade quality</h2>
              <div data-testid="trade-report-quality" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  ['Expectancy', formatCurrency(result.summary.expectancy)],
                  ['Payoff ratio', formatRatio(result.summary.payoffRatio)],
                  ['Avg win', formatCurrency(result.summary.averageWin)],
                  ['Avg loss', formatCurrency(result.summary.averageLoss)],
                  ['Avg hold', formatDays(result.summary.averageHoldingDays)],
                  ['Best trade', result.summary.bestTrade ? `${result.summary.bestTrade.symbol} ${formatCurrency(result.summary.bestTrade.pnl)}` : '—'],
                  ['Worst trade', result.summary.worstTrade ? `${result.summary.worstTrade.symbol} ${formatCurrency(result.summary.worstTrade.pnl)}` : '—'],
                  ['Breakeven', String(result.summary.breakeven)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 10, background: 'var(--surface-2)' }}>
                    <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 750, fontSize: 13 }}>{value}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Cost and concentration</h2>
              <div data-testid="trade-report-risk-audit" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  ['Reported charges', formatCurrency(result.summary.totalCharges)],
                  ['Avg charge/trade', formatCurrency(result.summary.averageChargePerTrade)],
                  ['Cost drag', formatPercent(result.summary.chargesToGrossProfitPct)],
                  ['Top symbol', result.summary.largestSymbol ?? '—'],
                  ['P&L share', formatPercent(result.summary.largestSymbolPnlSharePct)],
                  ['Trade share', formatPercent(result.summary.largestSymbolTradeSharePct)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 10, background: 'var(--surface-2)' }}>
                    <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 750, fontSize: 13 }}>{value}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card padding="lg">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h2 className="heading-card">Normalized trades</h2>
              <div className="caption">First 20 parsed rows</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'P&L', 'Return'].map((head) => (
                      <th key={head} className="label" style={{ textAlign: 'left', padding: '0 12px 8px 0' }}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(0, 20).map((trade) => (
                    <tr key={`${trade.sourceRow}-${trade.symbol}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '9px 12px 9px 0', fontWeight: 700, color: 'var(--text-primary)' }}>{trade.symbol}</td>
                      <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-secondary)' }}>{trade.tradeType}</td>
                      <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-secondary)' }}>{trade.quantity ?? '—'}</td>
                      <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-secondary)' }}>{trade.entryDate ?? '—'} {trade.entryPrice != null ? `@ ${trade.entryPrice}` : ''}</td>
                      <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-secondary)' }}>{trade.exitDate ?? '—'} {trade.exitPrice != null ? `@ ${trade.exitPrice}` : ''}</td>
                      <td style={{ padding: '9px 12px 9px 0' }}><Num style={{ color: trade.pnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{formatCurrency(trade.pnl)}</Num></td>
                      <td style={{ padding: '9px 0' }}><Num>{formatPercent(trade.pnlPct)}</Num></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
