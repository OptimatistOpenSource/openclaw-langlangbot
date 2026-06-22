#!/usr/bin/env bash
# Install LangLangBot sidecar binary + OpenClaw plugin (pairing is a separate step).
set -euo pipefail

RELEASE_BASE="${LANGLANGBOT_RELEASE_BASE:-https://optimatist.ai/langlangbot/releases/latest}"
NPM_PKG="${LANGLANGBOT_NPM_PKG:-@optimatist/langlangbot-openclaw@latest}"
INSTALL_BIN="${LANGLANGBOT_INSTALL_BIN:-$HOME/.local/bin}"
OPENCLAW_PLUGIN_ID="langlangbot"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

detect_artifact() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os/$arch" in
    Linux/x86_64|Linux/amd64) echo "langlangbot-linux-x64" ;;
    Linux/aarch64|Linux/arm64) echo "langlangbot-linux-arm64" ;;
    *) die "unsupported platform $os/$arch (Linux x64/arm64 only in v1)" ;;
  esac
}

install_binary() {
  local artifact tarball url tmpdir checksum_file expected
  artifact="$(detect_artifact)"
  tarball="${artifact}.tar.gz"
  url="${RELEASE_BASE}/${tarball}"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  log "Downloading ${url}"
  curl -fsSL "$url" -o "${tmpdir}/${tarball}"

  checksum_file="${tmpdir}/SHA256SUMS"
  if curl -fsSL "${RELEASE_BASE}/SHA256SUMS" -o "$checksum_file" 2>/dev/null; then
    expected="$(grep " ${tarball}$" "$checksum_file" | awk '{print $1}')"
    if [[ -n "$expected" ]]; then
      echo "${expected}  ${tmpdir}/${tarball}" | sha256sum -c -
    fi
  else
    log "WARN: SHA256SUMS not found; skipping checksum verification"
  fi

  tar -xzf "${tmpdir}/${tarball}" -C "$tmpdir"
  mkdir -p "$INSTALL_BIN"
  install -m 755 "${tmpdir}/langlangbot" "${INSTALL_BIN}/langlangbot"
  log "Installed ${INSTALL_BIN}/langlangbot"
  if [[ ":$PATH:" != *":${INSTALL_BIN}:"* ]]; then
    log "Add to PATH: export PATH=\"${INSTALL_BIN}:\$PATH\""
  fi
}

install_openclaw_plugin() {
  need_cmd openclaw
  need_cmd npm
  log "Installing OpenClaw plugin ${NPM_PKG}"
  openclaw plugins uninstall "$OPENCLAW_PLUGIN_ID" 2>/dev/null || true
  openclaw plugins install "$NPM_PKG" || {
    log "Level 1 install failed; trying npm pack fallback"
    local packdir tgz
    packdir="$(mktemp -d)"
    npm pack "$NPM_PKG" --pack-destination "$packdir"
    tgz="$(find "$packdir" -maxdepth 1 -name '*.tgz' | head -1)"
    tar -xzf "$tgz" -C "$packdir"
    openclaw plugins install "$packdir"/package
  }

  if command -v node >/dev/null 2>&1; then
    node <<'NODE' || true
const fs = require("fs");
const path = require("path");
const home = process.env.HOME || "";
const cfgPath = path.join(home, ".openclaw", "openclaw.json");
if (!fs.existsSync(cfgPath)) process.exit(0);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
cfg.plugins ??= {};
cfg.plugins.entries ??= {};
cfg.plugins.entries.langlangbot = { enabled: true };
cfg.channels ??= {};
cfg.channels.langlangbot ??= {};
cfg.channels.langlangbot.enabled = true;
cfg.channels.langlangbot.sidecarUrl ??= "https://127.0.0.1:4317";
cfg.channels.langlangbot.sidecarBinary ??= path.join(home, ".local", "bin", "langlangbot");
cfg.channels.langlangbot.autoStartSidecar = true;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("Updated ~/.openclaw/openclaw.json for langlangbot channel");
NODE
  fi

  if openclaw gateway restart >/dev/null 2>&1; then
    log "Restarted OpenClaw gateway"
  else
    log "Start gateway manually: openclaw gateway restart"
  fi
}

main() {
  need_cmd curl
  install_binary
  install_openclaw_plugin
  log ""
  log "Install complete."
  log "Next: on iOS Operator, copy the pair command shown for your Agent, then run:"
  log "  langlangbot pair --id <agent_surface_id>"
}

main "$@"
