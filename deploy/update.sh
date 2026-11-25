#!/usr/bin/env bash
# Pull the latest code, rebuild and restart. Run on the server as the deploy user:
#   sudo -u lineup /opt/lineup/deploy/update.sh && sudo systemctl restart lineup
# Note: games in progress are kept in memory and are lost on restart.
set -euo pipefail
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd "$(dirname "$0")/.."
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
echo "Build complete. Now run: sudo systemctl restart lineup"
