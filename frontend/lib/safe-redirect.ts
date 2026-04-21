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
  return true;
}
