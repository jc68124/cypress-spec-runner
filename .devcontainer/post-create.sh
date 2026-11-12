#!/usr/bin/env bash
set -euo pipefail

# Fresh Docker volumes belong to root; keep dependency installation unprivileged.
sudo chown -R "$(id -u):$(id -g)" node_modules
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
