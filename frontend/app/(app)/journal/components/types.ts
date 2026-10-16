// Re-export shared journal types from the API layer for use across components.
export type {
  JournalEntry,
  JournalStats,
  JournalAnalytics,
  CreateJournalEntry,
  UpdateJournalEntry,
  SymbolSearchResult,
  AiPatterns,
  JournalWeeklyReviewResponse,
} from "@/lib/api";

export type PanelMode = "add" | "close" | "view" | null;
export type Tab = "queue" | "weekly" | "ai" | "analytics" | "trades";
