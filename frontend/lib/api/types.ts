export type ScanResult = {
  symbol: string;
  company_name: string;
  series: string;
  sector: string | null;
  market?: string;
  currency?: string;
  close: number;
  prev_close: number;
  open: number;
  high: number;
  low: number;
  pct_change: number | null;
  gap_pct: number | null;
  volume: number;
  avg_volume_20d: number;
  avg_volume_50d?: number | null;
  volume_ratio: number | null;
  turnover: number | null;
  rsi_14: number | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_150?: number | null;
  ema_200: number | null;
  ema_200_slope_30d?: number | null;
  ema_20_dist: number | null;
  ema_50_dist: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  week_52_high_pct: number | null;
  week_52_low_pct: number | null;
  price_perf_6m_pct?: number | null;
  high_3w?: number | null;
  low_3w?: number | null;
  darvas_box_height_pct?: number | null;
  atr_14: number | null;
  atr_pct: number | null;
  turnover_cr?: number | null;
  macd_hist?: number | null;
  bb_width?: number | null;
  stoch_k?: number | null;
  adx_14?: number | null;
  delivery_pct?: number | null;
  is_new_52w_high?: boolean;
  is_nr7?: boolean | null;
  is_inside_bar?: boolean;
  rs_score?: number | null;
  match_reasons?: string[];
  data_warnings?: string[];
  setup_score?: number | null;
  setup_grade?: string | null;
  confidence_label?: string | null;
  confidence_reasons?: string[];
  scan_run_id?: string | null;
  candidate_id?: string | null;
  market_cap_cr?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
  roe?: number | null;
  roce?: number | null;
};

export type ScanFilters = {
  // Price & Performance
  price_min?: number;
  price_max?: number;
  pct_change_min?: number;
  pct_change_max?: number;
  gap_pct_min?: number;
  gap_pct_max?: number;
  high_min?: number;
  low_max?: number;
  // Volume
  volume_min?: number;
  volume_max?: number;
  volume_ratio_min?: number;
  volume_ratio_max?: number;
  turnover_min?: number;
  turnover_max?: number;
  // Momentum
  rsi_min?: number;
  rsi_max?: number;
  // Trend
  above_ema20?: boolean;
  below_ema20?: boolean;
  above_ema50?: boolean;
  below_ema50?: boolean;
  above_ema200?: boolean;
  below_ema200?: boolean;
  ema20_above_ema50?: boolean;
  ema50_above_ema200?: boolean;
  ema50_above_ema150?: boolean;
  ema150_above_ema200?: boolean;
  all_emas_bullish?: boolean;
  all_smas_bullish?: boolean;
  all_emas_bearish?: boolean;
  ema_200_trending_up?: boolean;
  ema_200_slope_30d_min?: number;
  ema_200_slope_30d_max?: number;
  ema20_dist_min?: number;
  ema20_dist_max?: number;
  ema50_dist_min?: number;
  ema50_dist_max?: number;
  // Volatility
  atr_min?: number;
  atr_max?: number;
  atr_pct_min?: number;
  atr_pct_max?: number;
  // 52-Week
  w52h_pct_max?: number;
  week_52_high_pct_max?: number;  // alias for w52h_pct_max (new scanner UI)
  w52l_pct_min?: number;
  new_52w_high?: boolean;
  new_52w_low?: boolean;
  rs_score_min?: number;
  rs_score_max?: number;
  price_perf_6m_min?: number;
  price_perf_6m_max?: number;
  avg_volume_50d_min?: number;
  avg_volume_50d_max?: number;
  darvas_box_height_pct_max?: number;
  nr7?: boolean;
  // EMA position aliases (new scanner UI: 'above' | 'below')
  price_vs_ema20?: string;
  price_vs_ema50?: string;
  price_vs_ema150?: string;
  price_vs_ema200?: string;
  price_vs_sma50?: string;
  price_vs_sma150?: string;
  price_vs_sma200?: string;
  vcp_contraction?: boolean;
  vcp_min_pivots?: number;
  vcp_max_depth_pct?: number;
  vcp_pivot_proximity_pct?: number;
  // Market
  series?: string[];
  sector?: string;
  market?: string;  // "IN" | "US" | "NSE" | "BSE" | "NASDAQ" | "NYSE"
};

export type Market = {
  key: string;
  label: string;
  currency: string;
  count: number;
};

export type ScanResponse = {
  trade_date: string | null;
  total_matches: number;
  plan_limit: number;
  plan?: string;
  mode?: DataMode;
  source?: string;
  source_metadata?: SourceMetadata;
  coverage_pct?: number | null;
  universe_size?: number | null;
  message?: string;
  scan_run_id?: string | null;
  lineage?: {
    status?: "recorded" | "unavailable";
    scan_run_id?: string | null;
  };
  results: ScanResult[];
};

