export function createId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Fallback hash when SubtleCrypto is unavailable (older Node test runners).
    const bytes = new Uint8Array(buffer);
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i += 1) {
      h ^= bytes[i] ?? 0;
      h = Math.imul(h, 16777619);
    }
    return `fnv_${(h >>> 0).toString(16).padStart(8, "0")}_${bytes.length}`;
  }
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
