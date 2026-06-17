#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/logs"

cd "$SCRIPT_DIR"
/usr/bin/node "$SCRIPT_DIR/scripts/firebase-live-backup.mjs"
