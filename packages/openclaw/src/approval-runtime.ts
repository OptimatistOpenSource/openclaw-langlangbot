import { OpenClawApprovalKind } from "@optimatist/langlangbot-connector";
import { createChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";

import { watchApprovalDecision } from "./approval-sse-hub.js";
import {
  buildLanglangbotApprovalDescription,
  buildLanglangbotApprovalTitle,
  isExecApprovalRequest,
  resolveApprovalExpiresAtMs,
} from "./approval-text.js";
import { OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS } from "./approval-kinds.js";
import {
  canRouteLanglangbotApproval,
  resolveLanglangbotApprovalConversationId,
} from "./approval-routing.js";
import {
  createLanglangbotSidecar,
  isLanglangbotAccountReady,
  resolveLanglangbotAccount,
} from "./config.js";

function resolveOpenClawApprovalKind(request: { id: string }) {
  return request.id.startsWith("plugin:")
    ? OpenClawApprovalKind.Plugin
    : OpenClawApprovalKind.Exec;
}

type ApprovalSseBinding = {
  stop: () => void;
  approvalId: string;
};

export const langlangbotApprovalNativeRuntime = createChannelApprovalNativeRuntimeAdapter({
  eventKinds: [...OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS],
  availability: {
    isConfigured: ({ cfg, accountId }) =>
      isLanglangbotAccountReady(resolveLanglangbotAccount(cfg, accountId)),
    shouldHandle: ({ cfg, accountId, request }) =>
      canRouteLanglangbotApproval({ cfg, accountId, request }),
  },
  presentation: {
    buildPendingPayload: ({ request, view }) => ({
      text: buildLanglangbotApprovalTitle(request),
      description: buildLanglangbotApprovalDescription(request),
      actions: view.actions.map((action) => ({
        decision: action.decision,
        label: action.label,
      })),
    }),
    buildResolvedResult: () => ({ kind: "leave" as const }),
    buildExpiredResult: () => ({ kind: "leave" as const }),
  },
  transport: {
    prepareTarget: ({ request }) =>
      resolveLanglangbotApprovalConversationId(request),
    deliverPending: async ({ cfg, accountId, preparedTarget, request, view }) => {
      const sidecar = createLanglangbotSidecar(
        resolveLanglangbotAccount(cfg, accountId),
      );
      const conversationId =
        preparedTarget ?? resolveLanglangbotApprovalConversationId(request);
      if (!conversationId) {
        throw new Error(
          `langlangbot approval ${request.id}: missing conversation_id (sessionKey=${request.request.sessionKey ?? ""})`,
        );
      }
      const expiresAtMs = resolveApprovalExpiresAtMs(request);
      await sidecar.registerApprovalPending({
        approvalId: request.id,
        kind: resolveOpenClawApprovalKind(request),
        conversationId,
        title: buildLanglangbotApprovalTitle(request),
        description: buildLanglangbotApprovalDescription(request),
        actions: view.actions.map((action) => ({
          decision: action.decision,
          label: action.label,
          style: action.style,
        })),
        metadata: {
          approval_kind: isExecApprovalRequest(request) ? "exec" : "plugin",
        },
        expiresAt: new Date(expiresAtMs).toISOString(),
      });
      return {
        conversationId,
        approvalId: request.id,
      };
    },
  },
  interactions: {
    bindPending: ({ cfg, accountId, request }) => {
      const account = resolveLanglangbotAccount(cfg, accountId);
      const expiresAtMs = resolveApprovalExpiresAtMs(request);
      const stop = watchApprovalDecision({
        cfg,
        account,
        approvalId: request.id,
        expiresAtMs,
      });
      const binding: ApprovalSseBinding = {
        stop,
        approvalId: request.id,
      };
      return binding;
    },
    unbindPending: ({ binding }) => {
      const sseBinding = binding as ApprovalSseBinding | null;
      sseBinding?.stop();
    },
  },
});
