import { apiUrl } from "./api-base";
import type { ApiReachability } from "./data-mode";
import { allowClientMockFallback } from "./runtime-mode";

export function isRailwayFallbackResponse(status: number, body: string) {
  return status === 404 && body.toLowerCase().includes("application not found");
}

async function probeBackend(signal?: AbortSignal): Promise<ApiReachability> {
  try {
    const response = await fetch(apiUrl("/health"), { cache: "no-store", signal });
    const text = await response.text().catch(() => "");
    if (response.ok && !isRailwayFallbackResponse(response.status, text)) {
      return "ok";
    }

    const apiResponse = await fetch(apiUrl("/api/v1/data/health"), { cache: "no-store", signal });
    const apiText = await apiResponse.text().catch(() => "");
    if (apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.ok) {
      return "ok";
    }
    if (isRailwayFallbackResponse(response.status, text) || isRailwayFallbackResponse(apiResponse.status, apiText)) {
      return "down";
    }
    return response.ok || apiResponse.ok ? "ok" : "unknown";
  } catch {
    try {
      const apiResponse = await fetch(apiUrl("/api/v1/data/health"), { cache: "no-store" });
      if (apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.ok) {
        return "ok";
      }
      const apiText = await apiResponse.text().catch(() => "");
      if (isRailwayFallbackResponse(apiResponse.status, apiText)) {
        return "down";
      }
    } catch {
      // Fall through to down.
    }
    return "down";
  }
}

export async function checkApiReachability(timeoutMs = 1800): Promise<ApiReachability> {
  if (allowClientMockFallback()) {
    return "ok";
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await probeBackend(controller.signal);
  } finally {
    window.clearTimeout(timeout);
  }
}
