type ExecApprovalRequest = {
  id: string;
  expiresAtMs: number;
  request: {
    commandPreview?: string;
    command?: string;
    cwd?: string;
    agentId?: string;
  };
};

type PluginApprovalRequest = {
  id: string;
  request: {
    timeoutMs?: number;
    severity?: string;
    title: string;
    description?: string;
    toolName?: string;
    pluginId?: string;
    agentId?: string;
  };
};

export function isExecApprovalRequest(
  request: ExecApprovalRequest | PluginApprovalRequest,
): request is ExecApprovalRequest {
  return "expiresAtMs" in request;
}

export function buildLanglangbotApprovalTitle(
  request: ExecApprovalRequest | PluginApprovalRequest,
): string {
  if (isExecApprovalRequest(request)) {
    const cmd =
      request.request.commandPreview ?? request.request.command ?? "shell command";
    return `Exec: ${cmd.slice(0, 120)}`;
  }
  return request.request.title;
}

export function buildLanglangbotApprovalDescription(
  request: ExecApprovalRequest | PluginApprovalRequest,
): string | undefined {
  if (isExecApprovalRequest(request)) {
    const lines: string[] = [];
    const cmd = request.request.commandPreview ?? request.request.command;
    if (cmd) {
      lines.push(cmd.slice(0, 2000));
    }
    if (request.request.cwd) {
      lines.push(`cwd: ${request.request.cwd}`);
    }
    if (request.request.agentId) {
      lines.push(`agent: ${request.request.agentId}`);
    }
    const expiresIn = Math.max(
      0,
      Math.round((request.expiresAtMs - Date.now()) / 1000),
    );
    lines.push(`expires in ${expiresIn}s`);
    return lines.join("\n");
  }

  const lines: string[] = [];
  if (request.request.description) {
    lines.push(request.request.description);
  }
  if (request.request.toolName) {
    lines.push(`tool: ${request.request.toolName}`);
  }
  if (request.request.pluginId) {
    lines.push(`plugin: ${request.request.pluginId}`);
  }
  if (request.request.agentId) {
    lines.push(`agent: ${request.request.agentId}`);
  }
  const timeoutSec = Math.round((request.request.timeoutMs ?? 120_000) / 1000);
  lines.push(`expires in ${timeoutSec}s`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function resolveApprovalExpiresAtMs(
  request: ExecApprovalRequest | PluginApprovalRequest,
): number {
  if (isExecApprovalRequest(request)) {
    return request.expiresAtMs;
  }
  return Date.now() + (request.request.timeoutMs ?? 120_000);
}
