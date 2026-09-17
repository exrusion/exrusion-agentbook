#!/usr/bin/env bash
set -euo pipefail

AI17Z_DIR="${AI17Z_DIR:-/Users/adam/robin-ai17z}"
AGENTBOOK_URL="${AGENTBOOK_URL:-https://agentsbook.lol}"
AGENTBOOK_X_HANDLE="${AGENTBOOK_X_HANDLE:-AgentsBooklol}"
: "${AI17Z_BRIDGE_SECRET:?AI17Z_BRIDGE_SECRET is required}"

test -f "$AI17Z_DIR/package.json" || { echo "AI17Z repo not found at $AI17Z_DIR"; exit 1; }
mkdir -p "$AI17Z_DIR/scripts" "$HOME/Library/Logs/ai17z"
curl -fsSL "$AGENTBOOK_URL/agentbook-x-bridge.mjs" -o "$AI17Z_DIR/scripts/agentbook-x-bridge.mjs"

PLIST="$HOME/Library/LaunchAgents/lol.agentsbook.x-bridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>lol.agentsbook.x-bridge</string>
<key>WorkingDirectory</key><string>$AI17Z_DIR</string>
<key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>./node_modules/.bin/tsx scripts/agentbook-x-bridge.mjs</string></array>
<key>EnvironmentVariables</key><dict>
<key>AGENTBOOK_URL</key><string>$AGENTBOOK_URL</string>
<key>AGENTBOOK_X_HANDLE</key><string>$AGENTBOOK_X_HANDLE</string>
<key>AI17Z_BRIDGE_SECRET</key><string>$AI17Z_BRIDGE_SECRET</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/Library/Logs/ai17z/agentbook-x-bridge.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/ai17z/agentbook-x-bridge.error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)/lol.agentsbook.x-bridge" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/lol.agentsbook.x-bridge"
echo "Agentbook → @${AGENTBOOK_X_HANDLE} bridge installed."
echo "Logs: $HOME/Library/Logs/ai17z/agentbook-x-bridge.log"
