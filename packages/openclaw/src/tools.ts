import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/core";

import { resolveLanglangbotSessionConversationId } from "./session-conversation.js";
import {
  createLanglangbotSidecar,
  isLanglangbotAccountReady,
  resolveLanglangbotAccount,
} from "./config.js";

const connectionCurrentParameters = {
  type: "object",
  properties: {
    conversation_id: {
      type: "string",
      description:
        "LangLangBot conversation id. Defaults to the active langlangbot session when omitted.",
    },
  },
} as const;

export function registerLanglangbotTools(api: OpenClawPluginApi): void {
  api.registerTool((ctx) => {
    const cfg = ctx.getRuntimeConfig?.() ?? ctx.config;
    if (!cfg) {
      return null;
    }
    const account = resolveLanglangbotAccount(cfg, ctx.agentAccountId ?? "default");
    if (!isLanglangbotAccountReady(account)) {
      return null;
    }
    const sidecar = createLanglangbotSidecar(account);
    return {
      name: "langlangbot_connection_current",
      label: "LangLangBot connection",
      description:
        "Query how the Operator app is currently connected to LangLangBot (局域网 or 专用网络). " +
        "Use when the user asks how they are connected.",
      parameters: connectionCurrentParameters,
      async execute(_toolCallId, params) {
        const conversationId =
          readStringParam(params, "conversation_id") ||
          resolveLanglangbotSessionConversationId(ctx.sessionKey) ||
          undefined;
        if (!conversationId) {
          return jsonResult({
            status: "error",
            message:
              "conversation_id is required when no active langlangbot session is available.",
          });
        }
        const output = await sidecar.getPluginConnectionCurrent(conversationId);
        return jsonResult(output);
      },
    };
  });
}
