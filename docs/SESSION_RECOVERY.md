# Session recovery (portal)

Consumer flows for lost or compromised Sparkl API keys (`sk_…`) live at **`/sessions`** in sparkl-portal.

## Scenarios

| Situation | Action |
|-----------|--------|
| Misplaced key, session still open, no theft suspected | **Show API key again** — wallet signs activate; router returns credential for same `sessionId`. |
| Key may be stolen | **Migrate** — settle old session, `openSession` (new id), activate → new key. |
| Done with session / refund remainder | **Close session** — `settleFull` drains lock. |

On-chain, a closed session has `settled == true` and `lockedInternal == 0` after `settleFull` (or partial settles until drained).

## Configuration

```bash
# .env.local
NEXT_PUBLIC_SPARKL_ROUTER_URL=http://127.0.0.1:8080   # UI hints
SPARKL_ROUTER_URL=http://127.0.0.1:8080               # /api/router-activate proxy
NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK=0              # optional log scan start
```

Run [sparkl-router](https://github.com/sparkl-network/sparkl-router) with chain watcher pointed at the same escrow as the portal.

## Manual check (Anvil)

1. Fund user via `/user` deposit.
2. `openSession` on a registered node (wallet tx or future node UI).
3. Activate via `/sessions` → show API key.
4. **Close** — confirm `settled` on session row; router activate on old id should fail.
5. **Migrate** on another open session — two txs + activate; new session id and new key.

Unit tests: `yarn test` (`lib/evm/sessionSettle.test.ts`).

## Security notes

- Re-activate on the **same** open session does not rotate secrets if the node uses deterministic HMAC (`sessionId` + user).
- Portal does not persist `apiKey` in `localStorage`.
- `/api/router-activate` is rate-limited per IP.
