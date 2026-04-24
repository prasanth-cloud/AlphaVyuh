import { NextResponse } from "next/server";
import { normalizeRegion } from "@/lib/market/region";
import { fetchIndices } from "@/lib/market/service";

export const revalidate = 60;

export async function GET(_: Request, { params }: { params: { region: string } }) {
  const region = normalizeRegion(params.region);
  return NextResponse.json(await fetchIndices(region));
}
