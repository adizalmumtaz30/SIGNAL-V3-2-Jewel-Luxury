/**
 * Integrity checksum utilities using SHA-256 over deterministic canonical JSON.
 *
 * IMPORTANT SECURITY NOTICE:
 * SHA-256 checksums verify data integrity (detect accidental corruption or modification).
 * A checksum is NOT encryption, NOT authentication, and NOT a digital signature.
 */

export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? 'null' : canonicalStringify(item)));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      const propVal = obj[key];
      if (propVal === undefined || typeof propVal === 'function' || typeof propVal === 'symbol') {
        continue;
      }
      parts.push(`${JSON.stringify(key)}:${canonicalStringify(propVal)}`);
    }
    return `{${parts.join(',')}}`;
  }
  return 'null';
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export async function computeSha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeCanonicalSha256(value: unknown): Promise<string> {
  return computeSha256Hex(canonicalStringify(value));
}
