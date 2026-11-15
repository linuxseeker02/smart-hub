export type PdfFormatVerification =
  | { status: "verified-pdf"; evidence: "magic-bytes" }
  | { status: "not-pdf"; reason: string }
  | { status: "unknown"; reason: string };

export const isPdfMagicBytes = (bytes: Uint8Array): boolean =>
  bytes.length >= 5 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

export const verifyPdfPrefix = (
  bytes: Uint8Array
): PdfFormatVerification =>
  isPdfMagicBytes(bytes)
    ? { status: "verified-pdf", evidence: "magic-bytes" }
    : { status: "not-pdf", reason: "provider bytes do not start with %PDF-" };

export const fetchAndVerifyPdfPrefix = async (
  url: string,
  fetcher: typeof fetch = fetch
): Promise<PdfFormatVerification> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetcher(url, {
      headers: { Range: "bytes=0-5" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "unknown",
        reason: `provider byte lookup failed with status ${response.status}`,
      };
    }

    if (!response.body) {
      return { status: "unknown", reason: "provider returned no response body" };
    }

    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    await reader.cancel();

    return firstChunk.value
      ? verifyPdfPrefix(firstChunk.value)
      : { status: "unknown", reason: "provider returned no bytes" };
  } catch (error) {
    return {
      status: "unknown",
      reason:
        error instanceof Error ? "provider byte lookup failed" : "unknown provider byte lookup failure",
    };
  } finally {
    clearTimeout(timeout);
  }
};
