#!/usr/bin/env bash
# Scaffold esbuild src/ layout for an application/* game monolith.
# Usage: ./scripts/split-application-js.sh <app-name>
# Example: ./scripts/split-application-js.sh monster-fight
set -euo pipefail

APP="${1:-}"
if [[ -z "$APP" ]]; then
  echo "Usage: $0 <app-name>   (e.g. monster-fight, tactics-fighter)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/application/$APP"
MONO="$DIR/$APP.js"
SRC="$DIR/src"

if [[ ! -f "$MONO" ]]; then
  echo "Missing monolith: $MONO" >&2
  exit 1
fi

mkdir -p "$SRC"
if [[ ! -f "$SRC/game-legacy.js ]] && [[ ! -f "$SRC/app-legacy.js ]]; then
  cp "$MONO" "$SRC/game-legacy.js" 2>/dev/null || cp "$MONO" "$SRC/app-legacy.js"
  echo "Copied $MONO -> $SRC/*-legacy.js"
fi

if [[ ! -f "$SRC/main.js ]]; then
  cat > "$SRC/main.js" <<'EOF'
/** Browser bundle entry — esbuild bundles this to ../<app>.js */
import './game-legacy.js';
EOF
  # tactics-fighter uses app-legacy.js
  if [[ "$APP" == "tactics-fighter" ]]; then
    sed -i '' "s/game-legacy/app-legacy/" "$SRC/main.js" 2>/dev/null || sed -i "s/game-legacy/app-legacy/" "$SRC/main.js"
  fi
  echo "Created $SRC/main.js"
fi

SCRIPT="build:${APP//-/_}"
SCRIPT="${SCRIPT//_/-}"
# normalize: monster-fight -> build:monster-fight
SCRIPT="build:$APP"

echo ""
echo "Next steps:"
echo "  1. Extract 2–3 logical chunks from $SRC/*-legacy.js into $SRC/*.js"
echo "  2. Add to package.json: \"$SCRIPT\": \"esbuild application/$APP/src/main.js --bundle --format=iife --outfile=application/$APP/$APP.js\""
echo "  3. pnpm $SCRIPT && pnpm test:application-static"
echo "  4. Document in docs/refactor-phase4-games.md"
