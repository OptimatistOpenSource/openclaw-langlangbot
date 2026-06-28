# OpenClaw configuration

Minimal `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "langlangbot": { "enabled": true }
    }
  },
  "channels": {
    "langlangbot": {
      "enabled": true,
      "sidecarUrl": "https://127.0.0.1:9528",
      "autoStartSidecar": true,
      "streaming": true
    }
  },
  "approvals": {
    "exec": { "enabled": true, "mode": "session" },
    "plugin": { "enabled": true, "mode": "session" }
  }
}
```

## Channel fields

| Field | Default | Description |
|-------|---------|-------------|
| `sidecarUrl` | `https://127.0.0.1:9528` | LangLangBot HTTPS listen URL |
| `autoStartSidecar` | `true` | Start sidecar when the gateway enables this channel |
| `sidecarBinary` | (auto-detect) | Path to `langlangbot` binary |
| `sidecarEnvPath` | `~/.langlangbot/env` | Env file for sidecar (surface id from pairing) |
| `pluginToken` | optional | Shared secret for plugin-only API routes |
| `sidecarInsecureTls` | `true` on loopback | Trust local self-signed TLS |
| `streaming` | `true` | Stream assistant deltas to Operator SSE |

LangLangBot serves HTTPS by default. Use `http://` only when the sidecar runs with dev HTTP mode.

## Approvals

Operator approvals use the same LangLangBot session. Enable `approvals.exec` and
`approvals.plugin` with `mode: "session"` so OpenClaw routes approval prompts to the Operator
client.

Skill reference: `packages/openclaw/skills/langlangbot-channel/SKILL.md`.
