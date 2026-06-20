export const MAX_RECOVERY_SCANNER_BODY_BYTES = 32_768;

export class RecoveryScannerBodyTooLargeError extends Error {}

export async function readBoundedRecoveryScannerBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return {};

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RECOVERY_SCANNER_BODY_BYTES) {
      throw new RecoveryScannerBodyTooLargeError("Scanner recovery request is too large.");
    }
    chunks.push(value);
  }

  if (size === 0) return {};
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
