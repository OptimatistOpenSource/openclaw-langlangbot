const DEFAULT_AGENT_ID = "default";

export function agentIdFromSessionKey(sessionKey: string): string {
  const match = /^agent:([^:]+)/.exec(sessionKey);
  return match?.[1] ?? DEFAULT_AGENT_ID;
}

export function buildLanglangbotSessionKey(params: {
  accountId: string;
  conversationId: string;
  agentId?: string;
}): string {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const to = `conversation:${params.conversationId}`;
  return `agent:${agentId}:langlangbot:${params.accountId}:direct:${to}`;
}
