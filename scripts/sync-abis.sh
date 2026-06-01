#!/usr/bin/env bash
set -euo pipefail

NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "${NETWORK_ROOT}/scripts/sync-contract-abis.sh" "$@"
