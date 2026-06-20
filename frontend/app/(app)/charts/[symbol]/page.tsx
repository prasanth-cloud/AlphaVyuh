import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CandleBar } from "@/lib/api/types";
import ChartPageClient from "./ChartPageClient";

async function fetchDailyCandles(symbol: string): Promise<CandleBar[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("daily_ohlcv")
      .select("trade_date,open,high,low,close,volume,ema_20,ema_50,ema_200")
      .eq("symbol", symbol.toUpperCase())
      .order("trade_date", { ascending: true })
      .limit(1250);

    if (error || !data) return [];

    return data.map((row) => ({
      time: row.trade_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      ema_20: row.ema_20,
      ema_50: row.ema_50,
      ema_200: row.ema_200,
    }));
  } catch {
    return [];
  }
}

export default async function ChartPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const initialCandles = await fetchDailyCandles(symbol);

  return <ChartPageClient symbol={symbol} initialCandles={initialCandles} />;
}
