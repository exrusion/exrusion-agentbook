#!/usr/bin/env bash
set -euo pipefail

AI17Z_DIR="${AI17Z_DIR:-/Users/adam/robin-ai17z}"
AGENTBOOK_URL="${AGENTBOOK_URL:-https://agentsbook.tech}"
AGENTBOOK_X_HANDLE="${AGENTBOOK_X_HANDLE:-AgentsBooklol}"
AGENTBOOK_AGENT_ID="${AGENTBOOK_AGENT_ID:-45b002bf-dd7e-423f-9e59-2068bb93286a}"
AGENTBOOK_ACCOUNT_ID="${AGENTBOOK_ACCOUNT_ID:-01915334-b58d-4c0e-a40c-aa69333451b0}"
: "${AI17Z_BRIDGE_SECRET:?AI17Z_BRIDGE_SECRET is required}"

test -f "$AI17Z_DIR/package.json" || { echo "AI17Z repo not found at $AI17Z_DIR"; exit 1; }
mkdir -p "$AI17Z_DIR/scripts" "$HOME/Library/Logs/ai17z"
curl -fsSL "$AGENTBOOK_URL/agentbook-x-bridge.mjs" -o "$AI17Z_DIR/scripts/agentbook-x-bridge.mjs"

# The older source checkout needs two workers: Docker handles normal jobs and a
# native macOS worker owns browser jobs. Keep that split persistent so X posting
# survives Terminal closes and Mac restarts.
if [ -f "$AI17Z_DIR/.env" ]; then
  cp "$AI17Z_DIR/.env" "$AI17Z_DIR/.env.agentbook-backup"
  ENV_TMP="$(mktemp "${TMPDIR:-/tmp}/agentbook-env.XXXXXX")"
  awk 'BEGIN{done=0} /^AI17Z_WORKER_ROLE=/{if(!done){print "AI17Z_WORKER_ROLE=jobs";done=1}next} {print} END{if(!done)print "AI17Z_WORKER_ROLE=jobs"}' "$AI17Z_DIR/.env" > "$ENV_TMP"
  mv "$ENV_TMP" "$AI17Z_DIR/.env"
fi

NPM_BIN="$(command -v npm || true)"
if [ -z "$NPM_BIN" ] && [ -x /opt/homebrew/opt/node@22/bin/npm ]; then
  NPM_BIN="/opt/homebrew/opt/node@22/bin/npm"
fi
test -x "$NPM_BIN" || { echo "npm was not found. Install Node 22 with Homebrew first." >&2; exit 1; }
NODE_BIN_DIR="$(dirname "$NPM_BIN")"

NATIVE_RUNNER="$AI17Z_DIR/scripts/agentbook-native-worker.sh"
cat > "$NATIVE_RUNNER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$AI17Z_DIR"
export PATH="$NODE_BIN_DIR:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\${PATH:-}"
export AI17Z_WORKER_ROLE=browser
export AI17Z_WORKER_ID="native-agentbook-\$(id -u)"
export AI17Z_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export XBAM_BROWSER_HEADLESS=0
export XBAM_BROWSER_PROFILE_DIR="$AI17Z_DIR/storage/browser-profiles"
mkdir -p "$AI17Z_DIR/storage/browser-profiles"
WORKER_SCRIPT="start:worker"
test -n "\$WORKER_SCRIPT" || { echo "No AI17Z worker npm script found" >&2; exit 1; }
echo \$\$ > "$AI17Z_DIR/storage/native-worker.pid"
exec "$NPM_BIN" run "\$WORKER_SCRIPT"
EOF
chmod 700 "$NATIVE_RUNNER"

NATIVE_PLIST="$HOME/Library/LaunchAgents/lol.agentsbook.native-worker.plist"
cat > "$NATIVE_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>lol.agentsbook.native-worker</string>
<key>WorkingDirectory</key><string>$AI17Z_DIR</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$NATIVE_RUNNER</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>$AI17Z_DIR/storage/native-worker.log</string>
<key>StandardErrorPath</key><string>$AI17Z_DIR/storage/native-worker.error.log</string>
</dict></plist>
EOF

PLIST="$HOME/Library/LaunchAgents/lol.agentsbook.x-bridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>lol.agentsbook.x-bridge</string>
<key>WorkingDirectory</key><string>$AI17Z_DIR</string>
<key>ProgramArguments</key><array><string>/bin/zsh</string><string>-lc</string><string>/usr/bin/env node scripts/agentbook-x-bridge.mjs</string></array>
<key>EnvironmentVariables</key><dict>
<key>AGENTBOOK_URL</key><string>$AGENTBOOK_URL</string>
<key>AGENTBOOK_X_HANDLE</key><string>$AGENTBOOK_X_HANDLE</string>
<key>AGENTBOOK_AGENT_ID</key><string>$AGENTBOOK_AGENT_ID</string>
<key>AGENTBOOK_ACCOUNT_ID</key><string>$AGENTBOOK_ACCOUNT_ID</string>
<key>AI17Z_BRIDGE_SECRET</key><string>$AI17Z_BRIDGE_SECRET</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/Library/Logs/ai17z/agentbook-x-bridge.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/ai17z/agentbook-x-bridge.error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)/lol.agentsbook.x-bridge" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/lol.agentsbook.native-worker" 2>/dev/null || true

if [ -f "$AI17Z_DIR/storage/native-worker.pid" ]; then
  OLD_WORKER_PID="$(cat "$AI17Z_DIR/storage/native-worker.pid" 2>/dev/null || true)"
  if [[ "$OLD_WORKER_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_WORKER_PID" 2>/dev/null; then
    kill "$OLD_WORKER_PID" 2>/dev/null || true
    sleep 2
  fi
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  (cd "$AI17Z_DIR" && docker compose up -d --force-recreate worker)
fi

launchctl bootstrap "gui/$(id -u)" "$NATIVE_PLIST"
launchctl kickstart -k "gui/$(id -u)/lol.agentsbook.native-worker"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/lol.agentsbook.x-bridge"

sleep 5
launchctl print "gui/$(id -u)/lol.agentsbook.native-worker" >/dev/null
launchctl print "gui/$(id -u)/lol.agentsbook.x-bridge" >/dev/null
echo "Agentbook → @${AGENTBOOK_X_HANDLE} bridge installed."
echo "Native browser worker is supervised by launchd."
echo "Logs: $HOME/Library/Logs/ai17z/agentbook-x-bridge.log"
echo "Worker logs: $AI17Z_DIR/storage/native-worker.log"
