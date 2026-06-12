export type ScannerFilterState = {
  price_min: string
  price_max: string
  pct_change_min: string
  pct_change_max: string
  volume_ratio_min: string
  volume_ratio_max: string
  rsi_min: string
  rsi_max: string
  adx_min: string
  adx_max: string
  price_vs_ema20: string
  price_vs_ema50: string
  price_vs_ema150: string
  price_vs_ema200: string
  price_vs_sma20: string
  price_vs_sma50: string
  price_vs_sma150: string
  price_vs_sma200: string
  ema20_vs_ema50: string
  ema50_vs_ema200: string
  macd_hist_positive: string
  bb_position: string
  bb_width_min: string
  bb_width_max: string
  atr_pct_min: string
  atr_pct_max: string
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
  new_52w_high: boolean
  new_52w_low: boolean
  is_inside_bar: boolean
  series: string[]
  market_cap_min: string
  market_cap_max: string
  pe_min: string
  pe_max: string
  pb_min: string
  pb_max: string
  eps_min: string
  eps_max: string
  dividend_yield_min: string
  dividend_yield_max: string
  debt_to_equity_max: string
  roe_min: string
  roce_min: string
}

export type ScannerActiveFilterChip = {
  id: string
  label: string
  section: string
  clear: Partial<ScannerFilterState>
}

type ChipContext = {
  activePresetName?: string | null
}

function rangeLabel(label: string, min: string, max: string): string | null {
  if (min && max) return `${label} ${min}–${max}`
  if (min) return `${label} ≥ ${min}`
  if (max) return `${label} ≤ ${max}`
  return null
}

function segAboveBelow(prefix: string, value: string): string | null {
  if (value === 'above') return `${prefix} above`
  if (value === 'below') return `${prefix} below`
  return null
}

function segGoldenDeath(prefix: string, value: string): string | null {
  if (value === 'golden') return `${prefix} golden`
  if (value === 'death') return `${prefix} death`
  return null
}

const BB_POSITION_LABELS: Record<string, string> = {
  above_upper: 'BB above upper',
  below_lower: 'BB below lower',
  near_upper: 'BB near upper',
  near_lower: 'BB near lower',
  inside: 'BB inside',
}

