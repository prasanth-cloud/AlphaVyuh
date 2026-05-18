import { apiUrl } from "./api-base";
import type { ApiReachability } from "./data-mode";
import { allowClientMockFallback } from "./runtime-mode";

export function isRailwayFallbackResponse(status: number, body: string) {
  return status === 404 && body.toLowerCase().includes("application not found");
}

export async function checkApiReachability(timeoutMs = 900): Promise<ApiReachability> {
  if (allowClientMockFallback()) {
    return "ok";
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl("/health"), {
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    if (!response.ok || isRailwayFallbackResponse(response.status, text)) {
      return "down";
    }
    return "ok";
  } catch {
    return "down";
  } finally {
    window.clearTimeout(timeout);
  }
}
