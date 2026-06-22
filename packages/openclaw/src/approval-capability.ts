import { createChannelApprovalCapability } from "openclaw/plugin-sdk/approval-delivery-runtime";
import { createLazyChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";

import {
  canRouteLanglangbotApproval,
  resolveLanglangbotApprovalConversationId,
} from "./approval-routing.js";
import { OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS } from "./approval-kinds.js";
import {
  isLanglangbotAccountReady,
  resolveLanglangbotAccount,
} from "./config.js";

function createLanglangbotApprovalCapability() {
  return createChannelApprovalCapability({
    authorizeActorAction: () => ({ authorized: true }),
    getActionAvailabilityState: ({ cfg, accountId }) =>
      isLanglangbotAccountReady(resolveLanglangbotAccount(cfg, accountId))
        ? { kind: "enabled" as const }
        : { kind: "disabled" as const },
    getExecInitiatingSurfaceState: ({ cfg, accountId }) =>
      isLanglangbotAccountReady(resolveLanglangbotAccount(cfg, accountId))
        ? { kind: "enabled" as const }
        : { kind: "disabled" as const },
    describeExecApprovalSetup: () =>
      "Deliver exec/plugin approvals on the LangLangBot channel to the Operator app via LangLangBot sidecar. Use approvals.exec/plugin mode \"session\" so langlangbot sessions approve in-app and other channels (e.g. QQ) keep their own session surface. Set channels.langlangbot.sidecarUrl and matching pluginToken / LANGLANGBOT_PLUGIN_TOKEN.",
    delivery: {
      hasConfiguredDmRoute: () => true,
      shouldSuppressForwardingFallback: (input) => {
        const channel = input.target?.channel;
        if (channel !== "langlangbot") {
          return false;
        }
        const account = resolveLanglangbotAccount(
          input.cfg,
          input.target?.accountId ?? input.request?.request?.turnSourceAccountId,
        );
        return isLanglangbotAccountReady(account);
      },
    },
    native: {
      describeDeliveryCapabilities: ({ cfg, accountId }) => {
        const enabled = isLanglangbotAccountReady(
          resolveLanglangbotAccount(cfg, accountId),
        );
        return {
          enabled,
          preferredSurface: "origin" as const,
          supportsOriginSurface: true,
          supportsApproverDmSurface: false,
          notifyOriginWhenDmOnly: false,
        };
      },
      resolveOriginTarget: ({ request }) => {
        const conversationId = resolveLanglangbotApprovalConversationId(request);
        return conversationId ? { to: `conversation:${conversationId}` } : null;
      },
    },
    nativeRuntime: createLazyChannelApprovalNativeRuntimeAdapter({
      // Full set for OpenClaw 2026.5.x gateway (no process.* approval events).
      eventKinds: [...OPENCLAW_GATEWAY_APPROVAL_EVENT_KINDS],
      isConfigured: ({ cfg, accountId }) =>
        isLanglangbotAccountReady(resolveLanglangbotAccount(cfg, accountId)),
      shouldHandle: ({ cfg, accountId, request }) =>
        canRouteLanglangbotApproval({ cfg, accountId, request }),
      load: async () => {
        const mod = await import("./approval-runtime.js");
        return mod.langlangbotApprovalNativeRuntime;
      },
    }),
  });
}

let cachedCapability: ReturnType<typeof createLanglangbotApprovalCapability> | undefined;

export function getLanglangbotApprovalCapability() {
  cachedCapability ??= createLanglangbotApprovalCapability();
  return cachedCapability;
}
