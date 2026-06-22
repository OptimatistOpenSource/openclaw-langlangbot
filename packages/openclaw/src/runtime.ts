import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let runtime: PluginRuntime | null = null;

export function setLanglangbotRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getLanglangbotRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("langlangbot runtime not initialized");
  }
  return runtime;
}

export function tryGetLanglangbotRuntime(): PluginRuntime | null {
  return runtime;
}