export type DataMode = "live" | "eod" | "fallback" | "unknown" | "demo";

export type SourceMetadata = {
  source_name: string;
  mode: DataMode;
  as_of: string | null;
  generated_at?: string;
  confidence?: string;
  coverage_pct?: number | null;
  symbols_count?: number | null;
  universe_active?: number | null;
  cache_status?: string | null;
  license_notes?: string;
  message?: string;
};

export type ChartCoverage = {
  requested_from?: string | null;
  requested_to?: string | null;
  available_from?: string | null;
  available_to?: string | null;
  returned_candles?: number | null;
  requested_limit?: number | null;
  timeframe?: string | null;
  requested_days?: number | null;
  covered_days?: number | null;
  coverage_pct?: number | null;
  partial?: boolean;
  partial_reason?: string | null;
  source_name?: string | null;
  as_of?: string | null;
};

export type MarketSummary = {
  trade_date: string;
  advances: number;
  declines: number;
  unchanged: number;
  advance_decline_ratio: number | null;
  new_52w_highs: number;
  new_52w_lows: number;
  above_ema20_pct: number | null;
  above_ema50_pct: number | null;
  above_ema200_pct: number | null;
  total_stocks: number;
};

export type WatchlistItem = {
  symbol: string;
  sort_order: number;
  added_at: string;
  company_name?: string;
  sector?: string | null;
  close?: number;
  pct_change?: number | null;
  volume_ratio?: number | null;
  rsi_14?: number | null;
  pinned?: boolean;
  tags?: string[];
  note?: string | null;
};

export type Watchlist = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  items: WatchlistItem[];
};

export type SavedScreen = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
};

export type ScannerUniverse = "all_nse" | "nifty500" | "nifty_midsmallcap_400" | "custom";
export type ScannerFilterOperator = "and" | "or";

export type ScannerFilter = {
  id: string;
  user_id?: string;
  group_id: string;
  kind: string;
  value: unknown;
  sort_order: number;
  created_at?: string;
};

export type ScannerFilterGroup = {
  id: string;
  user_id?: string;
  scanner_definition_id: string;
  operator: ScannerFilterOperator;
  sort_order: number;
  filters: ScannerFilter[];
  created_at?: string;
};

export type ScannerDefinition = {
  id: string;
  user_id?: string;
  name: string;
  universe: ScannerUniverse;
  definition: Record<string, unknown>;
  is_active: boolean;
  groups: ScannerFilterGroup[];
  created_at: string;
  updated_at: string;
};

export type ScannerDefinitionGroupInput = {
  operator: ScannerFilterOperator;
  sort_order: number;
  filters: Array<{
    kind: string;
    value: unknown;
    sort_order: number;
  }>;
};

export type CreateScannerDefinitionRequest = {
  name: string;
  universe: ScannerUniverse;
  definition: Record<string, unknown>;
  groups: ScannerDefinitionGroupInput[];
};

export type UpdateScannerDefinitionRequest = Partial<Pick<CreateScannerDefinitionRequest, "name" | "universe" | "definition">> & {
  is_active?: boolean;
  groups?: ScannerDefinitionGroupInput[];
};

export type WatchlistItemMetadataUpdate = {
  pinned?: boolean;
  tags?: string[];
  note?: string | null;
};

export type WorkflowLifecycle =
  | "idea"
  | "watch"
  | "ready"
  | "triggered"
  | "open"
  | "closed"
  | "reviewed"
  | "invalidated"
  | "ignored"
  | "review_later";

export type SetupDirection = "long" | "short";
export type SetupStatus = "planned" | "ready" | "triggered" | "open" | "closed" | "invalidated" | "cancelled";
export type SetupSource = "scanner" | "chart" | "watchlist" | "manual";
export type SetupReviewStatus = "not_evaluated" | "passed" | "warned" | "blocked";

