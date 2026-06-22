export type GatewayEventType =
  | "conversation_opened"
  | "user_message"
  | "assistant_delta"
  | "assistant_message"
  | "tool_call"
  | "cancelled"
  | "approval_requested"
  | "approval_resolved";

export type ApprovalAction = {
  decision: string;
  label: string;
  style?: string;
};

/**
 * Wire/API approval kind — extensible string, not a closed union.
 *
 * Conventions:
 * - OpenClaw native: `openclaw.exec`, `openclaw.plugin`
 * - Gateway intent (Finance Gateway and future systems): manifest action id or
 *   `intent:<gateway>:<action>`; canonical payload in `metadata` (intent_id, intent_hash, …)
 */
export type ApprovalKind = string;

/** Built-in OpenClaw approval kinds (sidecar polls → exec/plugin.approval.resolve). */
export const OpenClawApprovalKind = {
  Exec: "openclaw.exec",
  Plugin: "openclaw.plugin",
} as const;

export type BuiltInOpenClawApprovalKind =
  (typeof OpenClawApprovalKind)[keyof typeof OpenClawApprovalKind];

/** Normalize legacy aliases from early Phase 2 drafts. */
export function normalizeApprovalKind(kind: string): ApprovalKind {
  const trimmed = kind.trim();
  switch (trimmed) {
    case "exec":
    case "openclaw_exec":
      return OpenClawApprovalKind.Exec;
    case "plugin":
    case "openclaw_plugin":
      return OpenClawApprovalKind.Plugin;
    default:
      return trimmed;
  }
}

export function isOpenClawApprovalKind(kind: string): boolean {
  const normalized = normalizeApprovalKind(kind);
  return (
    normalized === OpenClawApprovalKind.Exec ||
    normalized === OpenClawApprovalKind.Plugin
  );
}

export type OpenClawApprovalDecision = "allow-once" | "allow-always" | "deny";

export function isOpenClawApprovalDecision(
  value: string,
): value is OpenClawApprovalDecision {
  return (
    value === "allow-once" ||
    value === "allow-always" ||
    value === "deny"
  );
}

export type ApprovalPluginEvent =
  | {
      type: "approval_decided";
      approval_id: string;
      decision: string;
    }
  | {
      type: "approval_resolved";
      approval_id: string;
      decision?: string | null;
    };

export type RegisterPendingApprovalInput = {
  approvalId: string;
  kind: ApprovalKind;
  conversationId?: string;
  title: string;
  description?: string;
  actions?: ApprovalAction[];
  metadata?: Record<string, unknown>;
  expiresAt: string;
};

export type ApprovalDecisionPoll = {
  status: "pending" | "decided" | "resolved" | "expired";
  decision?: OpenClawApprovalDecision;
  decidedAt?: string;
};

export type PluginConnectionEndpoint = {
  transport: string;
  address: string;
  port: number;
};

export type PluginConnectionCurrentResponse =
  | {
      conversation_id: string;
      status: "observed";
      transport: string;
      remote_addr?: string | null;
      observed_at: string;
      matched_endpoint?: PluginConnectionEndpoint | null;
      published_endpoints: PluginConnectionEndpoint[];
    }
  | {
      conversation_id: string;
      status: "unknown";
      message: string;
      published_endpoints: PluginConnectionEndpoint[];
    }
  | {
      status: "error";
      message: string;
    };

export type GatewayEvent =
  | {
      type: "conversation_opened";
      conversation_id: string;
      created_at: string;
    }
  | {
      type: "user_message";
      message_id: string;
      text: string;
      received_at: string;
    }
  | {
      type: "assistant_delta";
      text: string;
      created_at: string;
    }
  | {
      type: "assistant_message";
      message_id: string;
      text: string;
      created_at: string;
    }
  | {
      type: "tool_call";
      tool_call_id: string;
      tool_name: string;
      summary: string;
      created_at: string;
    }
  | {
      type: "cancelled";
      reason?: string | null;
      cancelled_at: string;
    }
  | {
      type: "approval_requested";
      approval_id: string;
      kind: string;
      title: string;
      description?: string | null;
      actions: ApprovalAction[];
      expires_at: string;
      metadata?: Record<string, unknown>;
      created_at: string;
    }
  | {
      type: "approval_resolved";
      approval_id: string;
      decision?: string | null;
      resolved_at: string;
    };

export type InboundMessage = {
  conversationId: string;
  messageId: string;
  text: string;
  receivedAt: string;
  /** Base64 operator surface id attested by LangLangBot after ODA session.open. */
  operatorSurfaceId?: string;
};

export type HealthStatus = {
  status: string;
  server_time?: string;
};

export type Unsubscribe = () => void;

import { assertHttpsBaseUrl } from "./endpoint-url.js";
import {
  createInsecureTlsFetch,
  createPinnedTlsFetch,
} from "./tls-pin.js";

