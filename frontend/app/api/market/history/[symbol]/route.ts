import { NextResponse } from "next/server";
import { fetchHistory } from "@/lib/market/service";

export const revalidate = 60;

export async function GET(_: Request, { params }: { params: { symbol: string } }) {
  return NextResponse.json(await fetchHistory(params.symbol));
}