export type Setup = {
  id: string;
  user_id: string;
  symbol: string;
  status: SetupStatus;
  direction: SetupDirection;
  strategy_tag: string | null;
  entry_low: number | null;
  entry_high: number | null;
  stop_price: number | null;
  target_price: number | null;
  planned_risk_amount: number | null;
  planned_quantity: number | null;
  planned_rr: number | null;
  thesis: string | null;
  invalidation_reason: string | null;
  source: SetupSource;
  source_scanner_candidate_id?: string | null;
  review_status?: SetupReviewStatus;
  rulebook_id?: string | null;
  last_reviewed_at?: string | null;
  scanner_context: Record<string, unknown> | null;
  chart_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type CreateSetupRequest = {
  symbol: string;
  direction: SetupDirection;
  status?: SetupStatus;
  strategy_tag?: string | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop_price?: number | null;
  target_price?: number | null;
  planned_quantity?: number | null;
  thesis?: string | null;
  invalidation_reason?: string | null;
  source?: SetupSource;
  source_scanner_candidate_id?: string | null;
  scanner_context?: Record<string, unknown> | null;
  chart_snapshot?: Record<string, unknown> | null;
};

export type UpdateSetupRequest = Partial<Omit<CreateSetupRequest, "symbol">>;

export type SetupReviewRuleSeverity = "block" | "warn" | "check" | "info";
export type SetupReviewRuleStatus = "pass" | "fail" | "not_evaluated";

export type SetupReviewRule = {
  code: string;
  label: string;
  severity: SetupReviewRuleSeverity;
  status: SetupReviewRuleStatus;
  message: string;
  actual?: unknown;
  expected?: unknown;
  config?: Record<string, unknown>;
};

export type SetupReview = {
  id?: string | null;
  setup_id: string;
  rulebook_id: string;
  overall_status: Exclude<SetupReviewStatus, "not_evaluated">;
  can_proceed: boolean;
  summary: string;
  override_reason?: string | null;
  results: SetupReviewRule[];
  input_snapshot?: Record<string, unknown>;
  evaluated_at?: string | null;
};

export type SetupReviewRequest = {
  rulebook_id?: string | null;
  account_equity?: number | null;
  override_reason?: string | null;
};

export type RulebookRule = {
  id?: string;
  code: string;
  label: string;
  severity: SetupReviewRuleSeverity;
  config: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
};

export type Rulebook = {
  id: string;
  user_id?: string;
  name: string;
  description: string | null;
  min_planned_rr: number | null;
  max_risk_amount: number | null;
  max_account_risk_pct: number | null;
  is_default: boolean;
  active: boolean;
  rules: RulebookRule[];
  created_at?: string;
  updated_at?: string;
};

export type CreateRulebookRequest = {
  name: string;
  description?: string | null;
  min_planned_rr?: number | null;
  max_risk_amount?: number | null;
  max_account_risk_pct?: number | null;
  is_default?: boolean;
  rules?: Omit<RulebookRule, "id">[];
};

export type WorkflowState = {
  id?: string;
  user_id?: string;
  symbol: string;
  setup_id?: string | null;
  watchlist_id?: string | null;
  source?: string;
  lifecycle: WorkflowLifecycle;
  setup_type?: string | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  position_size?: number | null;
  timeframe?: string;
  thesis?: string | null;
  invalidation_rule?: string | null;
  confidence?: number | null;
  setup_quality?: number | null;
  notes?: string | null;
  tags?: string[];
  scanner_context?: ScannerIdeaContext | null;
  pinned?: boolean;
  review_later?: boolean;
  ignored?: boolean;
  broker_order_id?: string | null;
  journal_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ScannerIdeaContext = {
  source: "scanner";
  preset_id?: string | null;
  preset_name?: string | null;
  match_reasons?: string[];
  confidence_reasons?: string[];
  data_warnings?: string[];
  setup_score?: number | null;
  setup_grade?: string | null;
  confidence_label?: string | null;
  rs_score?: number | null;
  price_perf_6m_pct?: number | null;
  week_52_high_pct?: number | null;
  volume_ratio?: number | null;
  rsi_14?: number | null;
  captured_price?: number | null;
  captured_change_pct?: number | null;
  captured_volume_ratio?: number | null;
  scan_trade_date?: string | null;
  data_source?: string | null;
  data_mode?: string | null;
  data_as_of?: string | null;
  scan_run_id?: string | null;
  candidate_id?: string | null;
  captured_at?: string;
  chart_snapshot?: {
    chart_url: string;
    symbol: string;
    timeframe?: string | null;
    entry_price?: number | null;
    captured_at?: string | null;
  } | null;
};

export type WorkflowStatePatch = Partial<Omit<WorkflowState, "id" | "user_id" | "created_at" | "updated_at">> & {
  symbol: string;
};

export type LiveQuote = {
  symbol: string;
  market?: string;
  currency?: string;
  close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  prev_close: number | null;
  pct_change: number | null;
  week_52_high?: number | null;
  week_52_low?: number | null;
  source: string;
  as_of?: string;
};

export type LiveMarketStatus = {
  provider: string;
  api_key_configured: boolean;
  access_token_configured: boolean;
  access_token_valid: boolean;
  token_refresh: "daily_manual" | string;
  stream_connected: boolean;
  stream_connecting: boolean;
  subscriber_count: number;
  subscribed_symbols: string[];
  last_error: string | null;
};

export type LiveSectorIndex = {
  symbol: string;
  label: string;
  close: number | null;
  pct_change: number | null;
  prev_close: number | null;
  source: string;
  error?: string;
};

export type CandleBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_20?: number | null;
  ema_50?: number | null;
  ema_200?: number | null;
};

export type CandlesResponse = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  timeframe: string;
  mode?: DataMode;
  source?: string;
  source_metadata?: SourceMetadata;
  coverage?: ChartCoverage;
  candles: CandleBar[];
  latest: {
    close: number;
    pct_change: number | null;
    volume: number;
    volume_ratio: number | null;
    rsi_14: number | null;
    ema_20: number | null;
    ema_50: number | null;
    ema_200: number | null;
    atr_14: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    open: number;
    high: number;
    low: number;
    prev_close: number | null;
  } | null;
};

