import { API_BASE_URL } from './api-base'
import {
  mockCandles,
  mockIndicators,
  mockJournalAnalytics,
  mockJournalEntries,
  mockJournalStats,
  mockLiveQuote,
  mockMarketMovers,
  mockMarketOverview,
  mockMarketSummary,
  mockPortfolio,
  mockPriceAlerts,
  mockQuote,
  mockRunScan,
  mockScanAlertMatches,
  mockScanAlerts,
  mockSearchSymbols,
  mockSectorBreadth,
  mockWatchlists,
} from './mock-data'
import {
  authHeaders,
  cachedClientRequest,
  invalidateClientCache,
  responseErrorMessage,
  shouldUseMockFallback,
  unavailablePayloadMessage,
  withTimeout,
} from './api/client'
import type {
  AiPatterns,
  BacktestResponse,
  BrokerHolding,
  BrokerOrderActivityResponse,
  BrokerOrderReconciliation,
  BrokerProfile,
  CandlesResponse,
  ChartLayout,
  ChartWorkspace,
  CreateSetupRequest,
  CreateJournalEntry,
  DataHealth,
  DataRun,
  Drawing,
  FeedbackReport,
  Fundamentals,
  IndicatorsResponse,
  JournalAnalytics,
  JournalEntry,
  JournalStats,
  LiveMarketStatus,
  LiveQuote,
  LiveSectorIndex,
  Market,
  MarketMovers,
  MarketOverview,
  MarketSnapshot,
  MarketSummary,
  OrderResult,
  PaymentConfig,
  PlaceOrderRequest,
  PlanPrice,
  PlanStatus,
  PortfolioResponse,
  PriceAlert,
  SavedScreen,
  ScanAlert,
  ScanAlertMatch,
  ScanFilters,
  ScanPreset,
  ScannerIdeaContext,
  ScanResponse,
  ScanResult,
  SectorBreadthItem,
  SectorListResponse,
  SectorTaxonomyMetadata,
  Setup,
  SetupReview,
  SetupReviewRequest,
  SetupStatus,
  CreateRulebookRequest,
  Rulebook,
  UpdateSetupRequest,
  SharedScreen,
  SymbolSearchResult,
  UpdateJournalEntry,
  UserProfile,
  WaitlistLead,
  Watchlist,
  WatchlistItem,
  WatchlistItemMetadataUpdate,
  WorkflowLifecycle,
  WorkflowState,
  WorkflowStatePatch,
  ZerodhaReadOnlySmoke,
} from './api/types'
import { defaultSetupReviewRules, evaluateSetupReview } from "./setup-review";

export * from './api/types'
export {
  authHeaders,
  cachedClientRequest,
  clearAuthHeaderCache,
  invalidateClientCache,
  isMockMode,
  liveQuotePollingEnabled,
  responseErrorMessage,
  routeBackedE2eMocksEnabled,
  shouldUseMockFallback,
  unavailablePayloadMessage,
  withTimeout,
} from './api/client'

export const API = API_BASE_URL;

// Public endpoints don't need auth — just JSON content-type
const publicHeaders: HeadersInit = { "Content-Type": "application/json" };

export async function getMarkets(): Promise<Market[]> {
  const res = await fetch(`${API}/api/v1/market/markets`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.markets ?? [];
}








const mockWatchlistsKey = "alphavyuh-mock-watchlists-v1";

function readMockWatchlists(): Watchlist[] {
  const defaults = mockWatchlists();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(mockWatchlistsKey);
    return raw ? JSON.parse(raw) : defaults;
  } catch {
    return defaults;
  }
}

function writeMockWatchlists(watchlists: Watchlist[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockWatchlistsKey, JSON.stringify(watchlists));
}

function mockWatchlistItem(symbol: string, sortOrder: number): WatchlistItem {
  const quote = mockQuote(symbol);
  return quote
    ? {
        symbol: quote.symbol,
        sort_order: sortOrder,
        added_at: new Date().toISOString(),
        company_name: quote.company_name,
        sector: quote.sector,
        close: quote.close,
        pct_change: quote.pct_change,
        volume_ratio: quote.volume_ratio,
        rsi_14: quote.rsi_14,
        pinned: false,
        tags: [],
        note: "",
      }
    : {
        symbol: symbol.toUpperCase(),
        sort_order: sortOrder,
        added_at: new Date().toISOString(),
        pinned: false,
        tags: [],
        note: "",
      };
}

function stableCacheKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCacheKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableCacheKey(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export async function runScan(
  filters: ScanFilters,
  sort_by = "volume_ratio",
  sort_order = "desc",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _limit?: number   // limit is enforced server-side by plan
): Promise<ScanResponse> {
  if (shouldUseMockFallback()) return mockRunScan();
  const requestBody = { filters, sort_by, sort_order };
  return cachedClientRequest(`scanner:run:${stableCacheKey(requestBody)}`, 5_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/scanner/run`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Session expired — please refresh the page");
      if (res.status === 503 || res.status === 502) throw new Error("Server is temporarily unavailable — try again in a moment");
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Scan failed (${res.status})`);
    }
    return res.json();
  });
}

export async function getScreens(): Promise<SavedScreen[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/screens`, { headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Saved scanner screens are temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Saved scanner screens are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data?.screens)) {
    throw new Error("Saved scanner screens are temporarily unavailable.");
  }
  return data.screens;
}

export async function saveScreen(name: string, filters: Record<string, unknown>): Promise<SavedScreen> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/screens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, filters }),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Saved scanner screen could not be saved."));
  }
  return res.json();
}

export async function deleteScreen(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/screens/${id}`, { method: "DELETE", headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Saved scanner screen could not be deleted."));
  }
}

export async function getWatchlists(options?: { lite?: boolean; force?: boolean }): Promise<Watchlist[]> {
  const cacheKey = options?.lite ? "watchlists:lite" : "watchlists";
  if (options?.force) {
    invalidateClientCache([cacheKey]);
  }
  if (shouldUseMockFallback()) return readMockWatchlists();
  return cachedClientRequest(cacheKey, options?.lite ? 10_000 : 30_000, async () => {
    try {
      const headers = await authHeaders();
      const qs = options?.lite ? "?lite=true" : "";
      const res = await fetch(`${API}/api/v1/watchlists${qs}`, { headers });
      if (!res.ok) {
        if (shouldUseMockFallback()) return readMockWatchlists();
        throw new Error(await responseErrorMessage(res, `Watchlist data is temporarily unavailable (${res.status}).`));
      }
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Watchlist data is temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      return data.watchlists ?? [];
    } catch (error) {
      if (shouldUseMockFallback()) return readMockWatchlists();
      throw error instanceof Error ? error : new Error("Watchlist data is temporarily unavailable.");
    }
  });
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  if (shouldUseMockFallback()) {
    const lists = readMockWatchlists();
    const created: Watchlist = {
      id: `mock-${Date.now()}`,
      name,
      sort_order: lists.length,
      created_at: new Date().toISOString(),
      items: [],
    };
    writeMockWatchlists([...lists, created]);
    invalidateClientCache(["watchlists"]);
    return created;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const created = await res.json();
  invalidateClientCache(["watchlists"]);
  return created;
}

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  if (shouldUseMockFallback()) {
    writeMockWatchlists(readMockWatchlists().filter((watchlist) => watchlist.id !== watchlistId));
    invalidateClientCache(["watchlists"]);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}`, { method: "DELETE", headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Watchlist delete is temporarily unavailable."));
  }
  invalidateClientCache(["watchlists"]);
}

export async function addToWatchlist(watchlistId: string, symbol: string): Promise<void> {
  if (shouldUseMockFallback()) {
    const normalized = symbol.toUpperCase();
    const lists = readMockWatchlists();
    const next = lists.map((watchlist) => {
      if (watchlist.id !== watchlistId) return watchlist;
      if (watchlist.items.some((item) => item.symbol === normalized)) throw new Error("Already in watchlist");
      return {
        ...watchlist,
        items: [...watchlist.items, mockWatchlistItem(normalized, watchlist.items.length)],
      };
    });
    writeMockWatchlists(next);
    invalidateClientCache(["watchlists"]);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ symbol }),
  });
  if (res.status === 409) throw new Error("Already in watchlist");
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Watchlist add is temporarily unavailable."));
  }
  invalidateClientCache(["watchlists"]);
}

export async function removeFromWatchlist(watchlistId: string, symbol: string): Promise<void> {
  if (shouldUseMockFallback()) {
    const normalized = symbol.toUpperCase();
    writeMockWatchlists(readMockWatchlists().map((watchlist) => (
      watchlist.id !== watchlistId
        ? watchlist
        : { ...watchlist, items: watchlist.items.filter((item) => item.symbol !== normalized) }
    )));
    invalidateClientCache(["watchlists"]);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/${symbol}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Watchlist item removal is temporarily unavailable."));
  }
  invalidateClientCache(["watchlists"]);
}

export async function reorderWatchlist(
  watchlistId: string,
  items: { symbol: string; sort_order: number }[]
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/reorder`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Watchlist reorder is temporarily unavailable."));
  }
  invalidateClientCache(["watchlists"]);
}

const workflowLocalKey = "alphavyuh-workflow-state-v1";
const setupLocalKey = "alphavyuh-setups-v1";
const setupReviewLocalKey = "alphavyuh-setup-reviews-v1";
const rulebookLocalKey = "alphavyuh-rulebooks-v1";

function readLocalSetups(): Setup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(setupLocalKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as Setup[] : [];
  } catch {
    return [];
  }
}

function writeLocalSetups(setups: Setup[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(setupLocalKey, JSON.stringify(setups));
}

function readLocalSetupReviews(): Record<string, SetupReview> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(setupReviewLocalKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isRecord(parsed)) return {};
    const reviews: Record<string, SetupReview> = {};
    for (const [key, value] of Object.entries(parsed)) {
      try {
        reviews[key] = parseSetupReviewResponse(value);
      } catch {
        // Ignore stale or malformed local review records.
      }
    }
    return reviews;
  } catch {
    return {};
  }
}

function writeLocalSetupReview(review: SetupReview) {
  if (typeof window === "undefined") return;
  const reviews = readLocalSetupReviews();
  reviews[review.setup_id] = review;
  window.localStorage.setItem(setupReviewLocalKey, JSON.stringify(reviews));
}

function defaultLocalRulebook(): Rulebook {
  return {
    id: "local-starter-rulebook",
    name: "Starter discipline",
    description: "Defined stop, written plan, minimum 1:2 R:R, and controlled risk.",
    min_planned_rr: 2,
    max_risk_amount: null,
    max_account_risk_pct: null,
    is_default: true,
    active: true,
    rules: defaultSetupReviewRules().map((rule) => ({
      code: rule.code,
      label: rule.label,
      severity: rule.severity,
      config: rule.config ?? {},
      enabled: rule.enabled !== false,
      sort_order: rule.sort_order ?? 0,
    })),
  };
}

