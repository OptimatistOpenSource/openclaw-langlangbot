const CHANNEL = "langlangbot";

export function operatorFromSurfaceId(surfaceId: string): string {
  const trimmed = surfaceId.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("operator:") ? trimmed : `operator:${trimmed}`;
}

/** OpenClaw command-owner allow entry for a verified Operator surface. */
export function openClawOwnerAllowFrom(surfaceId: string): string {
  const from = operatorFromSurfaceId(surfaceId);
  if (!from) {
    return "";
  }
  if (from.toLowerCase().startsWith(`${CHANNEL}:`)) {
    return from;
  }
  return `${CHANNEL}:${from}`;
}

export function resolveVerifiedOperatorSurface(params: {
  operatorSurfaceId?: string | null;
  configuredSurfaceId?: string | null;
}): string | null {
  const verified = params.operatorSurfaceId?.trim();
  if (verified) {
    return verified;
  }
  const configured = params.configuredSurfaceId?.trim();
  return configured || null;
}

export function resolveOperatorFrom(params: {
  operatorSurfaceId?: string | null;
  configuredSurfaceId?: string | null;
  conversationId: string;
}): string {
  const surfaceId = resolveVerifiedOperatorSurface({
    operatorSurfaceId: params.operatorSurfaceId,
    configuredSurfaceId: params.configuredSurfaceId,
  });
  if (surfaceId) {
    return operatorFromSurfaceId(surfaceId);
  }
  return `operator:${params.conversationId}`;
}
