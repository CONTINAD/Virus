import { PublicKey, GetProgramAccountsFilter } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "./wallet";
import { config } from "./config";
import { logger } from "./logger";

export interface Holder {
  owner: string;
  rawBalance: bigint;
  uiBalance: number;
  share: number; // 0..1, share of post-exclusion circulating supply
}

/**
 * Snapshot all $VIRUS holders. Requires an RPC that allows
 * getProgramAccounts (Helius/QuickNode/Triton). Auto-detects classic SPL vs
 * Token-2022 from the mint owner.
 */
export async function snapshotHolders(mintAddress: string): Promise<Holder[]> {
  if (!mintAddress) throw new Error("snapshotHolders called without a mint address");
  const mint = new PublicKey(mintAddress);

  const mintAcc = await connection.getAccountInfo(mint);
  if (!mintAcc) {
    logger.warn(`Mint ${mintAddress} not found on chain — returning 0 holders.`);
    return [];
  }
  const program = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  try {
    return await fetchHoldersForProgram(mint, program);
  } catch (e) {
    logger.error(
      `Holder snapshot failed: ${e instanceof Error ? e.message : e}. ` +
      `Make sure SOLANA_RPC_URL allows getProgramAccounts.`
    );
    return [];
  }
}

async function fetchHoldersForProgram(
  mint: PublicKey,
  program: PublicKey
): Promise<Holder[]> {
  const isToken2022 = program.equals(TOKEN_2022_PROGRAM_ID);
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: mint.toBase58() } },
  ];
  if (!isToken2022) filters.unshift({ dataSize: 165 });

  const accounts = await connection.getParsedProgramAccounts(program, { filters });

  const byOwner = new Map<string, bigint>();

  for (const { account } of accounts) {
    const data = account.data;
    if (!("parsed" in data)) continue;
    const info = (data.parsed as { info: { owner: string; tokenAmount: { amount: string } } }).info;
    const owner = info.owner;
    if (config.excludeWallets.has(owner)) continue;

    const amount = BigInt(info.tokenAmount.amount);
    byOwner.set(owner, (byOwner.get(owner) || 0n) + amount);
  }

  const mintInfo = await connection.getParsedAccountInfo(mint);
  const mintParsed =
    mintInfo.value && "parsed" in mintInfo.value.data
      ? (mintInfo.value.data.parsed as { info: { decimals: number; supply: string } }).info
      : null;
  const decimals = mintParsed?.decimals ?? 6;
  const totalSupply = mintParsed ? BigInt(mintParsed.supply) : 0n;
  const div = BigInt(10) ** BigInt(decimals);

  const minRaw = BigInt(Math.floor(config.minHolderBalance)) * div;
  const maxShareThreshold = Math.max(0, Math.min(100, config.maxHolderSharePct)) / 100;

  let circulating = 0n;
  const filtered: { owner: string; raw: bigint }[] = [];
  for (const [owner, raw] of byOwner) {
    if (raw < minRaw) continue;

    if (totalSupply > 0n && maxShareThreshold > 0 && maxShareThreshold < 1) {
      const shareOfSupply = Number(raw) / Number(totalSupply);
      if (shareOfSupply > maxShareThreshold) {
        logger.info(
          `Auto-excluding ${owner.slice(0, 6)}… (holds ${(shareOfSupply * 100).toFixed(2)}% of supply, > ${config.maxHolderSharePct}% threshold — likely LP/treasury).`
        );
        continue;
      }
    }

    filtered.push({ owner, raw });
    circulating += raw;
  }

  if (circulating === 0n) return [];

  const holders: Holder[] = filtered
    .map(({ owner, raw }) => ({
      owner,
      rawBalance: raw,
      uiBalance: Number(raw) / Number(div),
      share: Number(raw) / Number(circulating),
    }))
    .sort((a, b) => b.share - a.share);

  logger.info(
    `Snapshot: ${holders.length} eligible $VIRUS holders (program ${program.toBase58().slice(0, 6)}...).`
  );
  return holders;
}