export type IndicatorsResponse = {
  symbol: string;
  indicators: Record<string, unknown[]>;
};

export type SymbolSearchResult = {
  symbol: string;
  company_name: string;
  sector: string | null;
  series: string;
};

export type Drawing = {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  tool_type: string;
  points: unknown[];
  style: Record<string, unknown>;
  created_at: string;
};

export type ChartLayout = {
  id?: string;
  symbol: string;
  timeframe: string;
  indicators: string[];
  drawing_tools: unknown[];
};

export type ChartWorkspaceIndicator = {
  type: "ema" | "sma" | "vwap" | "rsi" | "macd" | "volume" | "bollinger";
  params?: Record<string, unknown>;
};

export type ChartWorkspaceDrawing =
  | { id: string; kind: "trendline"; p1: { time: string; price: number }; p2: { time: string; price: number }; color: string; width: number }
  | { id: string; kind: "hline"; price: number; color: string; width: number; label?: string }
  | { id: string; tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe?: string; created_at?: string };

export type ChartWorkspace = {
  symbol: string;
  timeframe: string;
  indicators: ChartWorkspaceIndicator[];
  drawings: ChartWorkspaceDrawing[];
};

export type MarketMover = {
  symbol: string;
  company_name: string;
  close: number;
  pct_change: number;
  volume_ratio: number | null;
};

export type MarketMovers = {
  trade_date: string | null;
  gainers: MarketMover[];
  losers: MarketMover[];
  volume_surge: MarketMover[];
};

export type SectorBreadthItem = {
  sector: string;
  total: number;
  advances: number;
  declines: number;
  unchanged: number;
  ad_ratio: number | null;
  above_ema200_pct: number | null;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  symbol: string;
  setup_id?: string | null;
  company_name: string | null;
  trade_type: "long" | "short";
  setup_type: string | null;
  entry_date: string;
  entry_price: number;
  quantity: number;
  exit_date: string | null;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  holding_days: number | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  mistakes: string | null;
  lessons: string | null;
  status: "open" | "closed" | "cancelled";
  source_page?: "chart" | "watchlist" | "scanner" | "manual" | "broker-import" | null;
  source_context?: string | null;
  scanner_context?: ScannerIdeaContext | null;
  thesis?: string | null;
  invalidation_rule?: string | null;
  review?: TradeReview | null;
  created_at: string;
  updated_at: string;
};

