# Sparkl Portal

Standalone Next.js app for Hub EVM provider (`/p`) and consumer (`/c`) flows. On-chain contracts and Foundry tooling live in the sibling repo **`sparkl-solo`** (default path `~/sparkl-solo`).

## Prerequisites

- Node.js **20.19+** or **22.13+** (recommended; Yarn may warn on older minors).
- Yarn **1.x**.
- Foundry **`forge`** on `PATH` if you run ABI sync.

## Setup

```bash
yarn install
cp .env.example .env.local
```

Edit `.env.local`: set **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** ([WalletConnect Cloud](https://cloud.walletconnect.com/)), **`NEXT_PUBLIC_CHAIN_ENV`**, and the **`NEXT_PUBLIC_*`** RPC / contract addresses for that profile (see comments in `.env.example`). Local Anvil defaults assume **`31337`** and **`http://127.0.0.1:8545`** when RPC / chain id are omitted for **`assethub-dev-stub`**.

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Contract ABIs

JSON ABIs live under **`lib/abi/`**. After changing Solidity in `sparkl-solo/contracts`, regenerate:

```bash
yarn abis:sync
```

This runs **`scripts/sync-abis.sh`**, which uses **`SPARKL_SOLO`** (default **`$HOME/sparkl-solo`**) and **`forge build`** / **`forge inspect … abi --json`**.

## SDK layout

| Module | Role |
|--------|------|
| **`lib/chains.ts`** | Resolves active Hub env → RPC, chain id, registry / escrow addresses |
| **`lib/wagmi.ts`** | RainbowKit + wagmi config |
| **`lib/evm/registry.ts`** | `ProviderRegistry` reads/writes + `getAllProviders` (logs or dev address list) |
| **`lib/evm/escrow.ts`** | `SettlementEscrow` balances, deposits, sessions, settle helpers |
| **`lib/evm/dotUnits.ts`** | Native Planck (10 decimals) ↔ internal DOT (18 decimals) |