function readLocalRulebooks(): Rulebook[] {
  if (typeof window === "undefined") return [defaultLocalRulebook()];
  try {
    const raw = window.localStorage.getItem(rulebookLocalKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [defaultLocalRulebook()];
    const rulebooks = parsed.filter((value): value is Rulebook => {
      try {
        parseRulebookResponse(value);
        return true;
      } catch {
        return false;
      }
    });
    return rulebooks.length > 0 ? rulebooks : [defaultLocalRulebook()];
  } catch {
    return [defaultLocalRulebook()];
  }
}

function writeLocalRulebooks(rulebooks: Rulebook[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(rulebookLocalKey, JSON.stringify(rulebooks));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSetupReviewRule(value: unknown): value is SetupReview["results"][number] {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    (value.severity === "block" || value.severity === "warn" || value.severity === "check" || value.severity === "info") &&
    (value.status === "pass" || value.status === "fail" || value.status === "not_evaluated") &&
    typeof value.message === "string";
}

function isRulebookRule(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    (value.severity === "block" || value.severity === "warn" || value.severity === "check" || value.severity === "info") &&
    isRecord(value.config) &&
    typeof value.enabled === "boolean" &&
    typeof value.sort_order === "number";
}

function parseRulebookResponse(value: unknown): Rulebook {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.rules)) {
    throw new Error("Rulebook returned an invalid response.");
  }
  const rules = value.rules.filter(isRulebookRule);
  if (rules.length !== value.rules.length) throw new Error("Rulebook returned invalid rules.");
  return {
    id: value.id,
    user_id: typeof value.user_id === "string" ? value.user_id : undefined,
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    min_planned_rr: typeof value.min_planned_rr === "number" ? value.min_planned_rr : null,
    max_risk_amount: typeof value.max_risk_amount === "number" ? value.max_risk_amount : null,
    max_account_risk_pct: typeof value.max_account_risk_pct === "number" ? value.max_account_risk_pct : null,
    is_default: value.is_default === true,
    active: value.active !== false,
    rules: rules.map((rule) => ({
      id: typeof rule.id === "string" ? rule.id : undefined,
      code: rule.code as string,
      label: rule.label as string,
      severity: rule.severity as Rulebook["rules"][number]["severity"],
      config: rule.config as Record<string, unknown>,
      enabled: rule.enabled as boolean,
      sort_order: rule.sort_order as number,
    })),
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
  };
}

function parseSetupReviewResponse(value: unknown): SetupReview {
  if (!isRecord(value) || typeof value.setup_id !== "string" || typeof value.rulebook_id !== "string" ||
      (value.overall_status !== "passed" && value.overall_status !== "warned" && value.overall_status !== "blocked") ||
      typeof value.can_proceed !== "boolean" || typeof value.summary !== "string" || !Array.isArray(value.results)) {
    throw new Error("Setup review returned an invalid response.");
  }
  const results = value.results.filter(isSetupReviewRule);
  if (results.length !== value.results.length) throw new Error("Setup review returned invalid rule results.");
  return {
    setup_id: value.setup_id,
    rulebook_id: value.rulebook_id,
    overall_status: value.overall_status,
    can_proceed: value.can_proceed,
    summary: value.summary,
    override_reason: typeof value.override_reason === "string" ? value.override_reason : null,
    results,
    input_snapshot: isRecord(value.input_snapshot) ? value.input_snapshot : undefined,
    evaluated_at: typeof value.evaluated_at === "string" ? value.evaluated_at : null,
    id: typeof value.id === "string" ? value.id : null,
  };
}

function localSetupId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mock-setup-${Date.now()}`;
}

function createLocalSetup(request: CreateSetupRequest): Setup {
  const now = new Date().toISOString();
  const entry = request.entry_low != null && request.entry_high != null
    ? (request.entry_low + request.entry_high) / 2
    : request.entry_low ?? request.entry_high ?? null;
  const risk = entry != null && request.stop_price != null
    ? Math.abs(entry - request.stop_price)
    : null;
  const reward = entry != null && request.target_price != null
    ? Math.abs(request.target_price - entry)
    : null;
  return {
    id: localSetupId(),
    user_id: "mock-user",
    symbol: request.symbol.trim().toUpperCase(),
    status: request.status ?? "planned",
    direction: request.direction,
    strategy_tag: request.strategy_tag ?? null,
    entry_low: request.entry_low ?? null,
    entry_high: request.entry_high ?? null,
    stop_price: request.stop_price ?? null,
    target_price: request.target_price ?? null,
    planned_risk_amount: risk != null && request.planned_quantity != null ? Number((risk * request.planned_quantity).toFixed(4)) : null,
    planned_quantity: request.planned_quantity ?? null,
    planned_rr: risk != null && risk > 0 && reward != null ? Number((reward / risk).toFixed(4)) : null,
    thesis: request.thesis ?? null,
    invalidation_reason: request.invalidation_reason ?? null,
    source: request.source ?? "manual",
    source_scanner_candidate_id: request.source_scanner_candidate_id ?? null,
    scanner_context: request.scanner_context ?? null,
    chart_snapshot: request.chart_snapshot ?? null,
    created_at: now,
    updated_at: now,
  };
}

export async function getSetups(options?: { symbol?: string; status?: SetupStatus }): Promise<Setup[]> {
  if (shouldUseMockFallback()) {
    const symbol = options?.symbol?.trim().toUpperCase();
    return readLocalSetups().filter((setup) => (!symbol || setup.symbol === symbol) && (!options?.status || setup.status === options.status));
  }
  const headers = await authHeaders();
  const query = new URLSearchParams();
  if (options?.symbol) query.set("symbol", options.symbol.trim().toUpperCase());
  if (options?.status) query.set("status", options.status);
  const res = await fetch(`${API}/api/v1/setups${query.toString() ? `?${query}` : ""}`, { headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Setups are temporarily unavailable."));
  const data = await res.json();
  return Array.isArray(data?.setups) ? data.setups as Setup[] : [];
}

export async function createSetup(request: CreateSetupRequest): Promise<Setup> {
  if (shouldUseMockFallback()) {
    const created = createLocalSetup(request);
    writeLocalSetups([created, ...readLocalSetups()]);
    invalidateClientCache(["setups"]);
    return created;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/setups`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...request, symbol: request.symbol.trim().toUpperCase() }),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Setup could not be saved."));
  const created = await res.json();
  if (!created || typeof created.id !== "string") throw new Error("Setup save returned an invalid response.");
  invalidateClientCache(["setups"]);
  return created as Setup;
}

export async function updateSetup(setupId: string, request: UpdateSetupRequest): Promise<Setup> {
  if (shouldUseMockFallback()) {
    const setups = readLocalSetups();
    const existing = setups.find((setup) => setup.id === setupId);
    if (!existing) throw new Error("Setup could not be found.");
    const updated = createLocalSetup({
      symbol: existing.symbol,
      direction: request.direction !== undefined ? request.direction : existing.direction,
      status: request.status !== undefined ? request.status : existing.status,
      strategy_tag: request.strategy_tag !== undefined ? request.strategy_tag : existing.strategy_tag,
      entry_low: request.entry_low !== undefined ? request.entry_low : existing.entry_low,
      entry_high: request.entry_high !== undefined ? request.entry_high : existing.entry_high,
      stop_price: request.stop_price !== undefined ? request.stop_price : existing.stop_price,
      target_price: request.target_price !== undefined ? request.target_price : existing.target_price,
      planned_quantity: request.planned_quantity !== undefined ? request.planned_quantity : existing.planned_quantity,
      thesis: request.thesis !== undefined ? request.thesis : existing.thesis,
      invalidation_reason: request.invalidation_reason !== undefined ? request.invalidation_reason : existing.invalidation_reason,
      source: request.source !== undefined ? request.source : existing.source,
      source_scanner_candidate_id: request.source_scanner_candidate_id !== undefined ? request.source_scanner_candidate_id : existing.source_scanner_candidate_id,
      scanner_context: request.scanner_context !== undefined ? request.scanner_context : existing.scanner_context,
      chart_snapshot: request.chart_snapshot !== undefined ? request.chart_snapshot : existing.chart_snapshot,
    });
    const next = { ...updated, id: existing.id, user_id: existing.user_id, created_at: existing.created_at };
    writeLocalSetups(setups.map((setup) => setup.id === setupId ? next : setup));
    invalidateClientCache(["setups"]);
    return next;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/setups/${encodeURIComponent(setupId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Setup could not be updated."));
  const updated = await res.json();
  if (!updated || typeof updated.id !== "string") throw new Error("Setup update returned an invalid response.");
  invalidateClientCache(["setups"]);
  return updated as Setup;
}

export async function getRulebooks(): Promise<Rulebook[]> {
  if (shouldUseMockFallback()) return readLocalRulebooks();
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/rulebooks`, { headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Rulebooks are temporarily unavailable."));
  const data = await res.json();
  if (!isRecord(data) || !Array.isArray(data.rulebooks)) throw new Error("Rulebooks returned an invalid response.");
  return data.rulebooks.map(parseRulebookResponse);
}

export async function createRulebook(request: CreateRulebookRequest): Promise<Rulebook> {
  if (shouldUseMockFallback()) {
    const now = new Date().toISOString();
    const configuredRules = request.rules?.map((rule) => ({ ...rule })) ?? defaultLocalRulebook().rules.map((rule) => (
      rule.code === "minimum_rr"
        ? { ...rule, config: { ...rule.config, min_rr: request.min_planned_rr ?? 2 } }
        : rule
    ));
    if (request.max_risk_amount != null) {
      configuredRules.push({
        code: "max_risk_amount",
        label: "Maximum planned risk amount",
        severity: "warn",
        config: { max_risk_amount: request.max_risk_amount },
        enabled: true,
        sort_order: 70,
      });
    }
    if (request.max_account_risk_pct != null) {
      configuredRules.push({
        code: "max_account_risk_pct",
        label: "Maximum account risk percentage",
        severity: "warn",
        config: { max_account_risk_pct: request.max_account_risk_pct },
        enabled: true,
        sort_order: 80,
      });
    }
    const rulebook: Rulebook = {
      id: localSetupId(),
      name: request.name.trim(),
      description: request.description?.trim() || null,
      min_planned_rr: request.min_planned_rr ?? 2,
      max_risk_amount: request.max_risk_amount ?? null,
      max_account_risk_pct: request.max_account_risk_pct ?? null,
      is_default: request.is_default === true,
      active: true,
      rules: configuredRules,
      created_at: now,
      updated_at: now,
    };
    const existing = readLocalRulebooks();
    const next = rulebook.is_default
      ? existing.map((item) => ({ ...item, is_default: false }))
      : existing;
    writeLocalRulebooks([rulebook, ...next]);
    return rulebook;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/rulebooks`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Rulebook could not be saved."));
  return parseRulebookResponse(await res.json());
}

export async function getSetupReview(setupId: string): Promise<SetupReview | null> {
  if (shouldUseMockFallback()) return readLocalSetupReviews()[setupId] ?? null;
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/setups/${encodeURIComponent(setupId)}/review`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Setup review is temporarily unavailable."));
  return parseSetupReviewResponse(await res.json());
}

export async function reviewSetup(
  setupId: string,
  request: SetupReviewRequest = {},
  localSetup?: Partial<Setup>,
): Promise<SetupReview> {
  if (shouldUseMockFallback()) {
    const setup = readLocalSetups().find((item) => item.id === setupId) ?? localSetup;
    if (!setup) throw new Error("Setup review needs a saved setup.");
    const rulebooks = readLocalRulebooks();
    const rulebook = (request.rulebook_id ? rulebooks.find((item) => item.id === request.rulebook_id) : undefined)
      ?? rulebooks.find((item) => item.is_default && item.active)
      ?? rulebooks[0]
      ?? defaultLocalRulebook();
    const review = evaluateSetupReview(
      { ...setup, id: setupId },
      { ...request, rulebook_id: rulebook.id },
      rulebook.rules.map((rule) => ({
        ...rule,
        status: "not_evaluated" as const,
        message: "",
      })),
    );
    writeLocalSetupReview({ ...review, evaluated_at: new Date().toISOString() });
    const setups = readLocalSetups().map((item) => item.id === setupId
      ? { ...item, review_status: review.overall_status, last_reviewed_at: new Date().toISOString() }
      : item);
    writeLocalSetups(setups);
    return review;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/setups/${encodeURIComponent(setupId)}/review`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, "Setup review could not be recorded."));
  return parseSetupReviewResponse(await res.json());
}

function readLocalWorkflowStates(): Record<string, WorkflowState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(workflowLocalKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalWorkflowStates(states: Record<string, WorkflowState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workflowLocalKey, JSON.stringify(states));
}

function saveLocalWorkflowState(patch: WorkflowStatePatch): WorkflowState {
  const states = readLocalWorkflowStates();
  const symbol = patch.symbol.toUpperCase();
  const previous = states[symbol] ?? { symbol, lifecycle: "idea" as WorkflowLifecycle, timeframe: "D", tags: [] };
  const next: WorkflowState = {
    ...previous,
    ...patch,
    symbol,
    lifecycle: patch.lifecycle ?? previous.lifecycle ?? "idea",
    timeframe: patch.timeframe ?? previous.timeframe ?? "D",
    tags: patch.tags ?? previous.tags ?? [],
    updated_at: new Date().toISOString(),
  };
  states[symbol] = next;
  writeLocalWorkflowStates(states);
  return next;
}

function saveLocalWorkflowStates(patches: WorkflowStatePatch[]): WorkflowState[] {
  return patches.map(saveLocalWorkflowState);
}

export async function updateWatchlistItemMetadata(
  watchlistId: string,
  symbol: string,
  updates: WatchlistItemMetadataUpdate
): Promise<WatchlistItem> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/${symbol}/metadata`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Metadata update failed" }));
    throw new Error(body.detail ?? "Metadata update failed");
  }
  const updated = await res.json();
  invalidateClientCache(["watchlists"]);
  return updated;
}

export async function getWorkflowStates(options?: { symbols?: string[]; watchlistId?: string }): Promise<WorkflowState[]> {
  const useLocalFallback = shouldUseMockFallback();
  const local = useLocalFallback ? readLocalWorkflowStates() : {};
  const localValues = Object.values(local);
  if (useLocalFallback) {
    return options?.symbols?.length
      ? localValues.filter((state) => options.symbols!.includes(state.symbol))
      : localValues;
  }
  const normalizedSymbols = options?.symbols?.map((s) => s.toUpperCase()).sort() ?? [];
  const cacheKey = `workflow:states:${options?.watchlistId ?? "all"}:${normalizedSymbols.join(",")}`;
  return cachedClientRequest(cacheKey, 15_000, async () => {
    try {
      const headers = await authHeaders();
      const qs = new URLSearchParams();
      if (normalizedSymbols.length) qs.set("symbols", normalizedSymbols.join(","));
      if (options?.watchlistId) qs.set("watchlist_id", options.watchlistId);
      const res = await fetch(`${API}/api/v1/workflow/states?${qs}`, { headers });
      if (!res.ok) {
        throw new Error(await responseErrorMessage(res, "Workflow state is temporarily unavailable."));
      }
      const data = await res.json();
      const remote: WorkflowState[] = data.states ?? [];
      if (remote.length) {
        const merged = { ...local };
        for (const state of remote) merged[state.symbol] = state;
        writeLocalWorkflowStates(merged);
      }
      return remote;
    } catch (error) {
      if (useLocalFallback) return localValues;
      throw error;
    }
  });
}

export async function upsertWorkflowState(patch: WorkflowStatePatch): Promise<WorkflowState> {
  if (shouldUseMockFallback()) return saveLocalWorkflowState(patch);

  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/workflow/states/${patch.symbol.toUpperCase()}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...patch, symbol: patch.symbol.toUpperCase() }),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Workflow state could not be saved."));
  }
  const remote = await res.json();
  invalidateClientCache(["workflow:"]);
  return remote;
}

export async function bulkUpsertWorkflowStates(patches: WorkflowStatePatch[]): Promise<WorkflowState[]> {
  const normalized = patches.map((patch) => ({ ...patch, symbol: patch.symbol.toUpperCase() }));
  if (shouldUseMockFallback()) return saveLocalWorkflowStates(normalized);
  if (normalized.length === 0) return [];

  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/workflow/states/bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify(normalized),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, "Workflow state could not be saved."));
  }
  const data = await res.json();
  const remote: WorkflowState[] = data.states ?? [];
  invalidateClientCache(["workflow:"]);
  return remote;
}

export async function getMarketSummary(): Promise<MarketSummary | null> {
  if (shouldUseMockFallback()) return mockMarketSummary();
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/market/summary`, { headers });
    if (!res.ok) return shouldUseMockFallback() ? mockMarketSummary() : null;
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Market summary is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  } catch (error) {
    if (shouldUseMockFallback()) return mockMarketSummary();
    if (error instanceof Error && error.message.toLowerCase().includes("unavailable")) throw error;
    return null;
  }
}

