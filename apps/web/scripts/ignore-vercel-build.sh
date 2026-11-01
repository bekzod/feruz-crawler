#!/bin/sh
# The ignored step runs before installation; Bun projects may not expose Node yet.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
if command -v node >/dev/null 2>&1; then
  node "$script_dir/ignore-vercel-preview.mjs"
elif command -v bun >/dev/null 2>&1; then
  bun "$script_dir/ignore-vercel-preview.mjs"
else
  echo "[vercel-build] No JavaScript runtime available; building conservatively"
  exit 1
fi
code=$?
# Vercel expects exactly 0 (skip) or 1 (build), not an unexpected runtime code.
if [ "$code" -eq 0 ]; then exit 0; fi
exit 1
