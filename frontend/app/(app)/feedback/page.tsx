"use client";

import { useState } from "react";
import { Brain, TrendingUp, AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import { fetchDeepAnalysis, type DeepAnalysis } from "@/lib/ai/journal-analysis";

const SECTIONS: { key: keyof Pick<DeepAnalysis, "winning_setups" | "mistake_patterns" | "sizing_behaviour">; title: string; icon: typeof Brain }[] = [
  { key: "winning_setups", title: "Winning Setups", icon: TrendingUp },
  { key: "mistake_patterns", title: "Mistake Patterns", icon: AlertTriangle },
  { key: "sizing_behaviour", title: "Sizing Behaviour", icon: BarChart3 },
];

export default function FeedbackPage() {
  const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDeepAnalysis();
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Brain size={20} className="text-ds-t3" />
        <h1 className="text-lg font-semibold text-ds-t1">Trade Feedback</h1>
      </div>

      {!analysis && !loading && (
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-6 text-center">
          <p className="text-ds-t2 text-sm mb-4">
            Analyse your last 30 closed trades for patterns across winning setups, recurring mistakes, and position sizing behaviour.
          </p>
          <button
            onClick={runAnalysis}
            className="px-4 py-2 rounded-ds-md bg-ds-accent text-white text-sm font-medium"
            data-testid="feedback-run-analysis"
          >
            Run deep analysis
          </button>
          {error && <p className="text-ds-loss text-xs mt-3">{error}</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-ds-t3 text-sm" data-testid="feedback-loading">
          <Loader2 size={16} className="animate-spin" />
          Analysing trades…
        </div>
      )}

      {analysis && (
        <div className="space-y-5" data-testid="feedback-results">
          <p className="text-xs text-ds-t3">
            {analysis.trades_analysed} trades analysed · {analysis.disclaimer}
          </p>

          {SECTIONS.map(({ key, title, icon: Icon }) => (
            <section
              key={key}
              className="bg-ds-surface border border-ds-border rounded-ds-lg p-4"
              data-testid={`feedback-section-${key}`}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ds-t1 mb-3">
                <Icon size={14} className="text-ds-t3" />
                {title}
              </h2>
              <ul className="space-y-2">
                {(analysis[key] ?? []).length === 0 && (
                  <li className="text-xs text-ds-t3">Insufficient data for pattern detection.</li>
                )}
                {(analysis[key] ?? []).map((obs, i) => (
                  <li key={i} className="text-sm text-ds-t2 leading-relaxed">
                    <span className="text-ds-t3 mr-1.5">•</span>
                    {obs}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <button
            onClick={runAnalysis}
            className="text-xs text-ds-accent hover:underline"
            data-testid="feedback-rerun"
          >
            Re-run analysis
          </button>
        </div>
      )}
    </div>
  );
}
