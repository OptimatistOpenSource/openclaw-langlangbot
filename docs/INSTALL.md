# Install

## One-line setup (Linux)

Installs the LangLangBot sidecar binary and this OpenClaw plugin, then configures
`~/.openclaw/openclaw.json`:

```bash
curl -fsSL https://optimatist.ai/langlangbot/install.sh | bash
```

## Pair with Operator

After install, run the pair command shown in the LangLang Operator app:

```bash
langlangbot pair --id <agent_surface_id>
```

Confirm the confirmation code and TLS fingerprint in the app when prompted.

## Plugin only

If the sidecar is already installed:

```bash
openclaw plugins install @optimatist/langlangbot-openclaw@latest
openclaw gateway restart
openclaw channels status
```

## Verify plugin load

```bash
node -e "import('$HOME/.openclaw/extensions/langlangbot/dist/index.js').then(()=>console.log('OK')).catch(e=>console.error(e.message))"
```

Rebuild and reinstall after local changes:

```bash
npm run build
openclaw plugins install . --force   # from packages/openclaw
openclaw gateway restart
```
