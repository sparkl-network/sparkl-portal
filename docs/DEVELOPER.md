# Portal developer guide

Local development setup for **sparkl-portal** against **Hub EVM** dev chains (including Anvil `31337`). On-chain contracts and Foundry tooling live in the sibling repo **[sparkl-solo](https://github.com/sparkl-network/sparkl-solo)** (`contracts/`).

---

## Initial setup

```bash
yarn install
cp .env.example .env.local
```

Edit `.env.local`: set **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** ([WalletConnect Cloud](https://cloud.walletconnect.com/)), **`NEXT_PUBLIC_CHAIN_ENV`**, and the **`NEXT_PUBLIC_*`** RPC / contract addresses for that profile (see comments in `.env.example`). Local Anvil defaults assume **`31337`** and **`http://127.0.0.1:8545`** when RPC / chain id are omitted for **`assethub-dev-stub`**.

Restart **`yarn dev`** after changing any **`NEXT_PUBLIC_*`** variable so Next.js rebuilds the client bundle with the new values.

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Coinbase Design System Cursor/IDE skills

These give Cursor deep, first‑party knowledge of the Coinbase Design System and its docs.
From your project root, run:

```bash
# Install Coinbase CDS code + docs skills for Cursor / other agents
npx skills add https://github.com/coinbase/cds --skill cds-code --skill cds-docs
```
### Where to put your SKILL.md

Cursor looks for skills in .cursor/skills/<skill-name>/SKILL.md in your project (or ~/.cursor/skills globally)

## Developer wallets and RPC (`assethub-dev-stub`)

The portal cannot choose accounts inside MetaMask, Coinbase Wallet, etc.—configure those wallets yourself:

1. **Run Anvil** (or compatible node) on the machine that listens on **`8545`** (or your chosen port). Anvil does not advertise a “token ticker” or decimals to your wallet—MetaMask uses the network entry from **Switch network** (from **`NEXT_PUBLIC_NATIVE_*`** in the app) or whatever you added manually.
2. **RPC URL must match where the browser runs.** Reads (`wagmi` / viem) use **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`**. Sends use whatever RPC the wallet uses for **chain ID `31337`**. If you open the site as **`http://192.168.x.x:3000`** from **another device**, **`http://127.0.0.1:8545` resolves on that device**, not your dev PC—set both the wallet’s custom network RPC and **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`** to **`http://<your-dev-machine-LAN-IP>:8545`** (and allow it through the firewall). Run **`anvil --host 0.0.0.0`** if peers off-machine must reach it.
3. **Funded dev accounts:** import Foundry’s default Anvil mnemonic (**`test test test test test test test test test test test junk`**) or a dev private key Anvil prints at startup. **Never use these keys outside local development.**

Use **Switch network** in the toolbar until the wallet is on **`31337`** with that RPC; then connect—the active address should be an Anvil-funded account.

If **viem** reports **`Failed to fetch`** or **`withdrawDot` reverted with reason: Failed to fetch**, that is a **browser JSON-RPC HTTP failure**, not an on-chain revert. Enable the **same-origin proxy** (`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1` and `RPC_PROXY_TARGET` in **`.env.example`**) so simulations and **`waitForTransactionReceipt`** use **`/api/rpc`**. The proxy adds **Private Network Access** CORS headers so **MetaMask’s extension** can `fetch` a LAN dev URL; without that, the tab may work while **`eth_sendTransaction`** still fails. Optionally set MetaMask’s network RPC to **`http://<dev-host>:3000/api/rpc`** if the extension cannot reach **`…:8545`**. With **`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY`**, **`hubChainFromConfig`** advertises **`…/api/rpc`** as the default RPC so **Switch network** updates MetaMask to the proxy—**remove** any old **31337** entry that still points only at raw **`:8545`** if submits keep failing with **Failed to fetch**. **Dev tip:** if Next **`[rpc-proxy]`** logs show **`eth_call`** but never **`eth_sendRawTransaction`** after you confirm in MetaMask, the extension is still broadcasting to a **saved** RPC (often **`:8545`**) rather than **`…/api/rpc`**—edit or delete that network entry so the saved RPC matches your portal (**`http(s)://<host>:3000/api/rpc`**).

---

## Anvil restart: redeploy contracts and refresh the portal

**Restarting Anvil wipes chain state.** Contract addresses, registry entries, and escrow balances from the previous run are gone. The portal will keep old **`NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_*`** and **`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*`** values until you update them—reads and writes may target wrong addresses or empty code.

After every Anvil restart (or whenever you start a fresh Anvil):

1. **Start Anvil** (same host/port as in `.env.local`), for example:

   ```bash
   anvil --host 0.0.0.0
   ```

2. **Redeploy the local stack** with Foundry from **`sparkl-solo/contracts/`**. This matches the **“Local chain: Anvil + deploy script”** flow in [`sparkl-solo/contracts/README.md`](https://github.com/sparkl-network/sparkl-solo/blob/main/contracts/README.md#local-chain-anvil--deploy-script):

   ```bash
   cd ../sparkl-solo/contracts   # sibling checkout; adjust path if needed

   forge script script/DeployLocal.s.sol:DeployLocal \
     --rpc-url http://127.0.0.1:8545 \
     --broadcast
   ```

   Match **`--rpc-url`** to your Anvil URL. Override **`PRIVATE_KEY`** only if you are not using Anvil’s default deployer. The script logs **`MockOracle`**, **`MockERC20` (USDC)**, **`ProviderRegistry`**, and **`SettlementEscrow`** addresses. You can also read **`broadcast/DeployLocal.s.sol/31337/run-latest.json`** under `contracts/` for the latest broadcast.

3. **Update `sparkl-portal/.env.local`** with the new **`NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_*`** and **`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*`** for your chain profile (and any other **`NEXT_PUBLIC_*`** addresses your profile uses—see the contracts README **sparkl-portal `.env`** examples).

4. **If Solidity changed**, refresh ABIs: from **`sparkl-portal`**, run **`yarn abis:sync`** (or copy Forge outputs into **`lib/abi/`** as documented in the main [README](../README.md#contract-abis) and **`contracts/README.md`** § ABI sync).

5. **Restart `yarn dev`** so Next.js reloads **`NEXT_PUBLIC_*`** and rebuilds the client bundle.

---

## Provider probe API (registration)

The portal’s **`POST /api/provider-node-probe`** (used on **Register node**) runs server-side **`GET /status`**, **`GET /v1/models`**, and **`GET /identity`** on the operator’s HTTP origin. It does **not** call operator-private paths such as **`/details`**.

**Registration rule:** after a successful probe, the transaction **`nodeId`** must be the **`node_id`** from **`/identity`** (Hub EVM canonical **`bytes32`** = **`keccak256(ed25519_pubkey)`** from sparkl-solo). The UI enables **Register on-chain** only when your peer-id / hex field matches that **`/identity`** payload. On-chain **`metadataURI`** is stored as versioned JSON (`version`, `baseUrl`, optional **`peer_id`** / **`node_id`**) so **`parseMetadataUri`** can recover the HTTP origin for probes and directory enrichment (**`GET /identity`** for **`peer_id`**).

---

## Related docs

- **[README.md](../README.md)** — prerequisites, routes, CDS, funding semantics, **`yarn abis:sync`**.
- **`sparkl-solo/contracts/README.md`** — one-time **`forge install`**, **`forge build` / `forge test`**, full Anvil deploy output, Paseo, oracle notes.