export type TradeReview = {
  id: string;
  user_id: string;
  journal_entry_id: string;
  setup_id: string | null;
  status: "draft" | "completed";
  plan_adherence: "followed" | "partial" | "not_followed" | "unknown";
  mistakes: string | null;
  lesson: string | null;
  follow_up: string | null;
  source: "manual" | "generated" | "journal_sync";
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TradeReviewRequest = {
  plan_adherence?: TradeReview["plan_adherence"];
  mistakes?: string | null;
  lesson?: string | null;
  follow_up?: string | null;
  source?: "manual" | "generated";
};

export type JournalStats = {
  total_trades: number;
  open_trades: number;
  total_pnl: number;
  win_rate: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  avg_holding_days: number;
};

export type JournalAnalyticsAdherence = "followed" | "partial" | "not_followed" | "unknown";

export type JournalAnalyticsAdherenceRow = {
  adherence: JournalAnalyticsAdherence;
  trades: number;
  wins: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
};

export type JournalAnalyticsReviewSummary = {
  minimum_sample_size: number;
  reviewed_trades: number;
  unreviewed_closed_trades: number;
  linked_trades: number;
  unplanned_trades: number;
  sample_size_sufficient: boolean;
  review_data_status?: "available" | "unavailable";
  plan_adherence: JournalAnalyticsAdherenceRow[];
};

export type JournalAnalyticsCohortRow = {
  cohort: string;
  trades: number;
  wins: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  avg_r_multiple: number | null;
  reviewed_trades: number;
};

export type JournalAnalyticsCohortBreakdown = {
  scanner: JournalAnalyticsCohortRow[];
  sector: JournalAnalyticsCohortRow[];
  holding_period: JournalAnalyticsCohortRow[];
};

export type JournalAnalyticsRMultipleSummary = {
  trades: number;
  available_trades: number;
  missing_risk_plan: number;
  positive_trades: number;
  negative_trades: number;
  win_rate: number | null;
  total_r: number | null;
  expectancy_r: number | null;
  avg_winner_r: number | null;
  avg_loser_r: number | null;
};

export type JournalAnalyticsPeriod = {
  from_date: string | null;
  to_date: string | null;
  trade_count: number;
};

export type JournalAnalyticsSectorContext = {
  status: "available" | "unavailable" | string;
  source: string;
  note: string;
};

export type JournalAnalyticsRange = {
  fromDate: string;
  toDate: string;
};

export type CreateJournalEntry = {
  symbol: string;
  setup_id?: string | null;
  trade_type: "long" | "short";
  entry_date: string;
  entry_price: number;
  quantity: number;
  setup_type?: string;
  stop_loss?: number;
  target_price?: number;
  entry_reason?: string;
  source_page?: "chart" | "watchlist" | "scanner" | "manual";
  source_context?: string | null;
  scanner_context?: ScannerIdeaContext | null;
  thesis?: string | null;
  invalidation_rule?: string | null;
};

export type UpdateJournalEntry = {
  setup_id?: string | null;
  exit_date?: string;
  exit_price?: number;
  exit_reason?: string;
  mistakes?: string;
  lessons?: string;
  stop_loss?: number | null;
  target_price?: number | null;
  setup_type?: string;
  entry_reason?: string;
  source_page?: "chart" | "watchlist" | "scanner" | "manual" | null;
  source_context?: string | null;
  scanner_context?: ScannerIdeaContext | null;
  thesis?: string | null;
  invalidation_rule?: string | null;
  status?: string;
};

export type JournalAnalytics = {
  equity_curve: { date: string; cumulative_pnl: number }[];
  setup_breakdown: {
    setup: string;
    trades: number;
    wins: number;
    win_rate: number;
    total_pnl: number;
    avg_pnl: number;
    avg_holding_days?: number | null;
    avg_risk_reward?: number | null;
  }[];
  monthly_pnl: { month: string; pnl: number }[];
  drawdown_curve: { date: string; drawdown: number; drawdown_pct: number }[];
  max_drawdown: number | null;
  longest_dd_days: number;
  recovery_factor: number | null;
  profit_factor: number | null;
  review_summary?: JournalAnalyticsReviewSummary;
  analysis_period?: JournalAnalyticsPeriod;
  r_multiple_summary?: JournalAnalyticsRMultipleSummary;
  cohort_breakdown?: JournalAnalyticsCohortBreakdown;
  sector_context?: JournalAnalyticsSectorContext;
  mae_mfe?: {
    status: "available" | "unavailable" | string;
    basis: string;
    trades_with_path: number;
    trades_without_path: number;
    avg_mae_pct: number | null;
    avg_mfe_pct: number | null;
    avg_mae_r: number | null;
    avg_mfe_r: number | null;
    trades: {
      journal_entry_id: string | null;
      symbol: string;
      mae_pct: number;
      mfe_pct: number;
      mae_r: number | null;
      mfe_r: number | null;
      bars_count: number;
    }[];
    reason: string;
  };
};

export type Fundamentals = {
  symbol: string;
  market?: string;
  currency?: string;
  data_status?: "available" | "stale" | "unavailable" | string;
  message?: string;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  dividend_yield: number | null;
  trailing_eps: number | null;
  forward_eps: number | null;
  earnings_growth: number | null;
  revenue_growth: number | null;
  return_on_equity: number | null;
  debt_to_equity: number | null;
  market_cap: number | null;
  market_cap_str: string | null;
  shares_outstanding?: number | null;
};

export type PlanStatus = {
  plan: string;
  expires_at: string | null;
  active: boolean;
};

export type PaymentConfig = {
  gateway: "razorpay";
  configured: boolean;
  mode: "live" | "test" | "disabled";
  key_prefix: string;
  access_code_available?: boolean;
};

export type PlanPrice = {
  plan: "pro" | "elite";
  currency: "INR" | "USD";
  amount: number;          // smallest unit (paise/cents)
  amount_display: number;  // whole currency
  label: string;
  days: number;
};

export type ScanAlert = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort_by: string;
  sort_order: string;
  is_active: boolean;
  last_run_at: string | null;
  last_match_count: number | null;
  last_run_status?: "waiting" | "success" | "skipped" | "failed";
  last_error?: string | null;
  created_at: string;
};

