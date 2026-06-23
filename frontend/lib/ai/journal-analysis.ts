import { authHeaders, API, shouldUseMockFallback } from "@/lib/api";

export interface DeepAnalysis {
  winning_setups: string[];
  mistake_patterns: string[];
  sizing_behaviour: string[];
  trades_analysed: number;
  disclaimer: string;
}

const MOCK_ANALYSIS: DeepAnalysis = {
  winning_setups: [
    "VCP setups held 4–8 days produced the highest average R-multiple (+2.3R across 6 trades).",
    "Breakout entries on above-average volume preceded 4 of the 5 largest winners.",
  ],
  mistake_patterns: [
    "3 trades were exited below the planned stop loss, increasing realised loss beyond the planned risk.",
    "Untagged trades had a 28% win rate vs. 58% for tagged setups — missing setup labels correlated with worse outcomes.",
  ],
  sizing_behaviour: [
    "Position sizes ranged from 2% to 9% of estimated capital — the two largest losses came from positions above 7%.",
    "Winners and losers had similar average position sizes, suggesting sizing was not correlated with conviction or setup quality.",
  ],
  trades_analysed: 24,
  disclaimer: "Mock analysis for local demo mode.",
};

export async function fetchDeepAnalysis(): Promise<DeepAnalysis> {
  if (shouldUseMockFallback()) return MOCK_ANALYSIS;

  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/ai/deep-analysis`, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof body.detail === "string" ? body.detail : "Deep analysis failed");
  }

  return res.json();
}
