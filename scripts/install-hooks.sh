#!/usr/bin/env bash
# Point git at the repo's tracked hooks.
#
# .git/hooks is not version-controlled, so hooks placed there are invisible to
# everyone else and silently absent on a fresh clone. core.hooksPath lets the hooks
# live in the tree and travel with it.
#
# Run once per clone:  bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

chmod +x .githooks/* 2>/dev/null || true
git config core.hooksPath .githooks

echo "hooks installed: core.hooksPath = .githooks"
echo ""
echo "  pre-push → scripts/ci-local.sh"
echo ""
echo "Bridge runs no cloud CI. This hook is the gate, so a red gate stops the push"
echo "rather than being discovered later by a reviewer."