export async function getQuote(symbol: string): Promise<ScanResult | null> {
  const sym = symbol.toUpperCase();
  if (shouldUseMockFallback()) return cachedClientRequest(`quote:${sym}`, 20_000, async () => mockQuote(sym));
  return cachedClientRequest(`quote:${sym}`, 20_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/stocks/${sym}/quote`, { headers });
      if (!res.ok) return shouldUseMockFallback() ? mockQuote(sym) : null;
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Quote data is temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      return data;
    } catch (error) {
      if (shouldUseMockFallback()) return mockQuote(sym);
      if (error instanceof Error && error.message.toLowerCase().includes("unavailable")) throw error;
      return null;
    }
  });
}

export type QuotesBatchResult = {
  quotes: Record<string, ScanResult>;
  as_of?: string | null;
};

export async function getQuotes(symbols: string[]): Promise<QuotesBatchResult> {
  const cleanSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (cleanSymbols.length === 0) return { quotes: {} };

  const cacheKey = `quotes:${cleanSymbols.sort().join(",")}`;
  if (shouldUseMockFallback()) {
    return cachedClientRequest(cacheKey, 20_000, async () => {
      const quotes: Record<string, ScanResult> = {};
      for (const symbol of cleanSymbols) {
        const quote = mockQuote(symbol);
        if (quote) quotes[symbol] = quote;
      }
      return { quotes, as_of: null };
    });
  }

  return cachedClientRequest(cacheKey, 20_000, async () => {
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({ symbols: cleanSymbols.join(",") });
      const res = await fetch(`${API}/api/v1/stocks/quotes?${params.toString()}`, { headers });
      if (!res.ok) {
        if (shouldUseMockFallback()) {
          const quotes: Record<string, ScanResult> = {};
          for (const symbol of cleanSymbols) {
            const quote = mockQuote(symbol);
            if (quote) quotes[symbol] = quote;
          }
          return { quotes, as_of: null };
        }
        throw new Error("Quote data is temporarily unavailable.");
      }
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Quote data is temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      const quotes = (data.quotes ?? data) as Record<string, ScanResult>;
      return {
        quotes,
        as_of: typeof data.as_of === "string" ? data.as_of : null,
      };
    } catch (error) {
      if (shouldUseMockFallback()) {
        const quotes: Record<string, ScanResult> = {};
        for (const symbol of cleanSymbols) {
          const quote = mockQuote(symbol);
          if (quote) quotes[symbol] = quote;
        }
        return { quotes, as_of: null };
      }
      if (error instanceof Error && error.message.toLowerCase().includes("unavailable")) throw error;
      throw new Error("Quote data is temporarily unavailable.");
    }
  });
}


export async function getQuoteLive(symbol: string): Promise<LiveQuote | null> {
  if (shouldUseMockFallback()) return mockLiveQuote(symbol);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/stocks/${symbol}/quote-live`, { headers });
    if (!res.ok) return shouldUseMockFallback() ? mockLiveQuote(symbol) : null;
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Live quote data is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  } catch (error) {
    if (shouldUseMockFallback()) return mockLiveQuote(symbol);
    if (error instanceof Error && error.message.toLowerCase().includes("unavailable")) throw error;
    return null;
  }
}

export function streamLiveQuotes(
  symbols: string[],
  onTicks: (ticks: LiveQuote[]) => void,
  onStatus?: (status: { connected: boolean; error?: string }) => void
): () => void {
  const cleanSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))).slice(0, 200);
  if (cleanSymbols.length === 0 || shouldUseMockFallback()) return () => {};

  const controller = new AbortController();
  let buffer = "";
  let stopped = false;

  async function start() {
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({ symbols: cleanSymbols.join(","), mode: "quote" });
      const res = await fetch(`${API}/api/v1/market/live/stream?${params.toString()}`, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Live stream HTTP ${res.status}`);
      onStatus?.({ connected: true });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5).trim());
          if (event === "error") {
            onStatus?.({ connected: false, error: payload.message || "Live stream unavailable" });
            continue;
          }
          if ((event === "tick" || event === "snapshot") && Array.isArray(payload.ticks)) {
            onTicks(payload.ticks as LiveQuote[]);
          }
        }
      }
    } catch (error) {
      if (!stopped) {
        onStatus?.({ connected: false, error: error instanceof Error ? error.message : "Live stream unavailable" });
      }
    }
  }

  void start();

  return () => {
    stopped = true;
    controller.abort();
  };
}



export async function getLiveMarketStatus(): Promise<LiveMarketStatus | null> {
  if (shouldUseMockFallback()) return null;
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/market/live/status`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getLiveSectorIndices(): Promise<{ basis: string; source: string; is_live: boolean; as_of: string; sectors: LiveSectorIndex[] } | null> {
  if (shouldUseMockFallback()) return null;
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/market/live/sectors`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Charts ────────────────────────────────────────────────────────────────────










const mockDrawingsKey = "alphavyuh-mock-chart-drawings-v1";
const mockWorkspaceKey = "alphavyuh-mock-chart-workspaces-v1";
const chartWorkspaceCacheKey = "alphavyuh-chart-workspaces-cache-v1";

function chartStoreKey(symbol: string, timeframe = "D") {
  return `${symbol.toUpperCase()}:${timeframe.toUpperCase()}`;
}

function readMockDrawingMap(): Record<string, Drawing[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(mockDrawingsKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMockDrawingMap(value: Record<string, Drawing[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockDrawingsKey, JSON.stringify(value));
}

function readMockWorkspaceMap(): Record<string, ChartWorkspace> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(mockWorkspaceKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMockWorkspaceMap(value: Record<string, ChartWorkspace>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockWorkspaceKey, JSON.stringify(value));
}

function readChartWorkspaceCache(): Record<string, ChartWorkspace> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(chartWorkspaceCacheKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeChartWorkspaceCache(value: Record<string, ChartWorkspace>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chartWorkspaceCacheKey, JSON.stringify(value));
  } catch {
    // Workspace cache is a local-first reliability layer only.
  }
}

function cacheChartWorkspace(symbol: string, workspace: Omit<ChartWorkspace, "symbol">): ChartWorkspace {
  const normalized = symbol.toUpperCase();
  const saved: ChartWorkspace = {
    ...workspace,
    symbol: normalized,
    timeframe: workspace.timeframe.toUpperCase(),
    indicators: Array.isArray(workspace.indicators) ? workspace.indicators : [],
    drawings: Array.isArray(workspace.drawings) ? workspace.drawings : [],
  };
  const map = readChartWorkspaceCache();
  map[chartStoreKey(normalized, saved.timeframe)] = saved;
  writeChartWorkspaceCache(map);
  return saved;
}

export async function getCandles(
  symbol: string,
  params?: { from_date?: string; to_date?: string; limit?: number; timeframe?: string }
): Promise<CandlesResponse> {
  const sym = symbol.trim().toUpperCase();
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.timeframe) qs.set("timeframe", params.timeframe);
  const query = qs.toString();
  const cacheKey = `candles:${sym}:${query}`;
  if (shouldUseMockFallback()) return cachedClientRequest(cacheKey, 60_000, async () => mockCandles(sym, params?.timeframe, params?.limit));
  return cachedClientRequest(cacheKey, 60_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/charts/${sym}/candles?${query}`, { headers });
      if (!res.ok) {
        if (shouldUseMockFallback()) return mockCandles(sym, params?.timeframe, params?.limit);
        const text = await res.text().catch(() => "");
        let body: { detail?: unknown; message?: unknown; error?: unknown } = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = {};
        }
        const detail = body.detail ?? body.message ?? body.error;
        throw new Error(typeof detail === "string" && detail.trim() ? detail : `No data for ${sym}`);
      }
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Chart candle data is temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      return data;
    } catch (error) {
      if (shouldUseMockFallback()) return mockCandles(sym, params?.timeframe, params?.limit);
      throw error;
    }
  });
}

export async function getIndicators(
  symbol: string,
  indicators: string[],
  timeframe = "D"
): Promise<IndicatorsResponse> {
  const sym = symbol.trim().toUpperCase();
  const cleanIndicators = Array.from(new Set(indicators)).sort();
  const cacheKey = `indicators:${sym}:${timeframe}:${cleanIndicators.join(",")}`;
  if (shouldUseMockFallback()) return cachedClientRequest(cacheKey, 60_000, async () => mockIndicators(sym));
  return cachedClientRequest(cacheKey, 60_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `${API}/api/v1/charts/${sym}/indicators?indicators=${cleanIndicators.join(",")}&timeframe=${timeframe}`,
        { headers }
      );
      if (!res.ok) {
        if (shouldUseMockFallback()) return mockIndicators(sym);
        throw new Error(await responseErrorMessage(res, `Chart indicators are temporarily unavailable (${res.status}).`));
      }
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Chart indicators are temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      return data;
    } catch (error) {
      if (shouldUseMockFallback()) return mockIndicators(sym);
      throw error;
    }
  });
}

export function prefetchCandles(
  symbol: string,
  params?: { from_date?: string; to_date?: string; limit?: number; timeframe?: string }
) {
  void getCandles(symbol, params).catch(() => {});
}

export function prefetchIndicators(symbol: string, indicators: string[], timeframe = "D") {
  if (!indicators.length) return;
  void getIndicators(symbol, indicators, timeframe).catch(() => {});
}



export async function getMarketMovers(): Promise<MarketMovers | null> {
  if (shouldUseMockFallback()) return mockMarketMovers();
  const res = await fetch(`${API}/api/v1/market/movers`, { headers: publicHeaders });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Market movers are temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Market movers are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (data?.trade_date == null && Array.isArray(data?.gainers) && Array.isArray(data?.losers) && Array.isArray(data?.volume_surge)) {
    throw new Error("Market movers are temporarily unavailable.");
  }
  return data;
}


export async function getSectorBreadth(): Promise<{ trade_date: string | null; sectors: SectorBreadthItem[]; metadata?: SectorTaxonomyMetadata } | null> {
  if (shouldUseMockFallback()) return mockSectorBreadth();
  const res = await fetch(`${API}/api/v1/market/sector-breadth`, { headers: publicHeaders });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Sector breadth is temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Sector breadth is temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (data?.trade_date == null && Array.isArray(data?.sectors)) {
    throw new Error("Sector breadth is temporarily unavailable.");
  }
  return data;
}

