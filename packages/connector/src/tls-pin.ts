import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { createHash, X509Certificate } from "node:crypto";
import { type PeerCertificate } from "node:tls";

import {
  TLS_FINGERPRINT_PREFIX,
  validateTlsFingerprint,
  type DirectEndpointLike,
} from "./endpoint-url.js";

/** SHA-256(SPKI DER) — must match langlangbot `tls::fingerprint_from_cert_pem`. */
export function spkiFingerprintFromCertDer(certDer: Buffer): string {
  const x509 = new X509Certificate(certDer);
  const spkiDer = x509.publicKey.export({ type: "spki", format: "der" });
  const hex = createHash("sha256").update(spkiDer).digest("hex");
  return `${TLS_FINGERPRINT_PREFIX}${hex}`;
}

export function normalizeTlsFingerprint(fingerprint: string): string {
  validateTlsFingerprint(fingerprint);
  const hex = fingerprint
    .trim()
    .slice(TLS_FINGERPRINT_PREFIX.length)
    .toLowerCase();
  return `${TLS_FINGERPRINT_PREFIX}${hex}`;
}

export function fingerprintsMatch(expected: string, observed: string): boolean {
  return normalizeTlsFingerprint(expected) === normalizeTlsFingerprint(observed);
}

/** Per-surface SPKI pins established at enrollment. */
export class TlsTrustStore {
  private readonly pins = new Map<string, string>();

  pin(surfaceId: string, tlsFingerprint: string): void {
    this.pins.set(surfaceId, normalizeTlsFingerprint(tlsFingerprint));
  }

  get(surfaceId: string): string | undefined {
    return this.pins.get(surfaceId);
  }

  has(surfaceId: string): boolean {
    return this.pins.has(surfaceId);
  }

  unpin(surfaceId: string): void {
    this.pins.delete(surfaceId);
  }

  /**
   * Returns true when Makway reports a new fingerprint for a previously pinned surface.
   * Operator must require Owner re-confirmation before accepting the new pin.
   */
  fingerprintChanged(surfaceId: string, tlsFingerprint: string): boolean {
    const existing = this.pins.get(surfaceId);
    if (!existing) {
      return false;
    }
    return !fingerprintsMatch(existing, tlsFingerprint);
  }

  /** Same as `pin`; name signals Owner re-confirmation after fingerprint change. */
  confirmPin(surfaceId: string, tlsFingerprint: string): void {
    this.pin(surfaceId, tlsFingerprint);
  }
}

export type PinnedTlsFetchOptions = {
  tlsFingerprint: string;
  /** Dev only — skip SPKI pin verification. */
  insecureTls?: boolean;
};

type UndiciFetchInput = Parameters<typeof undiciFetch>[0];

export function undiciFetchWithAgent(
  agent: Agent,
): (input: RequestInfo | URL, init?: RequestInit) => ReturnType<typeof fetch> {
  return (input, init) =>
    undiciFetch(input as UndiciFetchInput, {
      ...(init as UndiciRequestInit | undefined),
      dispatcher: agent,
    }) as ReturnType<typeof fetch>;
}

export function createInsecureTlsFetch(): typeof fetch {
  const agent = new Agent({ connect: { rejectUnauthorized: false } });
  return undiciFetchWithAgent(agent) as typeof fetch;
}

export function createPinnedTlsFetch(
  opts: PinnedTlsFetchOptions,
): typeof fetch {
  if (opts.insecureTls) {
    return createInsecureTlsFetch();
  }

  const expected = normalizeTlsFingerprint(opts.tlsFingerprint);
  const agent = new Agent({
    connect: {
      // CA validation disabled; SPKI pin is enforced in checkServerIdentity.
      rejectUnauthorized: false,
      checkServerIdentity(_host: string, cert: PeerCertificate): Error | undefined {
        const der = cert.raw;
        const observed = spkiFingerprintFromCertDer(der);
        if (!fingerprintsMatch(expected, observed)) {
          return new Error(
            `TLS fingerprint mismatch: expected ${expected}, got ${observed}`,
          );
        }
        return undefined;
      },
    },
  });
  return undiciFetchWithAgent(agent) as typeof fetch;
}

export type DirectAgentClientOptions = {
  endpoint: DirectEndpointLike;
  surfaceId: string;
  trustStore: TlsTrustStore;
  /** Dev only. */
  insecureTls?: boolean;
};

/**
 * Operator client for a pinned HTTPS direct endpoint.
 * Requires enrollment pin in `trustStore` unless `insecureTls` (dev).
 */
export function createDirectAgentFetch(
  opts: DirectAgentClientOptions,
): typeof fetch {
  if (opts.insecureTls) {
    return createInsecureTlsFetch();
  }
  const pinned = opts.trustStore.get(opts.surfaceId);
  if (!pinned) {
    throw new Error(
      `no TLS pin for surface ${opts.surfaceId}; complete enrollment first`,
    );
  }
  const reported = opts.endpoint.tls_fingerprint;
  if (reported && opts.trustStore.fingerprintChanged(opts.surfaceId, reported)) {
    throw new Error(
      `TLS fingerprint changed for surface ${opts.surfaceId}; Owner must re-confirm`,
    );
  }
  const fingerprint = reported ? normalizeTlsFingerprint(reported) : pinned;
  return createPinnedTlsFetch({ tlsFingerprint: fingerprint });
}
