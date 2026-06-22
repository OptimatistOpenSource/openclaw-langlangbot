export const HTTPS_SCHEME = "https";
export const TLS_FINGERPRINT_PREFIX = "sha256/";
const TLS_FINGERPRINT_HEX_RE = /^[0-9a-fA-F]{64}$/;

export type DirectEndpointLike = {
  address: string;
  port: number;
  scheme?: string;
  tls_fingerprint?: string;
};

/** Reject plaintext HTTP endpoints (production Operator policy). */
export function assertHttpsEndpoint(endpoint: DirectEndpointLike): void {
  const scheme = endpoint.scheme?.trim().toLowerCase();
  if (scheme !== HTTPS_SCHEME) {
    throw new Error(
      `direct endpoint must use scheme=https (got ${scheme ?? "missing"})`,
    );
  }
  validateTlsFingerprint(endpoint.tls_fingerprint);
}

export function validateTlsFingerprint(
  fingerprint: string | undefined,
): void {
  const trimmed = fingerprint?.trim();
  if (!trimmed) {
    throw new Error("tls_fingerprint is required");
  }
  if (!trimmed.startsWith(TLS_FINGERPRINT_PREFIX)) {
    throw new Error("tls_fingerprint must start with sha256/");
  }
  const hex = trimmed.slice(TLS_FINGERPRINT_PREFIX.length);
  if (!TLS_FINGERPRINT_HEX_RE.test(hex)) {
    throw new Error("tls_fingerprint must be sha256/ followed by 64 hex chars");
  }
}

export function buildDirectEndpointUrl(endpoint: DirectEndpointLike): string {
  assertHttpsEndpoint(endpoint);
  return `${HTTPS_SCHEME}://${endpoint.address}:${endpoint.port}`;
}

/** Reject plaintext HTTP base URLs (Operator / production policy). */
export function assertHttpsBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`invalid base URL: ${baseUrl}`);
  }
  if (parsed.protocol !== `${HTTPS_SCHEME}:`) {
    throw new Error(
      `base URL must use scheme=https (got ${parsed.protocol.replace(":", "")})`,
    );
  }
}
