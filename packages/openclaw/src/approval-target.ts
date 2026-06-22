import { parseConversationTarget } from "./config.js";

export function resolveLanglangbotApprovalTarget(params: {
  sessionKey?: string | null;
  turnSourceTo?: string | null;
}): string | null {
  const candidates = [params.turnSourceTo, params.sessionKey];
  for (const raw of candidates) {
    if (!raw) {
      continue;
    }
    const direct = parseConversationTarget(raw);
    if (direct) {
      return direct;
    }
    const match = raw.match(/langlangbot:[^:]+:direct:(conversation:[^:\s]+)/);
    if (match?.[1]) {
      const conversationId = parseConversationTarget(match[1]);
      if (conversationId) {
        return conversationId;
      }
    }
  }
  return null;
}