export async function getSectorsWithMetadata(): Promise<SectorListResponse> {
  if (shouldUseMockFallback()) {
    const breadth = mockSectorBreadth();
    return { sectors: breadth.sectors.map((s) => s.sector), metadata: breadth.metadata };
  }
  const res = await fetch(`${API}/api/v1/market/sectors`, { headers: publicHeaders });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Sector list is temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Sector list is temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data?.sectors)) {
    throw new Error("Sector list is temporarily unavailable.");
  }
  return {
    sectors: data.sectors,
    metadata: data.metadata,
  };
}

export async function getSectors(): Promise<string[]> {
  const response = await getSectorsWithMetadata();
  return response.sectors;
}

export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  if (shouldUseMockFallback()) return mockSearchSymbols(q);
  const res = await fetch(`${API}/api/v1/charts/search?q=${encodeURIComponent(q)}`, { headers: publicHeaders });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Symbol search is temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Symbol search is temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (data?.results == null || !Array.isArray(data.results)) {
    throw new Error("Symbol search is temporarily unavailable.");
  }
  return data.results;
}

export async function getDrawings(symbol: string, timeframe = "D"): Promise<Drawing[]> {
  if (shouldUseMockFallback()) return readMockDrawingMap()[chartStoreKey(symbol, timeframe)] ?? [];
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings?timeframe=${timeframe}`, { headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Chart drawings are temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Chart drawings are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data)) throw new Error("Chart drawings are temporarily unavailable.");
  return data;
}

export async function getChartWorkspace(symbol: string, timeframe = "D"): Promise<ChartWorkspace> {
  const normalized = symbol.toUpperCase();
  const normalizedTimeframe = timeframe.toUpperCase();
  if (shouldUseMockFallback()) {
    return readMockWorkspaceMap()[chartStoreKey(normalized, normalizedTimeframe)] ?? { symbol: normalized, timeframe: normalizedTimeframe, indicators: [], drawings: [] };
  }
  const local = readChartWorkspaceCache()[chartStoreKey(normalized, normalizedTimeframe)] ?? null;
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${normalized}/workspace?timeframe=${normalizedTimeframe}`, { headers });
    if (!res.ok) {
      if (local) return local;
      throw new Error(await responseErrorMessage(res, `Chart workspace is temporarily unavailable (${res.status}).`));
    }
    const remote: ChartWorkspace & { status?: string; message?: string; detail?: string } = await res.json();
    const unavailableMessage = unavailablePayloadMessage(remote, "Chart workspace is temporarily unavailable.");
    if (unavailableMessage) {
      if (local) return local;
      throw new Error(unavailableMessage);
    }
    if (!Array.isArray(remote.indicators) || !Array.isArray(remote.drawings)) {
      if (local) return local;
      throw new Error("Chart workspace is temporarily unavailable.");
    }
    return cacheChartWorkspace(normalized, {
      timeframe: remote.timeframe || normalizedTimeframe,
      indicators: remote.indicators,
      drawings: remote.drawings,
    });
  } catch (error) {
    if (local) return local;
    if (error instanceof Error) throw error;
    throw new Error("Chart workspace is temporarily unavailable.");
  }
}

export async function saveChartWorkspace(
  symbol: string,
  workspace: Omit<ChartWorkspace, "symbol">,
  options: { throwOnFailure?: boolean } = {},
): Promise<ChartWorkspace> {
  const normalized = symbol.toUpperCase();
  const local = cacheChartWorkspace(normalized, workspace);
  if (shouldUseMockFallback()) {
    const map = readMockWorkspaceMap();
    map[chartStoreKey(normalized, workspace.timeframe)] = local;
    writeMockWorkspaceMap(map);
    return local;
  }
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${normalized}/workspace`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...workspace, timeframe: local.timeframe }),
    });
    if (!res.ok) {
      if (options.throwOnFailure) {
        throw new Error(await responseErrorMessage(res, "Chart workspace changes were saved locally but could not sync."));
      }
      return local;
    }
    const remote: ChartWorkspace = await res.json();
    return cacheChartWorkspace(normalized, {
      timeframe: remote.timeframe || local.timeframe,
      indicators: remote.indicators ?? local.indicators,
      drawings: remote.drawings ?? local.drawings,
    });
  } catch (error) {
    if (options.throwOnFailure) {
      if (error instanceof Error) throw error;
      throw new Error("Chart workspace changes were saved locally but could not sync.");
    }
    return local;
  }
}

export async function saveDrawing(
  symbol: string,
  drawing: { tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe: string }
): Promise<Drawing> {
  if (shouldUseMockFallback()) {
    const normalized = symbol.toUpperCase();
    const saved: Drawing = {
      id: `mock-drawing-${Date.now()}`,
      user_id: "mock-user",
      symbol: normalized,
      timeframe: drawing.timeframe,
      tool_type: drawing.tool_type,
      points: drawing.points,
      style: drawing.style,
      created_at: new Date().toISOString(),
    };
    const map = readMockDrawingMap();
    const key = chartStoreKey(normalized, drawing.timeframe);
    map[key] = [...(map[key] ?? []), saved];
    writeMockDrawingMap(map);
    return saved;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings`, {
    method: "POST",
    headers,
    body: JSON.stringify(drawing),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Chart drawing could not be saved (${res.status}).`));
  }
  return res.json();
}

export async function updateDrawing(
  symbol: string,
  drawingId: string,
  drawing: { tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe: string }
): Promise<Drawing> {
  if (shouldUseMockFallback()) {
    const normalized = symbol.toUpperCase();
    const map = readMockDrawingMap();
    const key = chartStoreKey(normalized, drawing.timeframe);
    const existing = map[key]?.find((item) => item.id === drawingId);
    const updated: Drawing = {
      id: drawingId,
      user_id: existing?.user_id ?? "mock-user",
      symbol: normalized,
      timeframe: drawing.timeframe,
      tool_type: drawing.tool_type,
      points: drawing.points,
      style: drawing.style,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    map[key] = (map[key] ?? []).map((item) => item.id === drawingId ? updated : item);
    if (!map[key].some((item) => item.id === drawingId)) map[key].push(updated);
    writeMockDrawingMap(map);
    return updated;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings/${drawingId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(drawing),
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Chart drawing could not be updated (${res.status}).`));
  }
  return res.json();
}

export async function deleteDrawing(symbol: string, drawingId: string): Promise<void> {
  if (shouldUseMockFallback()) {
    const normalized = symbol.toUpperCase();
    const map = readMockDrawingMap();
    for (const key of Object.keys(map)) {
      if (key.startsWith(`${normalized}:`)) {
        map[key] = map[key].filter((item) => item.id !== drawingId);
      }
    }
    writeMockDrawingMap(map);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings/${drawingId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(await responseErrorMessage(res, `Chart drawing could not be deleted (${res.status}).`));
  }
}

export async function getChartLayout(symbol: string): Promise<ChartLayout> {
  if (shouldUseMockFallback()) return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  const normalizeLayoutIndicators = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object" || !("type" in item)) return [];
      const raw = item as { type?: string; params?: { period?: unknown } };
      if (raw.type === "ema") return [`ema${raw.params?.period ?? 20}`];
      if (raw.type === "vwap" || raw.type === "rsi" || raw.type === "macd" || raw.type === "volume") return [raw.type];
      return [];
    });
  };
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${symbol}/layout`, { headers });
    if (res?.ok) {
      const layout: ChartLayout = await res.json();
      layout.indicators = normalizeLayoutIndicators(layout.indicators);
      if (layout.indicators?.length || layout.drawing_tools?.length || layout.timeframe !== "D") return layout;
    } else {
      throw new Error(await responseErrorMessage(res, `Chart layout is temporarily unavailable (${res.status}).`));
    }
    const defaultRes = await fetch(`${API}/api/v1/charts/__DEFAULT__/layout`, { headers });
    if (defaultRes.ok) {
      const fallback: ChartLayout = await defaultRes.json();
      fallback.indicators = normalizeLayoutIndicators(fallback.indicators);
      return { ...fallback, symbol, drawing_tools: [] };
    }
    return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Chart layout is temporarily unavailable.");
  }
}

export async function saveChartLayout(symbol: string, layout: Omit<ChartLayout, "symbol">): Promise<ChartLayout> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/layout`, {
    method: "POST",
    headers,
    body: JSON.stringify(layout),
  });
  if (!res.ok) throw new Error("Save layout failed");
  return res.json();
}

export async function saveDefaultChartLayout(layout: Omit<ChartLayout, "symbol">): Promise<ChartLayout> {
  return saveChartLayout("__DEFAULT__", { ...layout, drawing_tools: [] });
}

// ── Journal ───────────────────────────────────────────────────────────────────





const mockJournalKey = "alphavyuh-mock-journal-v1";
const mockBrokerSyncKey = "alphavyuh-mock-broker-sync-v1";
const brokerImportMarker = "alphavyuh-broker-import";
type BrokerImportSource = "zerodha" | "upstox";

const brokerImportProfiles: Record<BrokerImportSource, {
  displayName: string;
  orders: Array<{
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
  }>;
}> = {
  zerodha: {
    displayName: "Zerodha",
    orders: [
      { orderId: "MOCK-ZERODHA-1001", symbol: "RELIANCE", side: "BUY", quantity: 10, price: 1500 },
      { orderId: "MOCK-ZERODHA-1002", symbol: "INFY", side: "BUY", quantity: 5, price: 1420 },
    ],
  },
  upstox: {
    displayName: "Upstox",
    orders: [
      { orderId: "MOCK-UPSTOX-2001", symbol: "RELIANCE", side: "BUY", quantity: 8, price: 1504 },
      { orderId: "MOCK-UPSTOX-2002", symbol: "TCS", side: "BUY", quantity: 4, price: 3860 },
    ],
  },
};

function readLocalJournalEntries(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(mockJournalKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as JournalEntry[] : [];
  } catch {
    return [];
  }
}

function writeLocalJournalEntries(entries: JournalEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockJournalKey, JSON.stringify(entries));
}

function readLocalBrokerSync(): { last_synced_at: string | null; last_synced_broker: BrokerImportSource | null } {
  if (typeof window === "undefined") return { last_synced_at: null, last_synced_broker: null };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(mockBrokerSyncKey) || "{}");
    const broker = parsed.last_synced_broker;
    return {
      last_synced_at: typeof parsed.last_synced_at === "string" ? parsed.last_synced_at : null,
      last_synced_broker: broker === "zerodha" || broker === "upstox" ? broker : null,
    };
  } catch {
    return { last_synced_at: null, last_synced_broker: null };
  }
}

function writeLocalBrokerSync(lastSyncedAt: string, broker: BrokerImportSource) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockBrokerSyncKey, JSON.stringify({ last_synced_at: lastSyncedAt, last_synced_broker: broker }));
}