export type ScanAlertMatch = {
  id: string;
  alert_id: string;
  run_date: string;
  symbols: Array<{
    symbol: string;
    close: number;
    pct_change: number | null;
    volume_ratio: number | null;
    rsi_14: number | null;
  }>;
  match_count: number;
  run_status?: "success" | "skipped" | "failed";
  error_message?: string | null;
  scan_alerts?: { name: string };
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: string;
  plan_expires_at: string | null;
  onboarding_completed: boolean;
  onboarding_dismissed?: boolean;
  first_scan_at?: string | null;
  telegram_chat_id: string | null;
  broker_type: string | null;
  broker_connected_at: string | null;
  billing_region?: string;         // "IN" | "NRI" | "US" | "INTL"
  billing_currency?: string;       // "INR" | "USD"
  created_at: string;
};



export type SectorTaxonomyMetadata = {
  source: string;
  taxonomy_status?: "unverified" | "audited" | string;
  taxonomy_status_reason?: string;
  contract_as_of: string;
  active_count: number;
  active_count_scope: string;
  classified_count: number;
  unmapped_count: number;
  unmapped_symbols: string[];
  unmapped_symbols_truncated: boolean;
  sector_count: number;
  sector_counts: {
    sector: string;
    active_count: number;
    aliases: string[];
    related_sectoral_indices?: string[];
    hidden_by_filter: boolean;
  }[];
  alias_policy?: {
    source: string;
    description: string;
  };
  audit_scope?: {
    sector_labels?: { source: string; status: string; description: string };
    sectoral_index_reference?: { source: string; status: string; description: string };
    industry_taxonomy?: { source: string; status: string; description: string };
  };
  reference_coverage?: {
    matched_sector_count: number;
    unmatched_sector_count: number;
    unmatched_sectors: string[];
    description: string;
  };
  display_filter: {
    minimum_active_symbols: number;
    hidden_sector_count: number;
    description: string;
  };
  reference?: {
    name: string;
    url: string;
    as_of: string;
    relationship?: string;
  };
  universe_taxonomy?: {
    name: string;
    source: string;
    relationship: string;
  };
  sectoral_indices?: {
    symbol: string;
    label: string;
    aliases: string[];
  }[];
};

export type SectorListResponse = {
  sectors: string[];
  metadata?: SectorTaxonomyMetadata;
};
export type ZerodhaReadOnlySmoke = {
  broker: "zerodha" | "upstox";
  connected_read_only: boolean;
  token_expired: boolean;
  checks: Record<string, { ok: boolean; count?: number; error?: string; note?: string; user_id_present?: boolean }>;
};

export type BrokerImportResult = {
  imported: number;
  skipped: number;
  unmatched_fills: number;
  unmatched_symbols: string[];
  reconciliation_status: "complete" | "needs_review";
  total_filled_orders: number;
  message: string;
  last_synced_at?: string | null;
};

export type PlaceOrderRequest = {
  symbol:       string;
  setup_id?:    string | null;
  side:         "buy" | "sell";
  quantity:     number;
  price:        number;
  order_type?:  "market" | "limit";
  stop_loss?:   number;
  target_price?: number;
  setup_type?:  string;
  notes?:       string;
  thesis?:      string;
  invalidation_rule?: string;
  scanner_context?: ScannerIdeaContext | null;
  source_page?: "chart" | "watchlist" | "scanner" | "manual";
  source_context?: string;
  chart_snapshot?: ScannerIdeaContext["chart_snapshot"];
  live_confirmed?: boolean;
  idempotency_key?: string;
};

export type OrderResult = {
  status:           string;
  message:          string;
  journal_id:       string | null;
  setup_id?:        string | null;
  symbol:           string;
  side:             string;
  quantity:         number;
  price:            number;
  broker:           string;          // "simulated" | "zerodha" | "upstox"
  broker_order_id:  string | null;
  execution_mode?:  string;
  execution_status?: string;
  filled_quantity?: number;
  average_fill_price?: number | null;
  requires_reconciliation?: boolean;
  rejection_reason?: string | null;
  journal_status?:  string;
  risk_reward?:     number | null;
  next_actions?:    string[];
};

