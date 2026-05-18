import dotenv from "dotenv";
dotenv.config();

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

const exclude = (process.env.EXCLUDE_WALLETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isAuto = (v: string | undefined) =>
  !v || v.trim() === "" || v.trim().toLowerCase() === "auto";

const creatorKey = req("CREATOR_WALLET_PRIVATE_KEY");
const buyerKey = process.env.BUYER_WALLET_PRIVATE_KEY?.trim() || creatorKey;

const virusMintRaw = process.env.VIRUS_MINT?.trim();

export const config = {
  rpcUrl: req("SOLANA_RPC_URL"),

  creatorPrivateKey: creatorKey,
  buyerPrivateKey: buyerKey,
  singleWalletMode: buyerKey === creatorKey,

  // If unset, the marketing slice is left in the buyer wallet for the dev to
  // sweep manually. If set, the bot auto-forwards the marketing slice to this
  // address at the end of every cycle.
  marketingWallet: process.env.MARKETING_WALLET?.trim() || "",

  virusMint: isAuto(virusMintRaw) ? "" : virusMintRaw!,
  autoDetectMint: isAuto(virusMintRaw),
  mintWatchPollSeconds: Number(process.env.MINT_WATCH_POLL_SECONDS || "20"),

  pumpPortalApiKey: process.env.PUMPPORTAL_API_KEY || "",

  cycleIntervalSeconds: Number(process.env.CYCLE_INTERVAL_SECONDS || "300"),
  snapshotLeadSeconds: Number(process.env.SNAPSHOT_LEAD_SECONDS || "10"),
  minPrizeSol: Number(process.env.MIN_PRIZE_SOL || "0.005"),

  // 3-way split of every claim. Defaults sum to 100 (50 / 30 / 20).
  winnerPercent: Number(process.env.WINNER_PERCENT || "50"),
  marketingPercent: Number(process.env.MARKETING_PERCENT || "30"),
  buybackPercent: Number(process.env.BUYBACK_PERCENT || "20"),
  // Slippage tolerance for pump.fun buybacks (percent).
  buybackSlippagePct: Number(process.env.BUYBACK_SLIPPAGE_PCT || "10"),
  // Skip buyback if slice falls below this — avoids dust buys.
  minBuybackSol: Number(process.env.MIN_BUYBACK_SOL || "0.002"),

  maxSolPerCycle: Number(process.env.MAX_SOL_PER_CYCLE || "5"),
  priorityFee: Number(process.env.PRIORITY_FEE || "0.0005"),

  minHolderBalance: Number(process.env.MIN_HOLDER_BALANCE || "1"),
  excludeWallets: new Set(exclude),
  maxHolderSharePct: Number(process.env.MAX_HOLDER_SHARE_PCT || "20"),
  maxHoldersOnWheel: Number(process.env.MAX_HOLDERS_ON_WHEEL || "200"),

  port: Number(process.env.PORT || "3000"),
  logLevel: process.env.LOG_LEVEL || "info",
} as const;