function createLocalJournalEntry(entry: CreateJournalEntry): JournalEntry {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mock-journal-${Date.now()}`;
  return {
    id,
    user_id: "mock-user",
    symbol: entry.symbol.toUpperCase(),
    company_name: null,
    trade_type: entry.trade_type,
    setup_type: entry.setup_type ?? null,
    entry_date: entry.entry_date,
    entry_price: entry.entry_price,
    quantity: entry.quantity,
    exit_date: null,
    exit_price: null,
    pnl: null,
    pnl_pct: null,
    holding_days: null,
    stop_loss: entry.stop_loss ?? null,
    target_price: entry.target_price ?? null,
    risk_reward: entry.stop_loss && entry.target_price && entry.stop_loss !== entry.entry_price
      ? Number((Math.abs(entry.target_price - entry.entry_price) / Math.abs(entry.entry_price - entry.stop_loss)).toFixed(2))
      : null,
    entry_reason: entry.entry_reason ?? null,
    exit_reason: null,
    mistakes: null,
    lessons: null,
    status: "open",
    source_page: entry.source_page ?? null,
    source_context: entry.source_context ?? null,
    scanner_context: entry.scanner_context ?? null,
    thesis: entry.thesis ?? null,
    invalidation_rule: entry.invalidation_rule ?? null,
    created_at: now,
    updated_at: now,
  };
}

function mergeMockJournalEntries(local: JournalEntry[], base: JournalEntry[]): JournalEntry[] {
  const localIds = new Set(local.map((entry) => entry.id));
  return [...local, ...base.filter((entry) => !localIds.has(entry.id))];
}

function updateLocalJournalEntry(id: string, update: UpdateJournalEntry): JournalEntry | null {
  const base = mockJournalEntries().entries;
  const local = readLocalJournalEntries();
  const existing = local.find((entry) => entry.id === id) ?? base.find((entry) => entry.id === id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const { status, ...restUpdate } = update;
  const next: JournalEntry = {
    ...existing,
    ...restUpdate,
    status: status === "open" || status === "closed" || status === "cancelled" ? status : existing.status,
    updated_at: now,
  };

  if (update.exit_date && update.exit_price != null) {
    const pnl = existing.trade_type === "long"
      ? (update.exit_price - existing.entry_price) * existing.quantity
      : (existing.entry_price - update.exit_price) * existing.quantity;
    const entryDate = new Date(`${existing.entry_date}T00:00:00Z`).getTime();
    const exitDate = new Date(`${update.exit_date}T00:00:00Z`).getTime();
    next.pnl = Number(pnl.toFixed(2));
    next.pnl_pct = Number((pnl / (existing.entry_price * existing.quantity) * 100).toFixed(4));
    next.status = "closed";
    next.holding_days = Number.isFinite(entryDate) && Number.isFinite(exitDate)
      ? Math.max(0, Math.round((exitDate - entryDate) / 86400000))
      : existing.holding_days;
  }

  const others = local.filter((entry) => entry.id !== id);
  writeLocalJournalEntries([next, ...others]);
  invalidateClientCache(["journal:", "portfolio"]);
  return next;
}

export async function getJournalEntries(
  params?: { limit?: number; offset?: number; status?: string; symbol?: string }
): Promise<{ entries: JournalEntry[]; total: number; plan?: string; history_months?: number | null }> {
  if (shouldUseMockFallback()) {
    const base = mockJournalEntries();
    const local = readLocalJournalEntries();
    let entries = mergeMockJournalEntries(local, base.entries);
    if (params?.status) entries = entries.filter((entry) => entry.status === params.status);
    if (params?.symbol) entries = entries.filter((entry) => entry.symbol === params.symbol?.toUpperCase());
    const total = entries.length;
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? entries.length;
    return { entries: entries.slice(offset, offset + limit), total, plan: "mock", history_months: null };
  }
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.symbol) qs.set("symbol", params.symbol);
  const cacheKey = `journal:entries:${qs.toString()}`;
  return cachedClientRequest(cacheKey, 20_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal?${qs}`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Journal entries are temporarily unavailable (${res.status}).`));
    }
    return res.json();
  });
}

export async function getJournalStats(): Promise<JournalStats> {
  if (shouldUseMockFallback()) return mockJournalStats();
  return cachedClientRequest("journal:stats", 30_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal/stats`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Journal stats are temporarily unavailable (${res.status}).`));
    }
    return res.json();
  });
}

export async function createJournalEntry(entry: CreateJournalEntry): Promise<JournalEntry> {
  if (shouldUseMockFallback()) {
    const created = createLocalJournalEntry(entry);
    writeLocalJournalEntries([created, ...readLocalJournalEntries()]);
    invalidateClientCache(["journal:", "portfolio"]);
    return created;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal`, {
    method: "POST",
    headers,
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const created = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return created;
}

export async function updateJournalEntry(id: string, update: UpdateJournalEntry): Promise<JournalEntry> {
  if (shouldUseMockFallback()) {
    const updated = updateLocalJournalEntry(id, update);
    if (!updated) throw new Error("Entry not found");
    return updated;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const updated = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return updated;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  if (shouldUseMockFallback()) {
    writeLocalJournalEntries(readLocalJournalEntries().filter((entry) => entry.id !== id));
    invalidateClientCache(["journal:", "portfolio"]);
    return;
  }
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/journal/${id}`, { method: "DELETE", headers });
  invalidateClientCache(["journal:", "portfolio"]);
}


export async function getJournalAnalytics(): Promise<JournalAnalytics> {
  if (shouldUseMockFallback()) return mockJournalAnalytics();
  return cachedClientRequest("journal:analytics", 30_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal/analytics`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Journal analytics are temporarily unavailable (${res.status}).`));
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Journal analytics are temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  });
}

// ── Fundamentals ──────────────────────────────────────────────────────────────


function mockFundamentals(symbol: string): Fundamentals {
  const quote = mockQuote(symbol);
  const normalized = quote?.symbol ?? symbol.trim().toUpperCase();
  const close = quote?.close ?? 1000;
  const seed = normalized.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    symbol: normalized,
    market: quote?.market ?? "NSE",
    currency: quote?.currency ?? "INR",
    trailing_pe: Number((18 + (seed % 22) * 0.7).toFixed(1)),
    forward_pe: Number((16 + (seed % 18) * 0.6).toFixed(1)),
    price_to_book: Number((2 + (seed % 12) * 0.35).toFixed(2)),
    dividend_yield: Number(((seed % 5) * 0.25).toFixed(2)),
    trailing_eps: Number((close / Math.max(12, 18 + (seed % 22))).toFixed(2)),
    forward_eps: Number((close / Math.max(11, 16 + (seed % 18))).toFixed(2)),
    earnings_growth: Number((4 + (seed % 18) * 0.8).toFixed(1)),
    revenue_growth: Number((3 + (seed % 15) * 0.7).toFixed(1)),
    return_on_equity: Number((9 + (seed % 18) * 0.9).toFixed(1)),
    debt_to_equity: Number((0.2 + (seed % 12) * 0.08).toFixed(2)),
    market_cap: null,
    market_cap_str: seed % 2 === 0 ? `₹${(25_000 + (seed % 90) * 1200).toLocaleString("en-IN")} Cr` : null,
    shares_outstanding: null,
  };
}

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  if (shouldUseMockFallback()) return mockFundamentals(sym);
  return cachedClientRequest(`fundamentals:${sym}`, 6 * 60 * 60 * 1000, async () => {
    try {
      const res = await withTimeout(fetch(`${API}/api/v1/stocks/${sym}/fundamentals`), 2_500);
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.data_status === "unavailable") {
        throw new Error(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Fundamentals are temporarily unavailable.",
        );
      }
      return data;
    } catch {
      return null;
    }
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────



export async function getPaymentConfig(): Promise<PaymentConfig> {
  if (shouldUseMockFallback()) {
    return { gateway: "razorpay", configured: false, mode: "disabled", key_prefix: "", access_code_available: false };
  }
  try {
    const res = await fetch(`${API}/api/v1/payments/config`, { headers: publicHeaders });
    if (!res.ok) throw new Error("Payment config unavailable");
    return res.json();
  } catch {
    return { gateway: "razorpay", configured: false, mode: "disabled", key_prefix: "", access_code_available: false };
  }
}

export async function getPlanStatus(): Promise<PlanStatus> {
  if (shouldUseMockFallback()) return { plan: "free", expires_at: null, active: false };
  return cachedClientRequest("payments:status", 60_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/payments/status`, { headers });
      if (!res.ok) return { plan: "free", expires_at: null, active: false };
      return res.json();
    } catch {
      return { plan: "free", expires_at: null, active: false };
    }
  });
}

export async function createPaymentOrder(
  plan: "pro" | "elite",
  currency: "INR" | "USD" = "INR",
  billing: "monthly" | "annual" = "monthly",
): Promise<{
  order_id: string;
  amount: number;
  currency: string;
  plan: string;
  billing: string;
  label: string;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/create-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan, currency, billing }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

export async function verifyPayment(data: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: string;
  currency?: string;
  billing?: string;
}): Promise<{ status: string; plan: string; expires_at: string; currency?: string; billing?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Payment verification failed");
  return res.json();
}

export async function applyAccessPlan(code: string): Promise<{ status: string; plan: string; expires_at: string; billing: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/access/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Access code failed" }));
    throw new Error(body.detail ?? "Access code failed");
  }
  return res.json();
}


export async function getPlanPrices(currency: "INR" | "USD" = "INR"): Promise<PlanPrice[]> {
  const res = await fetch(`${API}/api/v1/payments/plans?currency=${currency}`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.plans ?? [];
}

export async function analyseJournal(): Promise<{ analysis: string; trades_analysed: number; disclaimer?: string }> {
  if (shouldUseMockFallback()) {
    return {
      analysis: "Closed-trade sample: planned breakout and pullback setups had the highest realised P&L. Trades with missing invalidation notes showed larger average drawdowns after failed confirmation.",
      trades_analysed: 24,
      disclaimer: "Mock trade review for local demo mode.",
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/ai/analyse`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof body.detail === "string" ? body.detail : "Trade review failed");
  }
  return res.json();
}

// ── Scan Alerts ───────────────────────────────────────────────────────────────



const mockScanAlertsKey = "alphavyuh-mock-scan-alerts-v1";
const mockScanAlertMatchesKey = "alphavyuh-mock-scan-alert-matches-v1";
const scanAlertSortKeys = new Set([
  "symbol",
  "close",
  "pct_change",
  "volume",
  "volume_ratio",
  "rsi_14",
  "ema_20",
  "atr_14",
  "week_52_high_pct",
  "gap_pct",
  "atr_pct",
  "turnover",
  "adx_14",
  "stoch_k",
  "setup_score",
]);

function readMockScanAlerts(): ScanAlert[] {
  const defaults = mockScanAlerts();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(mockScanAlertsKey);
    return raw ? JSON.parse(raw) : defaults;
  } catch {
    return defaults;
  }
}

function writeMockScanAlerts(alerts: ScanAlert[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockScanAlertsKey, JSON.stringify(alerts));
}

function readMockScanAlertMatches(): ScanAlertMatch[] {
  const defaults = mockScanAlertMatches();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(mockScanAlertMatchesKey);
    return raw ? JSON.parse(raw) : defaults;
  } catch {
    return defaults;
  }
}

function writeMockScanAlertMatches(matches: ScanAlertMatch[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockScanAlertMatchesKey, JSON.stringify(matches));
}

function mockAlertSymbols(alertId: string, alertName: string): ScanAlertMatch {
  const scan = mockRunScan();
  const symbols = scan.results.slice(0, 10).map((result) => ({
    symbol: result.symbol,
    close: result.close,
    pct_change: result.pct_change,
    volume_ratio: result.volume_ratio,
    rsi_14: result.rsi_14,
  }));
  return {
    id: `sam-${alertId}`,
    alert_id: alertId,
    run_date: scan.trade_date ?? new Date().toISOString().slice(0, 10),
    symbols,
    match_count: scan.total_matches,
    run_status: "success",
    error_message: null,
    scan_alerts: { name: alertName },
  };
}

export async function listAlerts(): Promise<ScanAlert[]> {
  if (shouldUseMockFallback()) return readMockScanAlerts();
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts`, { headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, `Scan alerts are temporarily unavailable (${res.status}).`));
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Scan alerts are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data.alerts)) throw new Error("Scan alerts are temporarily unavailable.");
  return data.alerts;
}

export async function createAlert(body: {
  name: string;
  filters: Record<string, unknown>;
  sort_by?: string;
  sort_order?: string;
}): Promise<ScanAlert> {
  if (shouldUseMockFallback()) {
    if (body.sort_by && !scanAlertSortKeys.has(body.sort_by)) throw new Error(`Invalid sort_by: ${body.sort_by}`);
    if (body.sort_order && !["asc", "desc"].includes(body.sort_order)) throw new Error("sort_order must be asc or desc");
    const existing = readMockScanAlerts();
    if (existing.length >= 2) throw new Error("Free plan allows max 2 scan alerts.");
    const now = new Date().toISOString();
    const alert: ScanAlert = {
      id: `sa-${Date.now()}`,
      name: body.name.trim().slice(0, 80) || "Saved scan",
      filters: body.filters,
      sort_by: body.sort_by ?? "volume_ratio",
      sort_order: body.sort_order ?? "desc",
      is_active: true,
      last_run_at: now,
      last_match_count: mockRunScan().total_matches,
      last_run_status: "success",
      last_error: null,
      created_at: now,
    };
    writeMockScanAlerts([alert, ...existing]);
    writeMockScanAlertMatches([mockAlertSymbols(alert.id, alert.name), ...readMockScanAlertMatches()]);
    invalidateClientCache(["scan-alerts"]);
    return alert;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof err.detail === "string" ? err.detail : `Scan alerts are temporarily unavailable (${res.status}).`);
  }
  const created = await res.json();
  invalidateClientCache(["scan-alerts"]);
  return created;
}

export async function updateAlert(id: string, body: {
  name?: string;
  is_active?: boolean;
  filters?: Record<string, unknown>;
  sort_by?: string;
  sort_order?: string;
}): Promise<ScanAlert> {
  if (shouldUseMockFallback()) {
    if (body.sort_by && !scanAlertSortKeys.has(body.sort_by)) throw new Error(`Invalid sort_by: ${body.sort_by}`);
    if (body.sort_order && !["asc", "desc"].includes(body.sort_order)) throw new Error("sort_order must be asc or desc");
    const alerts = readMockScanAlerts();
    const next = alerts.map((alert) => alert.id === id ? { ...alert, ...body } : alert);
    writeMockScanAlerts(next);
    invalidateClientCache(["scan-alerts"]);
    const updated = next.find((alert) => alert.id === id);
    if (!updated) throw new Error("Alert not found");
    return updated;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, `Scan alerts are temporarily unavailable (${res.status}).`));
  const updated = await res.json();
  invalidateClientCache(["scan-alerts"]);
  return updated;
}