export type BrokerOrderReconciliation = {
  status: string;
  broker: "zerodha" | "upstox";
  broker_order_id: string;
  execution_status: "PENDING" | "OPEN" | "PARTIAL" | "COMPLETE" | "CANCELLED" | "REJECTED";
  symbol: string;
  quantity: number;
  filled_quantity: number;
  average_fill_price: number | null;
  requires_reconciliation: boolean;
  rejection_reason: string | null;
  journal_id: string | null;
  setup_id?: string | null;
  journal_status: string | null;
  message: string;
};

export type BrokerOrderActivityItem = {
  id: string;
  broker: "simulated" | "zerodha" | "upstox";
  broker_order_id: string | null;
  journal_id: string | null;
  setup_id?: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  order_type: string;
  requested_price: number | null;
  execution_status: string;
  filled_quantity: number;
  average_fill_price: number | null;
  requires_reconciliation: boolean;
  rejection_reason: string | null;
  placed_at: string | null;
  reconciled_at: string | null;
  journal_state: "recorded" | "not_created";
};

export type BrokerOrderActivityResponse = {
  orders: BrokerOrderActivityItem[];
  count: number;
};

export type BrokerAuditEvent = {
  id: string;
  event_type: string;
  outcome: string;
  actor_type: string;
  broker: string | null;
  broker_order_id: string | null;
  idempotency_key: string | null;
  setup_id: string | null;
  journal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
};

export type BrokerAuditEventResponse = {
  events: BrokerAuditEvent[];
  count: number;
};

export type DataHealth = {
  status: "healthy" | "degraded" | "stale" | "unknown";
  latest_trade_date: string | null;
  last_successful_eod_date?: string | null;
  hours_since_refresh: number | null;
  symbols_on_latest_date: number | null;
  universe_active: number | null;
  coverage_pct?: number | null;
  mode?: DataMode;
  message?: string;
  indicators_missing: {
    rsi_14: number | null;
    ema_200: number | null;
  };
  indicator_coverage?: {
    symbols_on_latest_date: number | null;
    rsi_14_missing: number;
    ema_200_missing: number;
    rsi_14_missing_pct: number | null;
    ema_200_missing_pct: number | null;
    has_gaps: boolean;
  };
  last_run: {
    id: string | null;
    errors: number | null;
  };
  last_bhavcopy?: {
    trade_date: string | null;
    status: string | null;
    rows_ingested: number | null;
    source_url?: string | null;
    error_message?: string | null;
    warning_message?: string | null;
    quality?: {
      status: string | null;
      source_rows: number | null;
      accepted_rows: number | null;
      filtered_series_rows: number | null;
      missing_required_rows: number | null;
      invalid_ohlcv_rows: number | null;
      duplicate_rows: number | null;
      reasons?: string[];
    };
  };
  provider?: SourceMetadata;
  fallback_active?: boolean;
  next_refresh_hint?: string;
  live_market?: LiveMarketStatus | null;
};

export type DataRun = {
  run_id: string;
  started_at: string | null;
  duration_s: number | null;
  event_count: number | null;
  error_count: number | null;
};

export type AiPatterns = {
  ready: boolean;
  total_trades?: number;
  min_trades_required?: number;
  trades_available?: number;
  avg_hold_winners?: number | null;
  avg_hold_losers?: number | null;
  coaching_cards?: { label: string; value: string; detail: string; tone: "gain" | "loss" | "warn" | "accent" | "neutral" }[];
  day_of_week?: { day: string; trades: number; wins: number; win_rate: number; total_pnl: number }[];
  by_direction?: { direction: string; trades: number; wins: number; win_rate: number; total_pnl: number }[];
  by_holding_period?: { bucket: string; trades: number; wins: number; win_rate: number }[];
  setup_breakdown?: {
    setup: string;
    trades: number;
    win_rate: number;
    total_pnl: number;
    avg_holding_days?: number | null;
    avg_risk_reward?: number | null;
  }[];
};

export type PriceAlert = {
  id: string;
  symbol: string;
  condition: "above" | "below";
  target_price: number;
  note: string | null;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
};

export type PortfolioPosition = {
  id: string;
  symbol: string;
  company_name: string | null;
  trade_type: "long" | "short";
  entry_date: string;
  entry_price: number;
  quantity: number;
  stop_loss: number | null;
  target_price: number | null;
  setup_type: string | null;
  current_price: number;
  day_change_pct: number | null;
  unrealised_pnl: number;
  unrealised_pnl_pct: number;
  invested: number;
  sector: string | null;
};

