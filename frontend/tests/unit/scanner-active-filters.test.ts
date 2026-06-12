import { describe, expect, it } from 'vitest'
import {
  buildScannerActiveFilterChips,
  clearScannerFilterSection,
  type ScannerFilterState,
} from '@/lib/scanner-active-filters'

const emptyFilters = (): ScannerFilterState => ({
  price_min: '',
  price_max: '',
  pct_change_min: '',
  pct_change_max: '',
  volume_ratio_min: '',
  volume_ratio_max: '',
  rsi_min: '',
  rsi_max: '',
  adx_min: '',
  adx_max: '',
  price_vs_ema20: '',
  price_vs_ema50: '',
  price_vs_ema150: '',
  price_vs_ema200: '',
  price_vs_sma20: '',
  price_vs_sma50: '',
  price_vs_sma150: '',
  price_vs_sma200: '',
  ema20_vs_ema50: '',
  ema50_vs_ema200: '',
  macd_hist_positive: '',
  bb_position: '',
  bb_width_min: '',
  bb_width_max: '',
  atr_pct_min: '',
  atr_pct_max: '',
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
  new_52w_high: false,
  new_52w_low: false,
  is_inside_bar: false,
  series: ['EQ'],
  market_cap_min: '',
  market_cap_max: '',
  pe_min: '',
  pe_max: '',
  pb_min: '',
  pb_max: '',
  eps_min: '',
  eps_max: '',
  dividend_yield_min: '',
  dividend_yield_max: '',
  debt_to_equity_max: '',
  roe_min: '',
  roce_min: '',
})

describe('buildScannerActiveFilterChips', () => {
  it('returns no chips for default filters', () => {
    expect(buildScannerActiveFilterChips(emptyFilters())).toEqual([])
  })

  it('summarizes EMA and RS filters', () => {
    const chips = buildScannerActiveFilterChips({
      ...emptyFilters(),
      price_vs_ema20: 'above',
      rs_score_min: '70',
    })

    expect(chips.map(chip => chip.label)).toEqual(['EMA 20 above', 'RS ≥ 70'])
  })

  it('includes preset name when provided', () => {
    const chips = buildScannerActiveFilterChips(
      { ...emptyFilters(), vcp_contraction: true },
      { activePresetName: 'VCP Breakout' },
    )

    expect(chips[0]).toMatchObject({ id: 'preset', label: 'VCP Breakout', section: 'preset' })
    expect(chips.some(chip => chip.label === 'VCP')).toBe(true)
  })
})

describe('clearScannerFilterSection', () => {
  it('clears all trend section filters', () => {
    const filters = {
      ...emptyFilters(),
      price_vs_ema20: 'above',
      rs_score_min: '70',
      all_emas_bullish: true,
    }

    expect(clearScannerFilterSection(filters, 'trend')).toEqual({
      price_vs_ema20: '',
      all_emas_bullish: false,
    })
  })
})
