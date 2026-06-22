/**
 * OpenClaw Gateway WS approval families (see openclaw docs/gateway/protocol.md).
 *
 * `eventKinds` on channel nativeRuntime must stay in sync with the gateway —
 * today that is only these two. There is no `process.approval.*` family.
 */
export const OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS = ["exec", "plugin"] as const;

export type OpenClawGatewayApprovalEventKind =
  (typeof OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS)[number];

/**
 * Tools that feel like “process” but are NOT a third gateway approval family:
 *
 * - `process` (list/poll/log/kill background shells): managed after an `exec` run;
 *   the dangerous moment is `exec.approval.requested` when the command starts.
 * - `node.invoke` + `system.run`: still flows through exec approval + systemRunPlan.
 * - Gateway intents (Finance / U8C): arbitrary sidecar `kind` strings + metadata;
 *   not subscribed via `eventKinds` — register via POST /v1/approvals/pending.
 */