export function buildScannerActiveFilterChips(
  filters: ScannerFilterState,
  context: ChipContext = {},
): ScannerActiveFilterChip[] {
  const chips: ScannerActiveFilterChip[] = []

  if (context.activePresetName) {
    chips.push({
      id: 'preset',
      label: context.activePresetName,
      section: 'preset',
      clear: {},
    })
  }

  const price = rangeLabel('Price', filters.price_min, filters.price_max)
  if (price) {
    chips.push({ id: 'price', label: price, section: 'price', clear: { price_min: '', price_max: '' } })
  }

  const change = rangeLabel('Change %', filters.pct_change_min, filters.pct_change_max)
  if (change) {
    chips.push({
      id: 'pct_change',
      label: change,
      section: 'price',
      clear: { pct_change_min: '', pct_change_max: '' },
    })
  }

  const volume = rangeLabel('Vol ratio', filters.volume_ratio_min, filters.volume_ratio_max)
  if (volume) {
    chips.push({
      id: 'volume_ratio',
      label: volume,
      section: 'liquidity',
      clear: { volume_ratio_min: '', volume_ratio_max: '' },
    })
  }

  const emaSegs: Array<{ key: keyof ScannerFilterState; prefix: string; section: string }> = [
    { key: 'price_vs_ema20', prefix: 'EMA 20', section: 'trend' },
    { key: 'price_vs_ema50', prefix: 'EMA 50', section: 'trend' },
    { key: 'price_vs_ema150', prefix: 'EMA 150', section: 'trend' },
    { key: 'price_vs_ema200', prefix: 'EMA 200', section: 'trend' },
    { key: 'price_vs_sma50', prefix: 'SMA 50', section: 'trend' },
    { key: 'price_vs_sma150', prefix: 'SMA 150', section: 'trend' },
    { key: 'price_vs_sma200', prefix: 'SMA 200', section: 'trend' },
  ]
  for (const seg of emaSegs) {
    const label = segAboveBelow(seg.prefix, filters[seg.key] as string)
    if (label) {
      chips.push({ id: String(seg.key), label, section: seg.section, clear: { [seg.key]: '' } })
    }
  }

  const crossSegs: Array<{ key: keyof ScannerFilterState; prefix: string }> = [
    { key: 'ema20_vs_ema50', prefix: 'EMA 20/50' },
    { key: 'ema50_vs_ema200', prefix: 'EMA 50/200' },
  ]
  for (const seg of crossSegs) {
    const label = segGoldenDeath(seg.prefix, filters[seg.key] as string)
    if (label) {
      chips.push({ id: String(seg.key), label, section: 'trend', clear: { [seg.key]: '' } })
    }
  }

  const trendToggles: Array<{ key: keyof ScannerFilterState; label: string }> = [
    { key: 'ema50_above_ema150', label: 'EMA 50 > EMA 150' },
    { key: 'ema150_above_ema200', label: 'EMA 150 > EMA 200' },
    { key: 'all_emas_bullish', label: 'All EMAs bullish' },
    { key: 'all_smas_bullish', label: 'All SMAs bullish' },
    { key: 'ema_200_trending_up', label: 'EMA 200 trending up' },
  ]
  for (const toggle of trendToggles) {
    if (filters[toggle.key]) {
      chips.push({
        id: String(toggle.key),
        label: toggle.label,
        section: 'trend',
        clear: { [toggle.key]: false },
      })
    }
  }

  const rsi = rangeLabel('RSI', filters.rsi_min, filters.rsi_max)
  if (rsi) {
    chips.push({ id: 'rsi', label: rsi, section: 'strength', clear: { rsi_min: '', rsi_max: '' } })
  }

  const adx = rangeLabel('ADX', filters.adx_min, filters.adx_max)
  if (adx) {
    chips.push({ id: 'adx', label: adx, section: 'strength', clear: { adx_min: '', adx_max: '' } })
  }

  if (filters.macd_hist_positive === 'positive') {
    chips.push({
      id: 'macd_positive',
      label: 'MACD positive',
      section: 'strength',
      clear: { macd_hist_positive: '' },
    })
  } else if (filters.macd_hist_positive === 'negative') {
    chips.push({
      id: 'macd_negative',
      label: 'MACD negative',
      section: 'strength',
      clear: { macd_hist_positive: '' },
    })
  }

  if (filters.vcp_contraction) {
    chips.push({
      id: 'vcp',
      label: 'VCP',
      section: 'setup',
      clear: { vcp_contraction: false },
    })
  }

  if (filters.vcp_min_pivots) {
    chips.push({
      id: 'vcp_min_pivots',
      label: `VCP pivots ≥ ${filters.vcp_min_pivots}`,
      section: 'setup',
      clear: { vcp_min_pivots: '' },
    })
  }

  if (filters.vcp_max_depth_pct) {
    chips.push({
      id: 'vcp_max_depth_pct',
      label: `VCP depth ≤ ${filters.vcp_max_depth_pct}%`,
      section: 'setup',
      clear: { vcp_max_depth_pct: '' },
    })
  }

  if (filters.vcp_pivot_proximity_pct) {
    chips.push({
      id: 'vcp_pivot_proximity_pct',
      label: `Pivot within ${filters.vcp_pivot_proximity_pct}%`,
      section: 'setup',
      clear: { vcp_pivot_proximity_pct: '' },
    })
  }

  if (filters.bb_position) {
    chips.push({
      id: 'bb_position',
      label: BB_POSITION_LABELS[filters.bb_position] ?? `BB ${filters.bb_position}`,
      section: 'setup',
      clear: { bb_position: '' },
    })
  }

  const bbWidth = rangeLabel('BB width', filters.bb_width_min, filters.bb_width_max)
  if (bbWidth) {
    chips.push({
      id: 'bb_width',
      label: bbWidth,
      section: 'setup',
      clear: { bb_width_min: '', bb_width_max: '' },
    })
  }

  const atr = rangeLabel('ATR %', filters.atr_pct_min, filters.atr_pct_max)
  if (atr) {
    chips.push({ id: 'atr_pct', label: atr, section: 'volatility', clear: { atr_pct_min: '', atr_pct_max: '' } })
  }

  if (filters.week_52_high_pct_max) {
    chips.push({
      id: 'week_52_high_pct_max',
      label: `≤ ${filters.week_52_high_pct_max}% below 52W high`,
      section: 'range',
      clear: { week_52_high_pct_max: '' },
    })
  }

  if (filters.w52l_pct_min) {
    chips.push({
      id: 'w52l_pct_min',
      label: `≥ ${filters.w52l_pct_min}% above 52W low`,
      section: 'range',
      clear: { w52l_pct_min: '' },
    })
  }

  if (filters.rs_score_min) {
    chips.push({
      id: 'rs_score_min',
      label: `RS ≥ ${filters.rs_score_min}`,
      section: 'range',
      clear: { rs_score_min: '' },
    })
  }

  if (filters.new_52w_high) {
    chips.push({ id: 'new_52w_high', label: 'New 52W high', section: 'range', clear: { new_52w_high: false } })
  }

  if (filters.new_52w_low) {
    chips.push({ id: 'new_52w_low', label: 'New 52W low', section: 'range', clear: { new_52w_low: false } })
  }

  if (filters.is_inside_bar) {
    chips.push({ id: 'is_inside_bar', label: 'Inside bar', section: 'patterns', clear: { is_inside_bar: false } })
  }

  if (filters.nr7) {
    chips.push({ id: 'nr7', label: 'NR7', section: 'patterns', clear: { nr7: false } })
  }

  const marketCap = rangeLabel('Mkt cap (Cr)', filters.market_cap_min, filters.market_cap_max)
  if (marketCap) {
    chips.push({
      id: 'market_cap',
      label: marketCap,
      section: 'fundamentals',
      clear: { market_cap_min: '', market_cap_max: '' },
    })
  }

  const pe = rangeLabel('P/E', filters.pe_min, filters.pe_max)
  if (pe) {
    chips.push({ id: 'pe', label: pe, section: 'fundamentals', clear: { pe_min: '', pe_max: '' } })
  }

  const pb = rangeLabel('P/B', filters.pb_min, filters.pb_max)
  if (pb) {
    chips.push({ id: 'pb', label: pb, section: 'fundamentals', clear: { pb_min: '', pb_max: '' } })
  }

  const eps = rangeLabel('EPS', filters.eps_min, filters.eps_max)
  if (eps) {
    chips.push({ id: 'eps', label: eps, section: 'fundamentals', clear: { eps_min: '', eps_max: '' } })
  }

  if (filters.roe_min) {
    chips.push({ id: 'roe_min', label: `ROE ≥ ${filters.roe_min}%`, section: 'fundamentals', clear: { roe_min: '' } })
  }

  if (filters.roce_min) {
    chips.push({ id: 'roce_min', label: `ROCE ≥ ${filters.roce_min}%`, section: 'fundamentals', clear: { roce_min: '' } })
  }

  const dividend = rangeLabel('Div yield %', filters.dividend_yield_min, filters.dividend_yield_max)
  if (dividend) {
    chips.push({
      id: 'dividend_yield',
      label: dividend,
      section: 'fundamentals',
      clear: { dividend_yield_min: '', dividend_yield_max: '' },
    })
  }

  if (filters.debt_to_equity_max) {
    chips.push({
      id: 'debt_to_equity_max',
      label: `D/E ≤ ${filters.debt_to_equity_max}`,
      section: 'fundamentals',
      clear: { debt_to_equity_max: '' },
    })
  }

  return chips
}

export function clearScannerFilterSection(
  filters: ScannerFilterState,
  section: string,
): Partial<ScannerFilterState> {
  const chips = buildScannerActiveFilterChips(filters)
  const patch: Partial<ScannerFilterState> = {}
  for (const chip of chips) {
    if (chip.section !== section) continue
    Object.assign(patch, chip.clear)
  }
  return patch
}
