"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getChartWorkspace, saveChartWorkspace } from "@/lib/api";
import { defaultIndicators, normalizeIndicators } from "../indicators";
import type { ChartIndicator, ChartWorkspace, WorkspaceDrawing } from "../types";

type State = {
  indicators: ChartIndicator[];
  drawings: WorkspaceDrawing[];
  loading: boolean;
};

export function useChartWorkspace(symbol: string, timeframe: string) {
  const [state, setState] = useState<State>({ indicators: defaultIndicators, drawings: [], loading: true });
  const loadedKeyRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = useMemo(() => `${symbol.toUpperCase()}:${timeframe}`, [symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    getChartWorkspace(symbol, timeframe)
      .then((workspace) => {
        if (cancelled) return;
        loadedKeyRef.current = key;
        setState({
          indicators: normalizeIndicators(workspace.indicators),
          drawings: Array.isArray(workspace.drawings) ? workspace.drawings as WorkspaceDrawing[] : [],
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ indicators: defaultIndicators, drawings: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key, symbol, timeframe]);

  function scheduleSave(next: Pick<ChartWorkspace, "indicators" | "drawings">) {
    if (loadedKeyRef.current !== key) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChartWorkspace(symbol, { timeframe, indicators: next.indicators, drawings: next.drawings }).catch(() => {});
    }, 800);
  }

  function setIndicators(indicators: ChartIndicator[]) {
    setState((current) => {
      const next = { ...current, indicators };
      scheduleSave(next);
      return next;
    });
  }

  function setDrawings(drawings: WorkspaceDrawing[]) {
    setState((current) => {
      const next = { ...current, drawings };
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
    setIndicators,
    setDrawings,
  };
}