export type PortfolioResponse = {
  positions: PortfolioPosition[];
  summary: {
    total_invested: number;
    total_current: number;
    total_pnl: number;
    total_pnl_pct: number;
    open_count: number;
  };
  sectors: { sector: string; pnl: number }[];
};

export type BacktestResult = {
  date: string;
  match_count: number;
  top_symbols: string[];
};

export type BacktestResponse = {
  days_analysed: number;
  avg_matches: number;
  max_matches: number;
  min_matches: number;
  results: BacktestResult[];
};

export type SharedScreen = {
  id: string;
  user_id: string;
  screen_id: string;
  title: string;
  description: string | null;
  tags: string[];
  upvotes: number;
  is_featured: boolean;
  created_at: string;
};

export interface MarketOverview {
  trade_date: string | null;
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  advance_decline_ratio: number;
  new_52w_highs: number;
  new_52w_lows: number;
  above_ema20_pct: number;
  above_ema50_pct: number;
  above_ema200_pct: number;
  ema_breadth_by_period?: Partial<Record<"day" | "week" | "month" | "year", { ema20: number; ema50: number; ema200: number } | null>>;
  ema_breadth_daily_history?: { trade_date: string; ema20: number; ema50: number; ema200: number }[];
  ema_breadth_lookback?: Partial<Record<"day" | "week" | "month" | "year", { trade_date: string; ema20: number; ema50: number; ema200: number }[]>>;
  highs_lows_by_period?: Partial<Record<"daily" | "weekly", { highs: number; lows: number }>>;
  market_phase: string;
  market_phase_desc: string;
  indices?: { symbol: string; label: string; close: number | null; pct_change: number | null; prev_close: number | null; source: string; error?: string }[];
  top_sectors?: { sector: string; total: number; advances: number; declines: number; avg_pct_change: number; breadth_pct: number; advance_breadth_pct?: number | null; above_ema20_pct?: number | null; basis?: string }[];
  market_data_source?: string;
  is_live?: boolean;
  sector_breadth_basis?: "latest_complete_session" | string;
  sector_breadth_source?: string;
  sector_breadth: { sector: string; total: number; advances: number; declines: number; avg_pct_change: number; breadth_pct: number; advance_breadth_pct?: number | null; above_ema20_pct?: number | null; basis?: string }[];
  top_gainers: { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  top_losers:  { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  most_active: { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  as_of?: string | null;
  generated_at?: string | null;
  cache_status?: "hit" | "miss" | string;
  source_metadata?: SourceMetadata;
  provider?: SourceMetadata;
}

export type MarketSnapshot = {
  overview: MarketOverview;
  health: DataHealth | null;
  asOf: string | null;
  mode: DataMode;
  source: string;
  generatedAt: string;
  cacheStatus: string;
};

export type WaitlistLead = {
  id: string;
  email: string;
  source: string;
  invite_code: string | null;
  status: string;
  created_at: string;
};

export type FeedbackReport = {
  id: string;
  user_id: string | null;
  category: "general" | "bug" | "data_issue" | "feature_request";
  page: string | null;
  symbol: string | null;
  severity: "low" | "normal" | "high";
  message: string;
  context: Record<string, unknown>;
  status: "new" | "triaged" | "resolved" | "closed";
  created_at: string;
};

export interface ScanPreset {
  id: string;
  name: string;
  description: string;
  color: string;
  filters: Record<string, unknown>;
}

export type BrokerProfile = {
  broker_id: string;
  user_id: string;
  display_name: string;
  email: string;
};

export type BrokerHolding = {
  symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  current_value: number;
  pnl: number;
};

export type BrokerPosition = {
  symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  pnl: number;
  day_pnl: number;
};

export type BrokerOrderStatus = "PENDING" | "OPEN" | "PARTIAL" | "COMPLETE" | "CANCELLED" | "REJECTED";

export type BrokerOrderSnapshot = {
  broker_order_id: string;
  symbol: string;
  exchange: "NSE" | "BSE";
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "SL" | "SL_MARKET";
  product: "CNC" | "MIS" | "NRML";
  status: BrokerOrderStatus;
  quantity: number;
  filled_quantity: number;
  average_price: number;
  limit_price: number | null;
  trigger_price: number | null;
  placed_at: string;
  updated_at: string;
  rejection_reason: string | null;
};

export type BrokerOrderbookResponse = {
  broker: "zerodha" | "upstox";
  orders: BrokerOrderSnapshot[];
  count: number;
  fetched_at: string;
};
