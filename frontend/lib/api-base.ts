const DEFAULT_LOCAL_API_BASE = "http://localhost:8000";

function stripWrappingQuotes(value: string): string {
  let next = value.trim();
  while (
    next.length >= 2 &&
    ((next.startsWith('"') && next.endsWith('"')) ||
      (next.startsWith("'") && next.endsWith("'")) ||
      (next.startsWith("`") && next.endsWith("`")))
  ) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

export function normalizeApiBaseUrl(raw?: string | null, fallback = DEFAULT_LOCAL_API_BASE): string {
  const cleaned = stripWrappingQuotes(String(raw ?? ""))
    .replace(/\\+[rnt]/g, "")
    .replace(/[\r\n\t]/g, "")
    .trim()
    .replace(/\\+$/g, "")
    .replace(/\/+$/, "");

  if (["same-origin", "self", "."].includes(cleaned.toLowerCase())) return "";

  return cleaned || fallback;
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
