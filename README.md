# 🦠 $VIRUS — This Will Spread

> **It's spreading and eating the supply alive.** 🔥

Every 5 minutes, the bot:

1. **Claims** pump.fun creator fees for `$VIRUS`
2. **Snapshots** every wallet holding `$VIRUS` (the "infected")
3. **Spins a wheel** where slice size = how much $VIRUS the wallet holds
4. **Pays the winner 50% of the claim in pure SOL** through 2 ephemeral hop wallets
5. **Routes 30% to marketing** to keep the spread going
6. **Spends 20% buying back $VIRUS and incinerating it on-chain** via SPL `burn` — supply only shrinks

No swaps for the prize. No bridges. No wrapped tokens. Pure SOL straight into the winner's wallet. Real supply burned every cycle.

## 🛡 Safety: the dev's SOL is provably untouchable

The bot's spending budget is a decoupled accounting variable (`claimPoolLamports`) that only grows by the **measured delta** of `getSolBalance(creator)` immediately before and after each claim. It only shrinks by actual paid lamports. The dev wallet's pre-existing SOL — or any SOL the dev deposits or earns separately — is **outside the bot's budget by construction**.

Three additional guards:

| Guard | Default | Effect |
|---|---|---|
| `WINNER_PERCENT` | 50% | Of each claim, this % goes to the winner; the rest to marketing. |
| `MAX_SOL_PER_CYCLE` | 5 SOL | Hard ceiling on a single payout, regardless of pool size. |
| Runtime assert | always on | If split > pool the cycle aborts before any tx is sent. |

There's also a 3-retry path on the prize send with fresh hop wallets on each attempt, and the send polls confirmation + falls back to history-search before declaring failure — same pattern Troll Wheel used to fix its phantom-failure bug.

**Recommendation for production:** separate `BUYER_WALLET_PRIVATE_KEY` from the creator wallet. The buyer wallet then only ever holds claim-derived SOL.

## 🦠 The 2-hop quarantine routing

The prize doesn't go buyer → winner directly. It goes:

```
buyer ──→ hop1 ──→ hop2 ──→ winner
```

All three transfers are bundled into **one atomic transaction** signed by buyer + hop1 + hop2. Solana txs are all-or-nothing, so SOL can never get stranded — every transfer succeeds together or none do. Each hop receives exactly the prize amount and passes exactly the prize amount along, ending at 0 SOL (Solana auto-garbage-collects empty system accounts). **Nothing left behind.**

On-chain the explorer sees buyer → hop1 → hop2 → winner with no direct buyer→winner edge.

## 📊 The dashboard

Boots automatically on `PORT` (default 3000). Shows:

- **Animated petri-dish wheel** with one slice per infected wallet, sized by holdings. The virus logo sits in the hub, pulsing.
- **Live countdown** to the next outbreak with a 🧪 sampling warning in the last 10s.
- **PATIENT ZERO** winner card overlaying the wheel after each spin, showing the prize SOL + tx receipt.
- **People infected**, **Total SOL spread**, **Outbreaks run**, **Next pot** stat strip.
- **Infection Log** table: every past winner with cycle #, slice size, quarantine hop wallets, and Solscan receipt.
- **Most Infected** leaderboard ranked by SOL banked.
- **Live Lab Feed** — claim, sample, spin, infect, marketing events.

## Local setup

```bash
git clone <your repo>
cd virus
cp .env.example .env       # fill in REQUIRED env vars below
npm install
npm run dev                # boots bot + dashboard at http://localhost:3000
```

### Required env vars

| Key | What |
|---|---|
| `SOLANA_RPC_URL` | Paid RPC (Helius / QuickNode / Triton). Free RPCs disable `getProgramAccounts` which is needed for holder snapshots. |
| `CREATOR_WALLET_PRIVATE_KEY` | The pump.fun creator wallet's secret key (base58 OR JSON array). Owns the $VIRUS mint and can claim creator fees. |

### Optional env vars

