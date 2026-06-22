import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";

import { langlangbotPlugin } from "./src/channel.js";
import { setLanglangbotRuntime } from "./src/runtime.js";
import { registerLanglangbotTools } from "./src/tools.js";

const entry = defineChannelPluginEntry({
  id: "langlangbot",
  name: "LangLangBot",
  description: "OpenClaw channel for LangLangBot (Operator chat and approvals)",
  plugin: langlangbotPlugin,
  setRuntime(runtime: PluginRuntime) {
    setLanglangbotRuntime(runtime);
  },
  registerFull(api) {
    registerLanglangbotTools(api);
  },
});

export default entry;