export type LanglangbotSidecarOptions = {
  baseUrl: string;
  pluginToken?: string;
  /** Trust self-signed Agent cert (loopback OpenClaw plugin only). */
  insecureTls?: boolean;
  /** SPKI pin (`sha256/<hex>`) for Operator-style verification. */
  tlsFingerprint?: string;
  /** Dev only: allow `http://` base URLs. */
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function createFetchImpl(opts: LanglangbotSidecarOptions): typeof fetch {
  const base = normalizeBaseUrl(opts.baseUrl);
  if (!opts.allowInsecureHttp && !base.startsWith("https://")) {
    if (base.startsWith("http://")) {
      throw new Error(
        "sidecar baseUrl must use https:// (set allowInsecureHttp for dev only)",
      );
    }
    assertHttpsBaseUrl(base);
  }

  if (opts.tlsFingerprint) {
    return createPinnedTlsFetch({
      tlsFingerprint: opts.tlsFingerprint,
      insecureTls: opts.insecureTls,
    });
  }
  if (opts.insecureTls) {
    return createInsecureTlsFetch();
  }
  return fetch;
}

function parseGatewayEvent(raw: unknown): GatewayEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const event = raw as Record<string, unknown>;
  const type = event.type;
  if (typeof type !== "string") {
    return null;
  }
  switch (type) {
    case "conversation_opened":
      return {
        type,
        conversation_id: String(event.conversation_id),
        created_at: String(event.created_at),
      };
    case "user_message":
      return {
        type,
        message_id: String(event.message_id),
        text: String(event.text),
        received_at: String(event.received_at),
      };
    case "assistant_delta":
      return {
        type,
        text: String(event.text),
        created_at: String(event.created_at),
      };
    case "assistant_message":
      return {
        type,
        message_id: String(event.message_id),
        text: String(event.text),
        created_at: String(event.created_at),
      };
    case "tool_call":
      return {
        type,
        tool_call_id: String(event.tool_call_id),
        tool_name: String(event.tool_name),
        summary: String(event.summary),
        created_at: String(event.created_at),
      };
    case "cancelled":
      return {
        type,
        reason:
          event.reason == null ? null : String(event.reason),
        cancelled_at: String(event.cancelled_at),
      };
    case "approval_requested":
      return {
        type,
        approval_id: String(event.approval_id),
        kind: String(event.kind),
        title: String(event.title),
        description:
          event.description == null ? undefined : String(event.description),
        actions: Array.isArray(event.actions)
          ? (event.actions as ApprovalAction[])
          : [],
        expires_at: String(event.expires_at),
        metadata:
          event.metadata && typeof event.metadata === "object"
            ? (event.metadata as Record<string, unknown>)
            : undefined,
        created_at: String(event.created_at),
      };
    case "approval_resolved":
      return {
        type,
        approval_id: String(event.approval_id),
        decision:
          event.decision == null ? undefined : String(event.decision),
        resolved_at: String(event.resolved_at),
      };
    default:
      return null;
  }
}

function parseApprovalPluginEvent(raw: unknown): ApprovalPluginEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const event = raw as Record<string, unknown>;
  const type = event.type;
  if (type === "approval_decided") {
    const approvalId = event.approval_id;
    const decision = event.decision;
    if (typeof approvalId !== "string" || typeof decision !== "string") {
      return null;
    }
    return { type, approval_id: approvalId, decision };
  }
  if (type === "approval_resolved") {
    const approvalId = event.approval_id;
    if (typeof approvalId !== "string") {
      return null;
    }
    return {
      type,
      approval_id: approvalId,
      decision:
        event.decision == null ? undefined : String(event.decision),
    };
  }
  return null;
}

