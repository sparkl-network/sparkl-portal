#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLO="${SPARKL_SOLO:-${HOME}/sparkl-solo}"

cd "${SOLO}/contracts"
forge build
mkdir -p "${ROOT}/lib/abi"
forge inspect ProviderRegistry abi --json > "${ROOT}/lib/abi/ProviderRegistry.json"
forge inspect SettlementEscrow abi --json > "${ROOT}/lib/abi/SettlementEscrow.json"
echo "Synced ABIs into ${ROOT}/lib/abi"
