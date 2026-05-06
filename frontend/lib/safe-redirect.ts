/**
 * Returns true only for same-origin relative paths.
 * Rejects protocol-relative (//evil.com), backslash variants (/\evil),
 * and anything with a scheme (https:, javascript:, etc.).
 *
 * Test vectors that must return false:
 *   //evil.com  /\evil.com  https://evil.com  javascript:alert(1)  null  ""
 */
export function isSafeRedirect(next: string | null | undefined): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.startsWith("/\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(next)) return false;

  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return false;
  }

  if (decoded.startsWith("//")) return false;
  if (decoded.startsWith("/\\")) return false;
  if (decoded.includes("\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return false;

  return true;
}