export async function deleteAlert(id: string): Promise<void> {
  if (shouldUseMockFallback()) {
    writeMockScanAlerts(readMockScanAlerts().filter((alert) => alert.id !== id));
    writeMockScanAlertMatches(readMockScanAlertMatches().filter((match) => match.alert_id !== id));
    invalidateClientCache(["scan-alerts"]);
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/${id}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, `Scan alerts are temporarily unavailable (${res.status}).`));
  invalidateClientCache(["scan-alerts"]);
}

export async function getAlertMatches(alertId: string): Promise<ScanAlertMatch[]> {
  if (shouldUseMockFallback()) return readMockScanAlertMatches().filter((match) => match.alert_id === alertId);
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/${alertId}/matches`, { headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, `Scan alerts are temporarily unavailable (${res.status}).`));
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Scan alerts are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data.matches)) throw new Error("Scan alerts are temporarily unavailable.");
  return data.matches;
}

export async function getRecentAlertMatches(): Promise<ScanAlertMatch[]> {
  if (shouldUseMockFallback()) return readMockScanAlertMatches();
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/recent/matches`, { headers });
  if (!res.ok) throw new Error(await responseErrorMessage(res, `Scan alerts are temporarily unavailable (${res.status}).`));
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Scan alerts are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  if (!Array.isArray(data.matches)) throw new Error("Scan alerts are temporarily unavailable.");
  return data.matches;
}


export async function getMe(): Promise<UserProfile> {
  if (shouldUseMockFallback()) {
    return {
      id: "mock-user",
      email: "mock@alphavyuh.local",
      full_name: "AlphaVyuh Demo",
      avatar_url: null,
      plan: "pro",
      plan_expires_at: null,
      onboarding_completed: false,
      telegram_chat_id: null,
      broker_type: null,
      broker_connected_at: null,
      billing_region: "IN",
      billing_currency: "INR",
      created_at: new Date().toISOString(),
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/me`, { headers });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function updateMe(updates: {
  full_name?: string;
  onboarding_completed?: boolean;
  onboarding_dismissed?: boolean;
  telegram_chat_id?: string;
  broker_type?: string;
  billing_region?: string;
  billing_currency?: string;
}): Promise<UserProfile> {
  if (shouldUseMockFallback()) {
    return { ...(await getMe()), ...updates };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/me`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to update profile");
  }
  return res.json();
}

export async function getZerodhaLoginUrl(): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/zerodha/login`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message ?? err.detail ?? "Failed to get login URL");
  }
  const data = await res.json();
  return data.login_url;
}

export async function connectZerodha(requestToken: string, state: string): Promise<{ status: string; message: string }> {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ request_token: requestToken, state });
  const res = await fetch(`${API}/api/v1/broker/zerodha/callback?${qs.toString()}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message ?? err.detail ?? "Zerodha connection failed");
  }
  return res.json();
}

export async function connectBrokerCallback(
  broker: "zerodha" | "upstox",
  codeOrToken: string,
  state: string
): Promise<{ status: string; broker: string; broker_user_name?: string; token_expires_at?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/${broker}/callback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code_or_token: codeOrToken, state }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message ?? err.detail ?? `${broker} connection failed`);
  }
  invalidateClientCache(["broker:status"]);
  return res.json();
}

// ── Orders / Broker ───────────────────────────────────────────────────────────




export async function closePosition(
  journalId: string,
  exitPrice: number,
  exitReason?: string
): Promise<{ status: string; pnl: number; pnl_pct: number; message: string; lesson_generated?: boolean; review_tip?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/orders/close`, {
    method: "POST",
    headers,
    body: JSON.stringify({ journal_id: journalId, exit_price: exitPrice, exit_reason: exitReason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Close failed (${res.status})`);
  }
  const closed = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return closed;
}

export async function importBrokerTrades(broker: BrokerImportSource = "zerodha"): Promise<{
  imported: number; skipped: number; total_filled_orders: number; message: string; last_synced_at?: string | null
}> {
  if (shouldUseMockFallback()) {
    const now = new Date().toISOString();
    const local = readLocalJournalEntries();
    const profile = brokerImportProfiles[broker];
    let imported = 0;
    let skipped = 0;
    const next = [...local];
    for (const order of profile.orders) {
      const marker = `${brokerImportMarker}:${broker}:order:${order.orderId}`;
      if (next.some((entry) => entry.entry_reason?.includes(marker))) {
        skipped += 1;
        continue;
      }
      next.unshift(createLocalJournalEntry({
        symbol: order.symbol,
        trade_type: order.side === "BUY" ? "long" : "short",
        entry_date: now.slice(0, 10),
        entry_price: order.price,
        quantity: order.quantity,
        entry_reason: `${profile.displayName} import - order #${order.orderId} [${marker}] [${profile.displayName} - auto]`,
      }));
      imported += 1;
    }
    writeLocalJournalEntries(next);
    writeLocalBrokerSync(now, broker);
    invalidateClientCache(["journal:", "portfolio", "broker:status"]);
    return {
      imported,
      skipped,
      total_filled_orders: profile.orders.length,
      last_synced_at: now,
      message: `Imported ${imported} new mock trade(s) from ${profile.displayName}.`,
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/${broker}/import`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail?.message ?? body.detail ?? "Import failed");
  }
  const imported = await res.json();
  invalidateClientCache(["journal:", "portfolio", "broker:status"]);
  return imported;
}

export const importZerodhaTrades = () => importBrokerTrades("zerodha");

export async function runBrokerReadOnlySmoke(broker: "zerodha" | "upstox" = "zerodha"): Promise<ZerodhaReadOnlySmoke> {
  if (shouldUseMockFallback()) {
    return {
      broker,
      connected_read_only: false,
      token_expired: false,
      checks: {
        login_url: { ok: true },
        profile: { ok: true, user_id_present: true },
        positions: { ok: true, count: 1 },
        holdings: { ok: true, count: 2 },
        orderbook: { ok: true, count: 2 },
        tradebook: { ok: true, count: 2 },
      },
    };
  }
  const headers = await authHeaders();
  const path = broker === "zerodha"
    ? "/api/v1/broker/zerodha/read-only-smoke"
    : `/api/brokers/${broker}/read-only-smoke`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Read-only broker smoke failed");
  }
  return res.json();
}

export const runZerodhaReadOnlySmoke = () => runBrokerReadOnlySmoke("zerodha");

export interface KiteTokenHealth {
  connected: boolean;
  token_valid: boolean;
  profile_check_passed?: boolean;
  token_age_seconds: number | null;
  expires_in_seconds: number | null;
  connected_at: string | null;
  expires_at: string | null;
  needs_reconnect: boolean;
}

export async function getKiteTokenHealth(): Promise<KiteTokenHealth> {
  if (shouldUseMockFallback()) {
    return {
      connected: true,
      token_valid: true,
      profile_check_passed: true,
      token_age_seconds: 3600,
      expires_in_seconds: 28800,
      connected_at: new Date(Date.now() - 3600_000).toISOString(),
      expires_at: new Date(Date.now() + 28800_000).toISOString(),
      needs_reconnect: false,
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/kite/token-health`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof body.detail === "string" ? body.detail : "Token health check failed");
  }
  return res.json();
}

export async function getBrokerStatus(): Promise<{
  connected: boolean;
  broker: string | null;
  mode: string;
  status?: "plan_required" | "credentials_missing" | "not_connected" | "token_expired" | "connected_read_only";
  status_label?: string;
  plan?: string;
  plan_allows_broker?: boolean;
  has_api_key: boolean;
  has_token: boolean;
  token_expired: boolean;
  connected_at: string | null;
  token_expires_at: string | null;
  broker_user_name?: string | null;
  read_only?: boolean;
  can_import?: boolean;
  sync_status?: "idle" | "running" | "failed";
  last_synced_at?: string | null;
  live_order_requires_confirmation?: boolean;
  live_order_enabled?: boolean;
  read_only_smoke_checked_at?: string | null;
  read_only_smoke_fresh?: boolean;
  read_only_smoke_required?: boolean;
  read_only_smoke_passed?: boolean;
}> {
  if (shouldUseMockFallback()) {
    return cachedClientRequest("broker:status", 5_000, async () => {
      const sync = readLocalBrokerSync();
      return {
        connected: false,
        broker: "zerodha",
        mode: "simulated",
        status: "not_connected",
        status_label: "Mock broker import ready",
        plan: "pro",
        plan_allows_broker: true,
        has_api_key: true,
        has_token: false,
        token_expired: false,
        connected_at: null,
        token_expires_at: null,
        read_only: false,
        can_import: true,
        sync_status: "idle",
        last_synced_at: sync.last_synced_at,
        live_order_requires_confirmation: true,
        live_order_enabled: false,
      };
    });
  }
  return cachedClientRequest("broker:status", 20_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/broker/status`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Broker status is temporarily unavailable (${res.status}).`));
    }
    return res.json();
  });
}

let dataHealthCache: { value: DataHealth | null; expiresAt: number } | null = null;
let dataHealthPromise: Promise<DataHealth | null> | null = null;

export async function getDataHealth(): Promise<DataHealth | null> {
  if (shouldUseMockFallback()) {
    return {
      status: "healthy",
      latest_trade_date: "2026-04-24",
      hours_since_refresh: 1,
      symbols_on_latest_date: 500,
      universe_active: 500,
      coverage_pct: 99.2,
      mode: "demo",
      message: "Demo data is loaded from local mock fixtures.",
      indicators_missing: {
        rsi_14: 0,
        ema_200: 0,
      },
      last_run: {
        id: "mock-refresh",
        errors: 0,
      },
      last_successful_eod_date: "2026-04-24",
      provider: {
        source_name: "AlphaVyuh mock fixtures",
        mode: "demo",
        as_of: "2026-04-24",
        confidence: "demo",
        coverage_pct: 99.2,
        symbols_count: 500,
        universe_active: 500,
        license_notes: "Deterministic mock data for workflow QA, not market data.",
      },
      fallback_active: false,
      next_refresh_hint: "Mock data does not refresh automatically.",
    };
  }
  const now = Date.now();
  if (dataHealthCache && dataHealthCache.expiresAt > now) return dataHealthCache.value;
  if (dataHealthPromise) return dataHealthPromise;

  dataHealthPromise = (async () => {
    try {
      const res = await fetch(`${API}/api/v1/data/health`, { headers: await authHeaders() });
      if (!res.ok) {
        dataHealthCache = { value: null, expiresAt: Date.now() + 15_000 };
        return null;
      }
      const value = await res.json();
      dataHealthCache = { value, expiresAt: Date.now() + 60_000 };
      return value;
    } finally {
      dataHealthPromise = null;
    }
  })();

  return dataHealthPromise;
}

export async function getDataRuns(limit = 10): Promise<DataRun[]> {
  if (shouldUseMockFallback()) {
    return [
      {
        run_id: "mock-refresh",
        started_at: "2026-04-24T18:00:00Z",
        duration_s: 42,
        event_count: 3,
        error_count: 0,
      },
    ];
  }

  return cachedClientRequest(`data-runs:${limit}`, 30_000, async () => {
    const res = await fetch(`${API}/api/v1/data/runs?limit=${encodeURIComponent(String(limit))}`, { headers: await authHeaders() });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Data refresh run history is temporarily unavailable (${res.status}).`));
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Data refresh run history is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return Array.isArray(data?.runs) ? data.runs : [];
  });
}


export async function getAiPatterns(): Promise<AiPatterns> {
  if (shouldUseMockFallback()) {
    return {
      ready: true,
      total_trades: 24,
      trades_available: 24,
      min_trades_required: 10,
      avg_hold_winners: 8,
      avg_hold_losers: 4,
      coaching_cards: [
        { label: "Repeated mistakes", value: "3 noted", detail: "Late entries after range extension are hurting average R:R.", tone: "warn" },
        { label: "Best setup type", value: "Breakout", detail: "12 trades, 67% win rate, +₹58,400 P&L.", tone: "gain" },
        { label: "Worst behavior", value: "Monday", detail: "Monday entries have the weakest realised P&L in the sample.", tone: "loss" },
        { label: "Risk/reward discipline", value: "Avg 2.1:1", detail: "2 closed trades were below 2:1 planned R:R.", tone: "warn" },
        { label: "Holding time insight", value: "W 8d / L 4d", detail: "Winner and loser holding periods are not showing a major leak yet.", tone: "neutral" },
        { label: "Next improvement tip", value: "Process", detail: "Write the invalidation rule before moving an idea to Ready.", tone: "accent" },
      ],
      by_direction: [
        { direction: "long", trades: 18, wins: 12, win_rate: 66.7, total_pnl: 58400 },
        { direction: "short", trades: 6, wins: 3, win_rate: 50, total_pnl: 10020 },
      ],
    };
  }
  return cachedClientRequest("ai:patterns", 60_000, async () => {
    const headers = await authHeaders();
    const res = await withTimeout(fetch(`${API}/api/v1/ai/patterns`, { headers }), 3000);
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Trade pattern review is temporarily unavailable (${res.status}).`));
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Trade pattern review is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  });
}

