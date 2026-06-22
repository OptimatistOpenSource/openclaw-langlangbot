import type { LanglangbotSidecar } from "@optimatist/langlangbot-connector";
import type { ChannelGatewayContext } from "openclaw/plugin-sdk/index";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-payload";

import {
  conversationTarget,
  createLanglangbotSidecar,
  formatError,
  type LanglangbotAccount,
} from "./config.js";
import {
  openClawOwnerAllowFrom,
  resolveOperatorFrom,
  resolveVerifiedOperatorSurface,
} from "./operator-surface.js";
import { getLanglangbotRuntime } from "./runtime.js";
import {
  ensureLanglangbotSidecar,
  releaseLanglangbotSidecar,
} from "./sidecar-manager.js";

type InboundHandle = {
  conversationId: string;
  messageId: string;
  text: string;
  operatorSurfaceId?: string;
};

export async function startLanglangbotGateway(
  ctx: ChannelGatewayContext<LanglangbotAccount>,
): Promise<void> {
  const account = ctx.account;
  const { startedByPlugin } = await ensureLanglangbotSidecar(account, ctx.log);

  const sidecar = createLanglangbotSidecar(account);

  ctx.log?.info?.(
    `[langlangbot:${account.accountId}] connected to LangLangBot at ${account.sidecarUrl}${
      startedByPlugin ? " (started by OpenClaw)" : ""
    }`,
  );

  let approvalNativeLease: { dispose: () => void } | null = null;
  if (ctx.channelRuntime) {
    approvalNativeLease = ctx.channelRuntime.runtimeContexts.register({
      channelId: "langlangbot",
      accountId: account.accountId,
      capability: "approval.native",
      context: { account },
      abortSignal: ctx.abortSignal,
    });
  } else {
    ctx.log?.warn?.(
      `[langlangbot:${account.accountId}] No channelRuntime — approval.native disabled`,
    );
  }

  const unsubscribe = sidecar.subscribeInbound(
    (evt) => {
      void handleInbound(
        {
          conversationId: evt.conversationId,
          messageId: evt.messageId,
          text: evt.text,
          operatorSurfaceId: evt.operatorSurfaceId,
        },
        ctx,
        sidecar,
      ).catch((err) => {
        ctx.log?.error?.(
          `[langlangbot:${account.accountId}] inbound dispatch failed: ${
            formatError(err)
          }`,
        );
      });
    },
    (err) => {
      ctx.log?.warn?.(
        `[langlangbot:${account.accountId}] inbound SSE error: ${err.message}`,
      );
    },
  );

  ctx.setStatus({
    ...ctx.getStatus(),
    running: true,
    connected: true,
    lastConnectedAt: Date.now(),
  });

  await new Promise<void>((resolve) => {
    const onAbort = () => {
      unsubscribe();
      approvalNativeLease?.dispose();
      releaseLanglangbotSidecar(account, ctx.log);
      ctx.setStatus({
        ...ctx.getStatus(),
        running: false,
        connected: false,
      });
      resolve();
    };
    if (ctx.abortSignal.aborted) {
      onAbort();
      return;
    }
    ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}

async function handleInbound(
  inbound: InboundHandle,
  ctx: ChannelGatewayContext<LanglangbotAccount>,
  sidecar: LanglangbotSidecar,
): Promise<void> {
  const runtime = ctx.channelRuntime ?? getLanglangbotRuntime().channel;
  const account = ctx.account;
  const cfg = ctx.cfg;
  const agentId = "default";
  const to = conversationTarget(inbound.conversationId);
  const verifiedSurfaceId = resolveVerifiedOperatorSurface({
    operatorSurfaceId: inbound.operatorSurfaceId,
    configuredSurfaceId: account.surfaceId,
  });
  const from = resolveOperatorFrom({
    operatorSurfaceId: inbound.operatorSurfaceId,
    configuredSurfaceId: account.surfaceId,
    conversationId: inbound.conversationId,
  });
  const ownerAllowFrom = verifiedSurfaceId
    ? [openClawOwnerAllowFrom(verifiedSurfaceId)]
    : undefined;
  const sessionKey = `agent:${agentId}:langlangbot:${account.accountId}:direct:${to}`;
  const storePath = runtime.session.resolveStorePath(cfg.session?.store, { agentId });

  const ctxPayload = runtime.reply.finalizeInboundContext({
    Body: inbound.text,
    RawBody: inbound.text,
    BodyForAgent: inbound.text,
    CommandBody: inbound.text,
    From: from,
    To: to,
    SessionKey: sessionKey,
    AccountId: account.accountId,
    MessageSid: inbound.messageId,
    Provider: "langlangbot",
    Surface: "langlangbot",
    OriginatingChannel: "langlangbot",
    OriginatingTo: to,
    ChatType: "direct",
    ...(ownerAllowFrom ? { OwnerAllowFrom: ownerAllowFrom } : {}),
  });

  const streamState = { streamedText: "", sentFinal: false };

  await runtime.turn.run({
    channel: "langlangbot",
    accountId: account.accountId,
    raw: inbound,
    adapter: {
      ingest: () => ({
        id: inbound.messageId,
        rawText: inbound.text,
        textForAgent: inbound.text,
        textForCommands: inbound.text,
        raw: inbound,
      }),
      resolveTurn: () => ({
        channel: "langlangbot",
        accountId: account.accountId,
        routeSessionKey: sessionKey,
        storePath,
        ctxPayload,
        recordInboundSession: runtime.session.recordInboundSession,
        record: {
          onRecordError: (err: unknown) => {
            ctx.log?.error?.(
              `[langlangbot:${account.accountId}] session record failed: ${
                formatError(err)
              }`,
            );
          },
        },
        runDispatch: () =>
          runtime.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
              deliver: async (payload: ReplyPayload, info: { kind?: string }) => {
                const text = (payload.text ?? "").trim();
                if (!text) {
                  return;
                }
                const kind = info.kind ?? "final";
                if (account.streaming && kind === "block") {
                  streamState.streamedText = text;
                  ctx.log?.debug?.(
                    `[langlangbot:${account.accountId}] outbound delta (${text.length} chars) → ${inbound.conversationId}`,
                  );
                  await sidecar.sendDelta(inbound.conversationId, text);
                  return;
                }
                // OpenClaw often emits only a final payload (no block chunks). The Operator
                // app may expect assistant_delta frames when streaming is enabled.
                if (account.streaming && !streamState.streamedText) {
                  ctx.log?.debug?.(
                    `[langlangbot:${account.accountId}] outbound delta (final, ${text.length} chars) → ${inbound.conversationId}`,
                  );
                  await sidecar.sendDelta(inbound.conversationId, text);
                }
                ctx.log?.info?.(
                  `[langlangbot:${account.accountId}] outbound message (${text.length} chars) → ${inbound.conversationId}`,
                );
                await sidecar.sendMessage(inbound.conversationId, text);
                streamState.sentFinal = true;
              },
              onIdle: async () => {
                if (
                  account.streaming &&
                  streamState.streamedText &&
                  !streamState.sentFinal
                ) {
                  ctx.log?.info?.(
                    `[langlangbot:${account.accountId}] outbound message onIdle (${streamState.streamedText.length} chars) → ${inbound.conversationId}`,
                  );
                  await sidecar.sendMessage(
                    inbound.conversationId,
                    streamState.streamedText,
                  );
                  streamState.sentFinal = true;
                }
              },
              onError: (err: unknown, info: { kind?: string }) => {
                ctx.log?.error?.(
                  `[langlangbot:${account.accountId}] outbound ${info.kind ?? "reply"} failed: ${
                    formatError(err)
                  }`,
                );
              },
            },
          }),
      }),
    },
  });
}
