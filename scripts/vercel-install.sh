#!/bin/sh
set -eu

# Vercel's Bun build image need not contain Node, npm or npx. Install the
# official Linux x64 binary directly; this package has no postinstall script.
toolchain=/tmp/catetin-bun-1.4.4
mkdir -p "$toolchain"
bun add --cwd "$toolchain" --exact --ignore-scripts @oven/bun-linux-x64@1.4.4

pinned_bun="$toolchain/node_modules/@oven/bun-linux-x64/bin/bun"
"$pinned_bun" --version
"$pinned_bun" --bun install --frozen-lockfile