export async function triggerTradeLesson(entryId: string): Promise<JournalEntry> {
  if (shouldUseMockFallback()) {
    const updated = updateLocalJournalEntry(entryId, {
      lessons: "Review completed: compare the exit with the original plan, keep risk fixed, and record one behavior to improve next time.",
    });
    if (!updated) throw new Error("Entry not found");
    return updated;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/${entryId}/lessons`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Trade lesson generation failed");
  }
  const updated = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return updated;
}

export async function placeOrder(order: PlaceOrderRequest): Promise<OrderResult> {
  if (shouldUseMockFallback()) {
    const intentKey = order.idempotency_key
      ?? globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const intentMarker = `[alphavyuh-order-intent:${intentKey}]`;
    const existing = readLocalJournalEntries().find((entry) => entry.entry_reason?.includes(intentMarker));
    if (existing) {
      const expectedTradeType = order.side === "buy" ? "long" : "short";
      const matchesExistingIntent =
        existing.symbol.toUpperCase() === order.symbol.trim().toUpperCase()
        && existing.trade_type === expectedTradeType
        && existing.quantity === order.quantity
        && Math.abs(existing.entry_price - order.price) < 0.005;
      if (!matchesExistingIntent) {
        throw new Error("This order intent key is already attached to a different order. Submit the changed order as a new intent.");
      }
      return {
        status: "deduplicated",
        message: "This order intent was already recorded. Reusing the existing Journal entry.",
        journal_id: existing.id,
        symbol: existing.symbol,
        side: order.side,
        quantity: existing.quantity,
        price: existing.entry_price,
        broker: "simulated",
        broker_order_id: null,
        execution_mode: "simulated",
        journal_status: existing.status,
        risk_reward: existing.risk_reward,
        next_actions: [
          "No second simulated order or Journal entry was created.",
          "Continue managing the existing trade from Journal or the chart.",
        ],
      };
    }
    const side = order.side === "buy" ? "long" : "short";
    const localWorkflow = readLocalWorkflowStates();
    const symbol = order.symbol.toUpperCase();
    const previousWorkflow = localWorkflow[symbol];
    const ideaContext = order.scanner_context ?? previousWorkflow?.scanner_context;
    const scannerContext: ScannerIdeaContext | null | undefined = order.chart_snapshot
      ? {
          source: ideaContext?.source ?? "scanner",
          ...(ideaContext ?? {}),
          chart_snapshot: order.chart_snapshot,
        }
      : ideaContext;
    const ideaParts = scannerContext
      ? [
          scannerContext.preset_name ? `Scanner: ${scannerContext.preset_name}` : "Scanner idea",
          scannerContext.setup_grade || scannerContext.setup_score != null
            ? `Score: ${[scannerContext.setup_grade, scannerContext.setup_score].filter((value) => value != null && value !== "").join(" ")}`
            : null,
          scannerContext.match_reasons?.[0] ? `Matched: ${scannerContext.match_reasons[0]}` : null,
          scannerContext.data_as_of ? `As of: ${scannerContext.data_as_of}` : null,
        ].filter(Boolean)
      : [];
    const reasonParts = [
      ...ideaParts,
      order.notes?.trim() || null,
      order.thesis?.trim() ? `Thesis: ${order.thesis.trim()}` : null,
      order.invalidation_rule?.trim() ? `Invalidation: ${order.invalidation_rule.trim()}` : null,
    ].filter(Boolean);
    const created = createLocalJournalEntry({
      symbol: order.symbol,
      setup_id: order.setup_id ?? previousWorkflow?.setup_id ?? null,
      trade_type: side,
      entry_date: new Date().toISOString().slice(0, 10),
      entry_price: order.price,
      quantity: order.quantity,
      setup_type: order.setup_type,
      stop_loss: order.stop_loss,
      target_price: order.target_price,
      entry_reason: `${reasonParts.length ? reasonParts.join(" | ") : `${order.side.toUpperCase()} mock order`} [Simulated · ${order.source_page ?? "chart"}${order.source_context ? ` · ${order.source_context}` : ""}] ${intentMarker}`,
      source_page: order.source_page ?? "chart",
      source_context: order.source_context ?? null,
      scanner_context: scannerContext ?? null,
      thesis: order.thesis ?? previousWorkflow?.thesis ?? null,
      invalidation_rule: order.invalidation_rule ?? previousWorkflow?.invalidation_rule ?? null,
    });
    writeLocalJournalEntries([created, ...readLocalJournalEntries()]);
    writeLocalWorkflowStates({
      ...localWorkflow,
      [symbol]: {
        ...(previousWorkflow ?? { symbol, lifecycle: "open" as WorkflowLifecycle }),
        symbol,
        setup_id: order.setup_id ?? previousWorkflow?.setup_id ?? null,
        lifecycle: "open",
        source: order.source_page ?? "chart",
        entry: order.price,
        stop: order.stop_loss ?? previousWorkflow?.stop ?? null,
        target: order.target_price ?? previousWorkflow?.target ?? null,
        position_size: order.quantity,
        setup_type: order.setup_type ?? previousWorkflow?.setup_type ?? null,
        notes: order.notes ?? previousWorkflow?.notes ?? null,
        thesis: order.thesis ?? previousWorkflow?.thesis ?? null,
        invalidation_rule: order.invalidation_rule ?? previousWorkflow?.invalidation_rule ?? null,
        scanner_context: scannerContext ?? null,
        journal_id: created.id,
        updated_at: new Date().toISOString(),
      },
    });
    invalidateClientCache(["journal:", "portfolio"]);
    return {
      status: "filled",
      message: `${order.side.toUpperCase()} ${order.quantity} x ${symbol} @ ₹${order.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })} - recorded in Journal`,
      journal_id: created.id,
      symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      broker: "simulated",
      broker_order_id: null,
      execution_mode: "simulated",
      journal_status: "open",
      risk_reward: created.risk_reward,
      next_actions: [
        "Simulated execution used in mock mode.",
        "Journal draft created with setup, stop, target, and source context.",
      ],
    };
  }
  const headers = await authHeaders();
  const idempotencyKey = order.idempotency_key ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await fetch(`${API}/api/v1/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...order, idempotency_key: idempotencyKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Order failed (${res.status})`);
  }
  const result = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return result;
}

export async function reconcileBrokerOrder(brokerOrderId: string): Promise<BrokerOrderReconciliation> {
  if (shouldUseMockFallback()) {
    throw new Error("Simulated orders do not require broker reconciliation.");
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/orders/reconcile/${encodeURIComponent(brokerOrderId)}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Order reconciliation failed (${res.status}).`));
  }
  return res.json();
}

export async function getBrokerOrderActivity(limit = 25): Promise<BrokerOrderActivityResponse> {
  if (shouldUseMockFallback()) return { orders: [], count: 0 };
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/orders/activity?limit=${limit}`, { headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Broker activity failed (${res.status}).`));
  }
  return res.json();
}

// ── Live candles (Yahoo Finance, no DB) ──────────────────────────────────────

export async function getCandlesLive(
  symbol: string,
  params?: { limit?: number; timeframe?: string }
): Promise<CandlesResponse> {
  if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.timeframe) qs.set("timeframe", params.timeframe);
  try {
    const res = await fetch(`${API}/api/v1/charts/${symbol}/candles-live?${qs}`, { headers: publicHeaders });
    if (!res.ok) {
      if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
      throw new Error(`No live data for ${symbol}`);
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Live chart data is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  } catch (error) {
    if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
    throw error;
  }
}

// ── Price alerts ─────────────────────────────────────────────────────────────


const mockPriceAlertsKey = "alphavyuh-mock-price-alerts-v1";

function readMockPriceAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return mockPriceAlerts();
  try {
    const raw = window.localStorage.getItem(mockPriceAlertsKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : mockPriceAlerts();
  } catch {
    return mockPriceAlerts();
  }
}

function writeMockPriceAlerts(alerts: PriceAlert[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mockPriceAlertsKey, JSON.stringify(alerts));
}

export async function getPriceAlerts(): Promise<PriceAlert[]> {
  if (shouldUseMockFallback()) return readMockPriceAlerts();
  return cachedClientRequest("price-alerts", 20_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/price-alerts`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Price alerts are temporarily unavailable (${res.status}).`));
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Price alerts are temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    if (!Array.isArray(data.alerts)) throw new Error("Price alerts are temporarily unavailable.");
    return data.alerts;
  });
}

export async function createPriceAlert(
  payload: { symbol: string; condition: "above" | "below"; target_price: number; note?: string }
): Promise<PriceAlert> {
  if (shouldUseMockFallback()) {
    const alert: PriceAlert = {
      id: `mock-price-alert-${Date.now()}`,
      symbol: payload.symbol.toUpperCase(),
      condition: payload.condition,
      target_price: Number(payload.target_price.toFixed(2)),
      note: payload.note?.trim() ? payload.note.trim() : null,
      is_active: true,
      triggered_at: null,
      created_at: new Date().toISOString(),
    };
    writeMockPriceAlerts([alert, ...readMockPriceAlerts()]);
    return alert;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/price-alerts`, {
    method: "POST", headers, body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(b.detail ?? "Failed to create alert");
  }
  const created = await res.json();
  invalidateClientCache(["price-alerts"]);
  return created;
}

export async function deletePriceAlert(id: string): Promise<void> {
  if (shouldUseMockFallback()) {
    writeMockPriceAlerts(readMockPriceAlerts().filter((alert) => alert.id !== id));
    return;
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/price-alerts/${id}`, { method: "DELETE", headers });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Price alerts are temporarily unavailable (${res.status}).`));
  }
  invalidateClientCache(["price-alerts"]);
}

// ── Portfolio ─────────────────────────────────────────────────────────────────



export async function getPortfolio(): Promise<PortfolioResponse> {
  if (shouldUseMockFallback()) return mockPortfolio();
  return cachedClientRequest("portfolio", 20_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal/portfolio`, { headers });
    if (!res.ok) {
      throw new Error(await responseErrorMessage(res, `Portfolio is temporarily unavailable (${res.status}).`));
    }
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Portfolio is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    if (!Array.isArray(data.positions) || !data.summary || !Array.isArray(data.sectors)) {
      throw new Error("Portfolio is temporarily unavailable.");
    }
    return data;
  });
}

// ── Backtest ──────────────────────────────────────────────────────────────────



export async function runBacktest(
  filters: ScanFilters,
  days = 30,
): Promise<BacktestResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/backtest/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters, days }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Backtest failed (${res.status})`);
  }
  return res.json();
}

// ── Referral ──────────────────────────────────────────────────────────────────

export async function getReferralCode(): Promise<{ referral_code: string; referral_url: string }> {
  if (shouldUseMockFallback()) {
    return {
      referral_code: "DEMOALPHA",
      referral_url: "https://alphavyuh.com/signup?ref=DEMOALPHA",
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/referral-code`, { headers });
  if (!res.ok) throw new Error("Failed to get referral code");
  return res.json();
}

export async function applyReferral(code: string): Promise<{ status: string; message: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/referral/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ referral_code: code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Failed to apply referral");
  }
  return res.json();
}

// ── Community shared screens ──────────────────────────────────────────────────


const mockSharedScreens: SharedScreen[] = [
  {
    id: "mock-screen-volume-leaders",
    user_id: "demo-trader-01",
    screen_id: "mock-vcp-leaders",
    title: "Volume leaders holding above EMA 20",
    description: "A demo community screen for finding liquid swing candidates with constructive breadth.",
    tags: ["Demo", "Swing", "Volume"],
    upvotes: 42,
    is_featured: true,
    created_at: "2026-04-24T09:30:00.000Z",
  },
  {
    id: "mock-screen-pullback",
    user_id: "demo-trader-02",
    screen_id: "mock-pullback-quality",
    title: "Quality pullbacks near prior breakout zones",
    description: "Uses mock market fixtures. Treat as workflow guidance, not live market advice.",
    tags: ["Demo", "Pullback"],
    upvotes: 28,
    is_featured: false,
    created_at: "2026-04-22T09:30:00.000Z",
  },
];

export async function getSharedScreens(limit = 20): Promise<SharedScreen[]> {
  if (shouldUseMockFallback()) return mockSharedScreens.slice(0, limit);
  const res = await fetch(`${API}/api/v1/community/screens?limit=${limit}`, { headers: publicHeaders });
  if (!res.ok) {
    throw new Error(await responseErrorMessage(res, `Community screens are temporarily unavailable (${res.status}).`));
  }
  const data = await res.json();
  const unavailableMessage = unavailablePayloadMessage(data, "Community screens are temporarily unavailable.");
  if (unavailableMessage) throw new Error(unavailableMessage);
  const screens = Array.isArray(data) ? data : data?.screens;
  if (!Array.isArray(screens)) {
    throw new Error("Community screens are temporarily unavailable.");
  }
  return screens;
}

