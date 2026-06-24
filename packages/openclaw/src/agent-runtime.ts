import { buildLanglangbotSessionKey } from "./session-key.js";
import { formatError } from "./config.js";

export type AgentModelChoice = {
  id: string;
  name: string;
  provider: string;
  context_window?: number | null;
  reasoning?: boolean;
};

export type AgentSessionStatus = {
  session_key: string;
  agent_id: string;
  model?: string | null;
  model_provider?: string | null;
  context_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  context_window_tokens?: number | null;
  remaining_tokens?: number | null;
  total_tokens_fresh?: boolean | null;
  measurement: "session_store" | "unknown";
};

type GatewayModelRow = {
  id?: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  reasoning?: boolean;
};

type SessionRow = {
  key?: string;
  model?: string | null;
  modelProvider?: string | null;
  contextTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  totalTokensFresh?: boolean | null;
};

type SessionsListResult = {
  sessions?: SessionRow[];
  defaults?: {
    model?: string | null;
    modelProvider?: string | null;
    contextTokens?: number | null;
  };
};

type SessionsPatchResult = {
  ok?: boolean;
  key?: string;
  resolved?: {
    model?: string;
    modelProvider?: string;
  };
};

async function callGateway<T = Record<string, unknown>>(
  method: string,
  params?: unknown,
): Promise<T> {
  const mod = await import("openclaw/plugin-sdk/agent-harness-runtime");
  return mod.callGatewayTool<T>(method, {}, params, {
    scopes: ["operator.write"],
  });
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveContextWindow(
  session: SessionRow,
  modelCatalog: GatewayModelRow[],
  modelRef?: string | null,
): number | null {
  const fromSession = asNumber(session.contextTokens);
  if (fromSession != null) {
    return fromSession;
  }
  if (!modelRef) {
    return null;
  }
  const match = modelCatalog.find((row) => row.id === modelRef);
  return asNumber(match?.contextWindow);
}

function computeRemaining(
  contextWindow: number | null,
  totalTokens: number | null,
): number | null {
  if (contextWindow == null || totalTokens == null) {
    return null;
  }
  return Math.max(0, contextWindow - totalTokens);
}

export async function listAgentModels(): Promise<{
  models: AgentModelChoice[];
  default_model?: string | null;
}> {
  const body = await callGateway<{ models?: GatewayModelRow[] }>("models.list", {});
  const models = (body.models ?? [])
    .filter((row) => typeof row.id === "string" && typeof row.provider === "string")
    .map((row) => ({
      id: row.id!,
      name: typeof row.name === "string" ? row.name : row.id!,
      provider: row.provider!,
      context_window: asNumber(row.contextWindow),
      reasoning: row.reasoning === true,
    }));
  return { models };
}

async function loadSessionRow(sessionKey: string): Promise<SessionRow | null> {
  const list = await callGateway<SessionsListResult>("sessions.list", {
    limit: 200,
    search: sessionKey,
  });
  const exact = (list.sessions ?? []).find((row) => row.key === sessionKey);
  if (exact) {
    return exact;
  }
  return null;
}

export async function getAgentSessionStatus(params: {
  accountId: string;
  conversationId: string;
}): Promise<AgentSessionStatus> {
  const sessionKey = buildLanglangbotSessionKey(params);
  const [{ models: modelCatalog }, session] = await Promise.all([
    listAgentModels(),
    loadSessionRow(sessionKey),
  ]);

  const model = session?.model ?? null;
  const modelProvider = session?.modelProvider ?? null;
  const totalTokens = asNumber(session?.totalTokens);
  const contextWindow = resolveContextWindow(
    session ?? {},
    modelCatalog,
    model,
  );

  return {
    session_key: sessionKey,
    agent_id: "default",
    model,
    model_provider: modelProvider,
    context_tokens: asNumber(session?.contextTokens),
    input_tokens: asNumber(session?.inputTokens),
    output_tokens: asNumber(session?.outputTokens),
    total_tokens: totalTokens,
    context_window_tokens: contextWindow,
    remaining_tokens: computeRemaining(contextWindow, totalTokens),
    total_tokens_fresh:
      typeof session?.totalTokensFresh === "boolean"
        ? session.totalTokensFresh
        : null,
    measurement: session ? "session_store" : "unknown",
  };
}

export async function setAgentSessionModel(params: {
  accountId: string;
  conversationId: string;
  model: string;
}): Promise<{
  session_key: string;
  model: string;
  model_provider?: string | null;
  scope: "session";
}> {
  const sessionKey = buildLanglangbotSessionKey(params);
  const body = await callGateway<SessionsPatchResult>("sessions.patch", {
    key: sessionKey,
    model: params.model.trim(),
  });
  return {
    session_key: sessionKey,
    model: body.resolved?.model ?? params.model.trim(),
    model_provider: body.resolved?.modelProvider ?? null,
    scope: "session",
  };
}

export type ManagementRequestPayload = {
  request_id: string;
  conversation_id: string;
  operation: string;
  model?: string;
};

export async function handleManagementRequest(
  payload: ManagementRequestPayload,
  accountId: string,
): Promise<Record<string, unknown>> {
  const conversationId = payload.conversation_id;
  switch (payload.operation) {
    case "status":
      return getAgentSessionStatus({ accountId, conversationId });
    case "models":
      return listAgentModels();
    case "set_model": {
      const model = payload.model?.trim();
      if (!model) {
        throw new Error("model is required for set_model");
      }
      return setAgentSessionModel({ accountId, conversationId, model });
    }
    default:
      throw new Error(`unknown management operation: ${payload.operation}`);
  }
}

export function managementErrorPayload(err: unknown): {
  code: string;
  message: string;
} {
  const message = formatError(err);
  if (message.includes("Gateway method")) {
    return {
      code: "runtime_unavailable",
      message,
    };
  }
  if (message.includes("invalid") || message.includes("required")) {
    return {
      code: "invalid_request",
      message,
    };
  }
  return {
    code: "openclaw_error",
    message,
  };
}
