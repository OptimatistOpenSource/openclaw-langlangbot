#!/usr/bin/env bash
# Install LangLangBot sidecar binary + OpenClaw plugin (pairing is a separate step).
set -euo pipefail

LANGLANGBOT_VERSION="${LANGLANGBOT_VERSION:-}"
RELEASE_BASE="${LANGLANGBOT_RELEASE_BASE:-}"
NPM_PKG="${LANGLANGBOT_NPM_PKG:-}"
INSTALL_BIN="${LANGLANGBOT_INSTALL_BIN:-$HOME/.local/bin}"
OPENCLAW_PLUGIN_ID="langlangbot"
TMPDIRS=()

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
cleanup() {
  local dir
  for dir in "${TMPDIRS[@]}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

usage() {
  cat <<'USAGE'
Install LangLangBot sidecar binary and OpenClaw plugin.

Usage:
  install.sh [--version vX.Y.Z[-rc.N]] [--install-bin DIR]

Options:
  --version VERSION      Install a specific release, including RC tags such as v0.1.8-rc.2.
  --install-bin DIR      Install langlangbot binary into DIR.
  --release-base URL     Override the binary release base URL.
  --npm-pkg SPEC         Override the OpenClaw npm package spec.
  -h, --help             Show this help.

Environment:
  LANGLANGBOT_VERSION       Same as --version.
  LANGLANGBOT_INSTALL_BIN   Same as --install-bin.
  LANGLANGBOT_RELEASE_BASE  Overrides the binary release base URL.
  LANGLANGBOT_NPM_PKG       Overrides the OpenClaw npm package spec.

Examples:
  curl -fsSL https://optimatist.ai/langlangbot/install.sh | bash
  curl -fsSL https://optimatist.ai/langlangbot/install.sh | bash -s -- --version v0.1.8-rc.2
  curl -fsSL https://optimatist.ai/langlangbot/install.sh | LANGLANGBOT_VERSION=v0.1.8-rc.2 bash
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        [[ $# -ge 2 ]] || die "--version requires a value"
        LANGLANGBOT_VERSION="$2"
        shift 2
        ;;
      --version=*)
        LANGLANGBOT_VERSION="${1#*=}"
        shift
        ;;
      --install-bin)
        [[ $# -ge 2 ]] || die "--install-bin requires a value"
        INSTALL_BIN="$2"
        shift 2
        ;;
      --install-bin=*)
        INSTALL_BIN="${1#*=}"
        shift
        ;;
      --release-base)
        [[ $# -ge 2 ]] || die "--release-base requires a value"
        RELEASE_BASE="$2"
        shift 2
        ;;
      --release-base=*)
        RELEASE_BASE="${1#*=}"
        shift
        ;;
      --npm-pkg)
        [[ $# -ge 2 ]] || die "--npm-pkg requires a value"
        NPM_PKG="$2"
        shift 2
        ;;
      --npm-pkg=*)
        NPM_PKG="${1#*=}"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done
}

resolve_install_targets() {
  if [[ -n "$LANGLANGBOT_VERSION" ]]; then
    [[ "$LANGLANGBOT_VERSION" == v* ]] || die "--version must start with v, e.g. v0.1.8-rc.2"
  fi

  if [[ -z "$RELEASE_BASE" ]]; then
    if [[ -n "$LANGLANGBOT_VERSION" ]]; then
      RELEASE_BASE="https://optimatist.ai/langlangbot/releases/${LANGLANGBOT_VERSION}"
    else
      RELEASE_BASE="https://optimatist.ai/langlangbot/releases/latest"
    fi
  fi

  if [[ -z "$NPM_PKG" ]]; then
    if [[ -n "$LANGLANGBOT_VERSION" ]]; then
      NPM_PKG="@optimatist/langlangbot-openclaw@${LANGLANGBOT_VERSION#v}"
    else
      NPM_PKG="@optimatist/langlangbot-openclaw@latest"
    fi
  fi
}

detect_artifact() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os/$arch" in
    Linux/x86_64|Linux/amd64) echo "langlangbot-linux-x64" ;;
    Linux/aarch64|Linux/arm64) echo "langlangbot-linux-arm64" ;;
    Darwin/arm64|Darwin/aarch64) echo "langlangbot-macos-arm64" ;;
    *) die "unsupported platform $os/$arch (Linux x64/arm64 and macOS arm64 supported in v1)" ;;
  esac
}

install_binary() {
  local artifact tarball url tmpdir checksum_file expected
  artifact="$(detect_artifact)"
  tarball="${artifact}.tar.gz"
  url="${RELEASE_BASE}/${tarball}"
  tmpdir="$(mktemp -d)"
  TMPDIRS+=("$tmpdir")

  log "Downloading ${url}"
  curl -fL --progress-bar "$url" -o "${tmpdir}/${tarball}"

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
    TMPDIRS+=("$packdir")
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
cfg.channels.langlangbot.sidecarUrl ??= "https://127.0.0.1:9528";
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
  parse_args "$@"
  resolve_install_targets
  need_cmd curl
  if [[ -n "$LANGLANGBOT_VERSION" ]]; then
    log "Installing LangLangBot ${LANGLANGBOT_VERSION}"
  else
    log "Installing latest stable LangLangBot"
  fi
  install_binary
  install_openclaw_plugin
  log ""
  log "Install complete."
  log "Next: on iOS Operator, copy the pair command shown for your Agent, then run:"
  log "  langlangbot pair --id <agent_surface_id>"
}

main "$@"
