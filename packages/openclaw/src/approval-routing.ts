import { resolveApprovalRequestSessionConversation } from "openclaw/plugin-sdk/approval-native-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";

import { resolveLanglangbotApprovalTarget } from "./approval-target.js";
import { isLanglangbotAccountReady, resolveLanglangbotAccount } from "./config.js";
import { resolveLanglangbotSessionConversationId } from "./session-conversation.js";

type ApprovalRequestLike = {
  request: {
    sessionKey?: string | null;
    turnSourceTo?: string | null;
    turnSourceAccountId?: string | null;
  };
};

export function resolveLanglangbotApprovalConversationId(
  request: ApprovalRequestLike,
): string | null {
  const target = resolveLanglangbotApprovalTarget({
    sessionKey: request.request.sessionKey,
    turnSourceTo: request.request.turnSourceTo,
  });
  if (target) {
    return target;
  }
  const fromSessionKey = resolveLanglangbotSessionConversationId(
    request.request.sessionKey,
  );
  if (fromSessionKey) {
    return fromSessionKey;
  }
  const sessionConversation = resolveApprovalRequestSessionConversation({
    request,
    channel: "langlangbot",
    bundledFallback: true,
  });
  const fallbackId = sessionConversation?.id?.trim();
  if (!fallbackId) {
    return null;
  }
  return resolveLanglangbotSessionConversationId(fallbackId) ?? fallbackId;
}

export function canRouteLanglangbotApproval(params: {
  cfg: OpenClawConfig;
  accountId?: string;
  request: ApprovalRequestLike;
}): boolean {
  if (!isLanglangbotAccountReady(resolveLanglangbotAccount(params.cfg, params.accountId))) {
    return false;
  }
  const reqAccountId = params.request.request.turnSourceAccountId?.trim();
  if (reqAccountId && reqAccountId !== params.accountId) {
    return false;
  }
  return resolveLanglangbotApprovalConversationId(params.request) !== null;
}
