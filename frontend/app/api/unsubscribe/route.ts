import { NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || token.length < 16) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }

  const backendUrl = `${API_URL}/api/v1/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const res = await fetch(backendUrl);
  const html = await res.text();

  return new NextResponse(html, {
    status: res.status,
    headers: { "Content-Type": "text/html" },
  });
}
