import { createServerSupabaseClient } from "@/lib/supabase/server";
import ChartPage from "./ChartPageClient";
import type { InitialCandle } from "./ChartPageClient";

export default async function ChartPageServer({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  let initialCandles: InitialCandle[] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("daily_ohlcv")
      .select("trade_date, open, high, low, close, volume")
      .eq("symbol", symbol.toUpperCase())
      .order("trade_date", { ascending: true })
      .limit(365);

    if (data) {
      initialCandles = data.map((row) => ({
        time: row.trade_date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));
    }
  } catch {
    // SSR prefetch is best-effort; client will fetch on mount if empty
  }

  return <ChartPage params={params} initialCandles={initialCandles} />;
}
