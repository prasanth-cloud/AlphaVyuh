"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getChartWorkspace, saveChartWorkspace } from "@/lib/api";
import { defaultIndicators, normalizeIndicators } from "../indicators";
import type { ChartIndicator, ChartWorkspace, WorkspaceDrawing } from "../types";

type State = {
  indicators: ChartIndicator[];
  drawings: WorkspaceDrawing[];
  loading: boolean;
  error: string | null;
  saveError: string | null;
};

export function useChartWorkspace(symbol: string, timeframe: string) {
  const [state, setState] = useState<State>({ indicators: defaultIndicators, drawings: [], loading: true, error: null, saveError: null });
  const loadedKeyRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = useMemo(() => `${symbol.toUpperCase()}:${timeframe}`, [symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    getChartWorkspace(symbol, timeframe)
      .then((workspace) => {
        if (cancelled) return;
        loadedKeyRef.current = key;
        setState({
          indicators: normalizeIndicators(workspace.indicators),
          drawings: Array.isArray(workspace.drawings) ? workspace.drawings as WorkspaceDrawing[] : [],
          loading: false,
          error: null,
          saveError: null,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Chart workspace is temporarily unavailable.",
            saveError: null,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, symbol, timeframe]);

  function scheduleSave(next: Pick<ChartWorkspace, "indicators" | "drawings">) {
    if (loadedKeyRef.current !== key) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChartWorkspace(symbol, { timeframe, indicators: next.indicators, drawings: next.drawings }, { throwOnFailure: true })
        .then(() => {
          setState((current) => ({ ...current, saveError: null }));
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : "Chart workspace changes could not sync.";
          setState((current) => ({
            ...current,
            saveError: `Chart workspace changes are saved locally but not synced. ${detail}`,
          }));
        });
    }, 800);
  }

  function setIndicators(indicators: ChartIndicator[]) {
    setState((current) => {
      const next = { ...current, indicators, saveError: null };
      scheduleSave(next);
      return next;
    });
  }

  function setDrawings(drawings: WorkspaceDrawing[]) {
    setState((current) => {
      const next = { ...current, drawings, saveError: null };
      scheduleSave(next);
      return next;
    });
  }

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  return {
    indicators: state.indicators,
    drawings: state.drawings,
    loading: state.loading,
    error: state.error,
    saveError: state.saveError,
    setIndicators,
    setDrawings,
  };
}
