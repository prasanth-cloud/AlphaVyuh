// Re-export shared journal types from the API layer for use across components.
import type { TradeReview } from "@/lib/api";

export type {
  JournalEntry,
  JournalStats,
  JournalAnalytics,
  JournalAnalyticsCohortRow,
  JournalAnalyticsRange,
  CreateJournalEntry,
  UpdateJournalEntry,
  TradeReview,
  SymbolSearchResult,
  AiPatterns,
} from "@/lib/api";

export type PanelMode = "add" | "close" | "view" | null;
export type Tab = "queue" | "ai" | "analytics" | "trades";

export type ReviewSaveInput = {
  plan_adherence: TradeReview["plan_adherence"];
  follow_up: string | null;
};