function startReconnectingSse(params: {
  connect: (signal: AbortSignal) => Promise<Response>;
  onData: (data: string) => void;
  onError?: (err: Error) => void;
  errorLabel: string;
}): Unsubscribe {
  const controller = new AbortController();
  void (async () => {
    let attempt = 0;
    while (!controller.signal.aborted) {
      try {
        const response = await params.connect(controller.signal);
        if (!response.ok) {
          throw new Error(`${params.errorLabel}: ${response.status}`);
        }
        attempt = 0;
        await consumeSse(
          response,
          (_eventName, data) => params.onData(data),
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        params.onError?.(error);
        attempt += 1;
        const delayMs = Math.min(30_000, 1_000 * attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();
  return () => controller.abort();
}

async function consumeSse(
  response: Response,
  onEvent: (eventName: string, data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    const payload =
      dataLines.length === 1 ? dataLines[0] : dataLines.join("\n");
    onEvent(eventName, payload);
    eventName = "message";
    dataLines = [];
  };

  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      flush();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (line === "") {
        flush();
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
}

export class LanglangbotSidecar {
  readonly baseUrl: string;
  readonly pluginToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: LanglangbotSidecarOptions) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.pluginToken = opts.pluginToken;
    this.fetchImpl = opts.fetchImpl ?? createFetchImpl(opts);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...extra,
    };
    if (this.pluginToken) {
      headers["x-langlangbot-plugin-token"] = this.pluginToken;
    }
    return headers;
  }

  async health(): Promise<HealthStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`health check failed: ${response.status}`);
    }
    return (await response.json()) as HealthStatus;
  }

  subscribeInbound(
    onMessage: (evt: InboundMessage) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    return startReconnectingSse({
      errorLabel: "inbound SSE failed",
      onError,
      connect: (signal) =>
        this.fetchImpl(`${this.baseUrl}/v1/inbound/events`, {
          headers: this.headers({ accept: "text/event-stream" }),
          signal,
        }),
      onData: (data) => {
        try {
          const parsed = JSON.parse(data) as {
            conversation_id?: string;
            message_id?: string;
            text?: string;
            received_at?: string;
            operator_surface_id?: string;
          };
          if (
            !parsed.conversation_id ||
            !parsed.message_id ||
            typeof parsed.text !== "string"
          ) {
            return;
          }
          onMessage({
            conversationId: parsed.conversation_id,
            messageId: parsed.message_id,
            text: parsed.text,
            receivedAt: parsed.received_at ?? new Date().toISOString(),
            operatorSurfaceId: parsed.operator_surface_id?.trim() || undefined,
          });
        } catch (err) {
          if (err instanceof SyntaxError) {
            return;
          }
          throw err;
        }
      },
    });
  }

  subscribeApprovalPluginEvents(
    onEvent: (evt: ApprovalPluginEvent) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    return startReconnectingSse({
      errorLabel: "approval plugin SSE failed",
      onError,
      connect: (signal) =>
        this.fetchImpl(`${this.baseUrl}/v1/approvals/plugin/events`, {
          headers: this.headers({ accept: "text/event-stream" }),
          signal,
        }),
      onData: (data) => {
        try {
          const parsed = parseApprovalPluginEvent(JSON.parse(data));
          if (parsed) {
            onEvent(parsed);
          }
        } catch (err) {
          if (err instanceof SyntaxError) {
            return;
          }
          throw err;
        }
      },
    });
  }

  subscribeConversationEvents(
    conversationId: string,
    onEvent: (evt: GatewayEvent) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    return startReconnectingSse({
      errorLabel: "conversation SSE failed",
      onError,
      connect: (signal) =>
        this.fetchImpl(`${this.baseUrl}/v1/conversations/${conversationId}/events`, {
          headers: this.headers({ accept: "text/event-stream" }),
          signal,
        }),
      onData: (data) => {
        try {
          const parsed = parseGatewayEvent(JSON.parse(data));
          if (parsed) {
            onEvent(parsed);
          }
        } catch (err) {
          if (err instanceof SyntaxError) {
            return;
          }
          throw err;
        }
      },
    });
  }

  async sendDelta(conversationId: string, text: string): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/conversations/${conversationId}/outbound/delta`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ text }),
      },
    );
    if (!response.ok) {
      throw new Error(`sendDelta failed: ${response.status}`);
    }
  }

  async registerApprovalPending(
    input: RegisterPendingApprovalInput,
  ): Promise<{ approval_id: string; status: string }> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/approvals/pending`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        approval_id: input.approvalId,
        kind: normalizeApprovalKind(input.kind),
        conversation_id: input.conversationId,
        title: input.title,
        description: input.description,
        actions: input.actions,
        metadata: input.metadata ?? {},
        expires_at: input.expiresAt,
      }),
    });
    if (!response.ok) {
      throw new Error(`registerApprovalPending failed: ${response.status}`);
    }
    return (await response.json()) as { approval_id: string; status: string };
  }

  async getApprovalDecision(approvalId: string): Promise<ApprovalDecisionPoll> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/approvals/${encodeURIComponent(approvalId)}/decision`,
      { headers: this.headers() },
    );
    if (!response.ok) {
      throw new Error(`getApprovalDecision failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      status: ApprovalDecisionPoll["status"];
      decision?: OpenClawApprovalDecision;
      decided_at?: string;
    };
    return {
      status: body.status,
      decision: body.decision,
      decidedAt: body.decided_at,
    };
  }

  async markApprovalResolved(
    approvalId: string,
    decision?: OpenClawApprovalDecision,
  ): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/approvals/${encodeURIComponent(approvalId)}/resolved`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ decision }),
      },
    );
    if (!response.ok) {
      throw new Error(`markApprovalResolved failed: ${response.status}`);
    }
  }

  async getPluginConnectionCurrent(
    conversationId: string,
  ): Promise<PluginConnectionCurrentResponse> {
    const params = new URLSearchParams({ conversation_id: conversationId });
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/plugin/connection/current?${params}`,
      {
        method: "GET",
        headers: this.headers(),
      },
    );
    if (!response.ok) {
      throw new Error(
        `getPluginConnectionCurrent failed: ${response.status}`,
      );
    }
    return response.json() as Promise<PluginConnectionCurrentResponse>;
  }

  async sendMessage(
    conversationId: string,
    text: string,
    messageId?: string,
  ): Promise<{ message_id: string }> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/conversations/${conversationId}/outbound/message`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          text,
          message_id: messageId,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`sendMessage failed: ${response.status}`);
    }
    return (await response.json()) as { message_id: string };
  }
}
