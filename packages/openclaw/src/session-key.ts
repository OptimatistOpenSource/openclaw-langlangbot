const DEFAULT_AGENT_ID = "default";

export function buildLanglangbotSessionKey(params: {
  accountId: string;
  conversationId: string;
  agentId?: string;
}): string {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const to = `conversation:${params.conversationId}`;
  return `agent:${agentId}:langlangbot:${params.accountId}:direct:${to}`;
}