| Key | Default | Notes |
|---|---|---|
| `BUYER_WALLET_PRIVATE_KEY` | (creator) | Separate buyer wallet — **strongly recommended** for production. |
| `MARKETING_WALLET` | (creator) | Pubkey to receive the marketing 50%. If unset, marketing slice stays in buyer wallet. |
| `VIRUS_MINT` | `auto` | The $VIRUS mint. `auto` watches the creator wallet and adopts whichever pump.fun token it launches. |
| `CYCLE_INTERVAL_SECONDS` | `300` | 300 = 5 min. |
| `SNAPSHOT_LEAD_SECONDS` | `10` | Snapshot lead time before the spin (dashboard countdown). |
| `WINNER_PERCENT` | `50` | % of each claim paid to the winner. Rest goes to marketing. |
| `MAX_SOL_PER_CYCLE` | `5` | Hard ceiling on a single payout. |
| `MIN_PRIZE_SOL` | `0.005` | Skip cycle if 50% slice falls below this. |
| `MAX_HOLDER_SHARE_PCT` | `20` | Auto-exclude wallets holding > this % of supply. |
| `EXCLUDE_WALLETS` | `` | Comma-separated extra wallets to skip (LP, treasury, dev). |
| `MAX_HOLDERS_ON_WHEEL` | `200` | Holders past this cap grouped into "OTHERS" slice. |
| `PRIORITY_FEE` | `0.0005` | SOL of priority fee on each tx. |
| `STATE_DIR` | `./data` | Where dashboard state is persisted. **Set this to `/data` on Railway.** |
| `PORT` | `3000` | Dashboard port. |

## 🚂 Deploying to Railway (stats persist across deploys)

State (spendable pool, totals, winner history, leaderboard) lives in `STATE_DIR/state.json`. To survive `git push` redeploys, that directory must live on a **persistent volume**.

1. **Push the repo to GitHub** (the `data/` folder is gitignored, so state never gets committed).
2. In Railway, **New Project → Deploy from GitHub repo** → pick the repo.
3. **Add a Volume**: Settings → Volumes → **+ New Volume**, mount path `/data`.
4. **Add env vars** in Settings → Variables:
   - `SOLANA_RPC_URL`
   - `CREATOR_WALLET_PRIVATE_KEY`
   - `VIRUS_MINT=auto` (or paste the mint)
   - `MARKETING_WALLET` (recommended)
   - `STATE_DIR=/data` ← **critical** — points state at the volume
5. **Deploy.** Generate a public domain in Settings → Networking.

On each subsequent `git push`, Railway rebuilds the image but `/data/state.json` is untouched. The tracker reads it on boot and resumes with all totals, infections, and leaderboard intact.

### Safety rails

- **If `CREATOR_WALLET_PRIVATE_KEY` changes** between boots, the bot detects it and wipes counters automatically (the "I'm relaunching with a fresh token" reset). Keep it stable across deploys to preserve state.
- **Manual wipe**: set `RESET_STATE=1` env var → boot once → unset.
- **Manual top-up**: `TOPUP_POOL_LAMPORTS=500000000` (= 0.5 SOL) → boot once → idempotent. Use to seed the pool off-cycle.

## Architecture

```
src/
  index.ts          # Cycle loop: claim → forward → snapshot → spin → split-send
  config.ts         # Env vars
  wallet.ts         # Solana connection + Keypair loaders + balance helpers
  logger.ts         # Timestamped console logger
  claim-rewards.ts  # PumpPortal "collectCreatorFee" call
  forwarder.ts      # Forward exactly claimed lamports creator → buyer
  mint-watcher.ts   # Detect when the creator wallet launches a pump.fun token
  holders.ts        # On-chain $VIRUS holder snapshot (SPL + Token-2022)
  wheel.ts          # Slice layout + crypto-strong weighted-random winner pick
  sender.ts         # Atomic 2-hop SOL prize delivery + marketing routing
  activity.ts       # Tracker / state.json / events / per-holder ledger
  dashboard.ts      # Express server + the virus-themed HTML dashboard
public/
  virus-logo.png    # The 🦠 mark used in branding + wheel hub + favicon
```

## License

MIT — let it spread.