export async function shareScreen(screenId: string, title: string, description?: string, tags?: string[]): Promise<SharedScreen> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/community/screens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ screen_id: screenId, title, description, tags: tags ?? [] }),
  });
  if (!res.ok) throw new Error("Failed to share screen");
  return res.json();
}

export async function upvoteScreen(sharedScreenId: string): Promise<{ upvotes: number }> {
  if (shouldUseMockFallback()) {
    const screen = mockSharedScreens.find((item) => item.id === sharedScreenId);
    return { upvotes: (screen?.upvotes ?? 0) + 1 };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/community/screens/${sharedScreenId}/upvote`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Upvote failed");
  return res.json();
}

// ── Annual plan helpers ───────────────────────────────────────────────────────

export async function createPaymentOrderFull(
  plan: "pro" | "elite",
  currency: "INR" | "USD" = "INR",
  billing: "monthly" | "annual" = "monthly",
): Promise<{ order_id: string; amount: number; currency: string; plan: string; billing: string; label: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/create-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan, currency, billing }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

// ── Market overview ───────────────────────────────────────────────────────────

function numberOr(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMarketOverview(raw: Partial<MarketOverview> | null | undefined): MarketOverview {
  const data = raw ?? {};
  return {
    trade_date: data.trade_date ?? null,
    advances: numberOr(data.advances),
    declines: numberOr(data.declines),
    unchanged: numberOr(data.unchanged),
    total: numberOr(data.total),
    advance_decline_ratio: numberOr(data.advance_decline_ratio),
    new_52w_highs: numberOr(data.new_52w_highs),
    new_52w_lows: numberOr(data.new_52w_lows),
    above_ema20_pct: numberOr(data.above_ema20_pct),
    above_ema50_pct: numberOr(data.above_ema50_pct),
    above_ema200_pct: numberOr(data.above_ema200_pct),
    ema_breadth_by_period: data.ema_breadth_by_period ?? undefined,
    ema_breadth_daily_history: Array.isArray(data.ema_breadth_daily_history)
      ? data.ema_breadth_daily_history.map((row) => ({
          trade_date: String(row.trade_date),
          ema20: numberOr(row.ema20),
          ema50: numberOr(row.ema50),
          ema200: numberOr(row.ema200),
        }))
      : undefined,
    ema_breadth_lookback: data.ema_breadth_lookback && typeof data.ema_breadth_lookback === "object"
      ? Object.fromEntries(
          Object.entries(data.ema_breadth_lookback).map(([key, rows]) => [
            key,
            Array.isArray(rows)
              ? rows.map((row) => ({
                  trade_date: String(row.trade_date),
                  ema20: numberOr(row.ema20),
                  ema50: numberOr(row.ema50),
                  ema200: numberOr(row.ema200),
                }))
              : [],
          ]),
        )
      : undefined,
    highs_lows_by_period: data.highs_lows_by_period ?? undefined,
    market_phase: data.market_phase ?? "Pending",
    market_phase_desc: data.market_phase_desc ?? "Market breadth will appear after the latest complete trading day is available.",
    indices: Array.isArray(data.indices) ? data.indices.map((idx) => ({
      ...idx,
      close: idx.close == null ? null : numberOr(idx.close, NaN),
      pct_change: idx.pct_change == null ? null : numberOr(idx.pct_change, NaN),
      prev_close: idx.prev_close == null ? null : numberOr(idx.prev_close, NaN),
    })).map((idx) => ({
      ...idx,
      close: Number.isFinite(idx.close) ? idx.close : null,
      pct_change: Number.isFinite(idx.pct_change) ? idx.pct_change : null,
      prev_close: Number.isFinite(idx.prev_close) ? idx.prev_close : null,
    })) : [],
    top_sectors: Array.isArray(data.top_sectors) ? data.top_sectors : [],
    market_data_source: data.market_data_source,
    is_live: Boolean(data.is_live),
    sector_breadth_basis: data.sector_breadth_basis ?? "latest_complete_session",
    sector_breadth_source: data.sector_breadth_source ?? "daily_ohlcv",
    sector_breadth: Array.isArray(data.sector_breadth) ? data.sector_breadth : [],
    top_gainers: Array.isArray(data.top_gainers) ? data.top_gainers : [],
    top_losers: Array.isArray(data.top_losers) ? data.top_losers : [],
    most_active: Array.isArray(data.most_active) ? data.most_active : [],
    as_of: data.as_of ?? data.trade_date ?? null,
    generated_at: data.generated_at ?? null,
    cache_status: data.cache_status,
    source_metadata: data.source_metadata ?? data.provider,
    provider: data.provider,
  };
}

let marketOverviewCache: { value: MarketOverview; expiresAt: number } | null = null;
let marketOverviewPromise: Promise<MarketOverview> | null = null;

export async function getMarketOverview(): Promise<MarketOverview> {
  if (shouldUseMockFallback()) return mockMarketOverview();
  const now = Date.now();
  if (marketOverviewCache && marketOverviewCache.expiresAt > now) return marketOverviewCache.value;
  if (marketOverviewPromise) return marketOverviewPromise;

  marketOverviewPromise = (async () => {
    const headers = await authHeaders();
    // Try new comprehensive endpoint first; fall back to legacy summary if not deployed yet
    const res = await withTimeout(fetch(`${API}/api/v1/market/overview`, { headers }), 2500).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const unavailableMessage = unavailablePayloadMessage(data, "Market overview is temporarily unavailable.");
      if (unavailableMessage) throw new Error(unavailableMessage);
      const value = normalizeMarketOverview(data);
      marketOverviewCache = { value, expiresAt: Date.now() + 180_000 };
      return value;
    }

    // Legacy fallback: compose from public endpoints so dashboard still renders
    // sector and EMA breadth if the authenticated overview endpoint is blocked.
    const legacyRes = await fetch(`${API}/api/v1/market/summary`, { headers });
    if (!legacyRes.ok) throw new Error("Failed to fetch market overview");
    const s: MarketSummary = await legacyRes.json();
    const unavailableMessage = unavailablePayloadMessage(s, "Market summary is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    const [sectorRes, moversRes] = await Promise.all([
      getSectorBreadth(),
      getMarketMovers(),
    ]);

    const total = s.total_stocks ?? (s.advances + s.declines + s.unchanged);
    const ema200 = s.above_ema200_pct ?? 0;
    const phase = ema200 >= 60 ? "Bullish" : ema200 <= 40 ? "Bearish" : "Neutral";
    const phaseDesc = ema200 >= 60
      ? `Strong breadth — ${s.above_ema20_pct ?? "?"}% above EMA 20`
      : ema200 <= 40
        ? `Weak breadth — only ${ema200}% above EMA 200`
        : `Mixed market — ${ema200}% above EMA 200`;

    const value = normalizeMarketOverview({
      trade_date: s.trade_date,
      advances: s.advances,
      declines: s.declines,
      unchanged: s.unchanged,
      total,
      advance_decline_ratio: s.advance_decline_ratio ?? 0,
      new_52w_highs: s.new_52w_highs,
      new_52w_lows: s.new_52w_lows,
      above_ema20_pct: s.above_ema20_pct ?? 0,
      above_ema50_pct: s.above_ema50_pct ?? 0,
      above_ema200_pct: ema200,
      market_phase: phase,
      market_phase_desc: phaseDesc,
      sector_breadth: (sectorRes?.sectors ?? []).map((sector) => ({
        sector: sector.sector,
        total: sector.total,
        advances: sector.advances,
        declines: sector.declines,
        avg_pct_change: 0,
        breadth_pct: sector.total ? Number(((sector.advances / sector.total) * 100).toFixed(1)) : 0,
      })),
      top_sectors: (sectorRes?.sectors ?? []).slice(0, 5).map((sector) => ({
        sector: sector.sector,
        total: sector.total,
        advances: sector.advances,
        declines: sector.declines,
        avg_pct_change: 0,
        breadth_pct: sector.total ? Number(((sector.advances / sector.total) * 100).toFixed(1)) : 0,
      })),
      top_gainers: moversRes?.gainers ?? [],
      top_losers: moversRes?.losers ?? [],
      most_active: moversRes?.volume_surge ?? [],
    });
    marketOverviewCache = { value, expiresAt: Date.now() + 180_000 };
    return value;
  })().finally(() => {
    marketOverviewPromise = null;
  });

  return marketOverviewPromise;
}


export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  return cachedClientRequest("market-snapshot", 30_000, async () => {
    const overview = await getMarketOverview();
    const health = await withTimeout(getDataHealth(), 600).catch(() => null);
    return {
      overview,
      health,
      asOf: overview.source_metadata?.as_of ?? overview.as_of ?? overview.trade_date ?? health?.latest_trade_date ?? null,
      mode: overview.source_metadata?.mode ?? (overview.is_live ? "live" : health?.mode ?? "eod"),
      source: overview.source_metadata?.source_name ?? overview.market_data_source ?? "AlphaVyuh market snapshot",
      generatedAt: overview.generated_at ?? new Date().toISOString(),
      cacheStatus: overview.cache_status ?? "client",
    };
  });
}

export function warmCoreMarketData() {
  void getMarketSnapshot().catch(() => null);
  void getWatchlists({ lite: true }).catch(() => null);
}

export function warmSecondaryWorkflowData() {
  void getJournalEntries({ limit: 75 }).catch(() => null);
  void getJournalStats().catch(() => null);
  void getBrokerStatus().catch(() => null);
  void getPlanStatus().catch(() => null);
  void getPriceAlerts().catch(() => null);
  void getPortfolio().catch(() => null);
}


export async function getAdminWaitlist(): Promise<WaitlistLead[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/waitlist/admin`, { headers });
  if (!res.ok) throw new Error("Admin access queue unavailable");
  const data = await res.json();
  return data.waitlist ?? [];
}

export async function createInviteCode(payload: { email?: string; max_uses?: number; plan?: string }): Promise<{ code: string; email?: string | null; max_uses: number; uses: number; plan: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/invite-codes`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not create invite code");
  return res.json();
}


export async function createFeedbackReport(payload: {
  category?: FeedbackReport["category"];
  page?: string | null;
  symbol?: string | null;
  severity?: FeedbackReport["severity"];
  message: string;
  context?: Record<string, unknown>;
}): Promise<FeedbackReport> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not send feedback");
  const data = await res.json();
  return data.feedback;
}

export async function getAdminFeedback(): Promise<FeedbackReport[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback/admin`, { headers });
  if (!res.ok) throw new Error("Admin feedback unavailable");
  const data = await res.json();
  return data.feedback ?? [];
}

export async function updateAdminFeedbackStatus(id: string, status: FeedbackReport["status"]): Promise<FeedbackReport> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback/admin/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Could not update feedback");
  const data = await res.json();
  return data.feedback;
}

// ── Scanner presets ───────────────────────────────────────────────────────────

export async function getScannerPresets(): Promise<ScanPreset[]> {
  const res = await fetch(`${API}/api/v1/scanner/presets`);
  if (!res.ok) return [];
  return res.json();
}

export async function runScanner(filters: Record<string, unknown>, sort_by = "volume_ratio", sort_order = "desc"): Promise<{ trade_date: string | null; total_matches: number; plan: string; results: ScanResult[] }> {
  if (shouldUseMockFallback()) {
    const data = mockRunScan();
    return {
      trade_date: data.trade_date,
      total_matches: data.total_matches,
      plan: data.plan ?? "mock",
      results: data.results,
    };
  }
  const requestBody = { filters, sort_by, sort_order };
  return cachedClientRequest(`scanner:run:${stableCacheKey(requestBody)}`, 5_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/scanner/run`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) throw new Error(await responseErrorMessage(res, `Scanner failed (${res.status}).`));
    const data = await res.json();
    const unavailableMessage = unavailablePayloadMessage(data, "Scanner data is temporarily unavailable.");
    if (unavailableMessage) throw new Error(unavailableMessage);
    return data;
  });
}

// ─── Adapter-backed broker routes (/api/brokers/*) ───────────────────────────

export async function startBrokerConnect(broker: string): Promise<{ auth_url: string; state: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/connect/start`, { method: "POST", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message ?? err.detail ?? "Failed to start broker connect");
  }
  return res.json();
}

export async function getBrokerProfile(broker: string): Promise<BrokerProfile> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/profile`, { headers });
  if (!res.ok) throw new Error("Failed to fetch broker profile");
  return res.json();
}

export async function getBrokerHoldings(broker: string): Promise<BrokerHolding[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/holdings`, { headers });
  if (!res.ok) throw new Error("Failed to fetch broker holdings");
  return res.json();
}

export async function disconnectBroker(broker: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/disconnect`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Failed to disconnect broker");
}
