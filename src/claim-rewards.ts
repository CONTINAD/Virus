import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./wallet";
import { config } from "./config";
import { logger } from "./logger";

const MAX_ATTEMPTS = 4;
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2000;

export class RewardsClaimer {
  constructor(private wallet: Keypair) {}

  /**
   * Claim creator fees with up to 4 retries and escalating priority fees so a
   * single congestion blip can't drop a cycle. Each retry pulls a fresh tx
   * from PumpPortal with a hotter priority bid and a fresh blockhash.
   */
  async claim(): Promise<string | null> {
    logger.info("Claiming pump.fun creator fees...");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const priority = config.priorityFee * Math.pow(2, attempt - 1); // 1x, 2x, 4x, 8x
      try {
        const sig = config.pumpPortalApiKey
          ? await this.viaLightning(priority)
          : await this.viaLocal(priority, attempt);
        if (sig) {
          if (attempt > 1) logger.info(`Claim landed on attempt ${attempt}/${MAX_ATTEMPTS}.`);
          return sig;
        }
        logger.warn(`Claim attempt ${attempt}/${MAX_ATTEMPTS} did not confirm — escalating priority fee.`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Claim attempt ${attempt}/${MAX_ATTEMPTS} threw: ${msg}`);
      }
      // small backoff before next try
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500));
    }
    logger.error(`Claim FAILED after ${MAX_ATTEMPTS} attempts — pool unchanged, will retry next cycle.`);
    return null;
  }

  private async viaLightning(priority: number): Promise<string | null> {
    const r = await fetch(
      `https://pumpportal.fun/api/trade?api-key=${config.pumpPortalApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collectCreatorFee",
          priorityFee: priority,
          pool: "pump",
        }),
      }
    );
    const data = (await r.json()) as { signature?: string; errors?: string };
    if (data.errors) {
      logger.warn(`Lightning claim error: ${data.errors}`);
      return null;
    }
    if (data.signature) {
      logger.info(`Claimed via Lightning! TX: ${data.signature}`);
      return data.signature;
    }
    return null;
  }

  private async viaLocal(priority: number, attempt: number): Promise<string | null> {
    const r = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: this.wallet.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: priority,
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      logger.warn(`Claim API ${r.status}: ${body}`);
      return null;
    }
    const tx = VersionedTransaction.deserialize(Buffer.from(await r.arrayBuffer()));

    // Refresh blockhash each attempt so we always get a fresh ~60s lifetime,
    // not whatever PumpPortal pre-baked (which can be near-expired).
    const bh = await connection.getLatestBlockhash("confirmed");
    tx.message.recentBlockhash = bh.blockhash;
    tx.signatures = [new Uint8Array(64)];
    tx.sign([this.wallet]);

    const sig = await connection.sendTransaction(tx, {
      skipPreflight: true,
      maxRetries: 5,
    });
    logger.info(`Claim tx submitted (attempt ${attempt}, priority ${priority.toFixed(4)} SOL): ${sig}`);

    const ok = await pollSignature(sig);
    if (!ok) {
      // Before declaring failure, do one more history search — sometimes the
      // tx landed in the last block right after polling expired.
      const finalCheck = await connection.getSignatureStatus(sig, {
        searchTransactionHistory: true,
      });
      const v = finalCheck.value;
      if (v && !v.err && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) {
        logger.info(`Claim confirmed on history-search recheck: ${sig}`);
        return sig;
      }
      logger.warn(`Claim tx ${sig} did not confirm within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000).toFixed(0)}s.`);
      return null;
    }
    logger.info(`Claimed! TX: ${sig}`);
    return sig;
  }
}

async function pollSignature(
  sig: string,
  attempts = POLL_ATTEMPTS,
  intervalMs = POLL_INTERVAL_MS
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const s = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
      const v = s.value;
      if (!v) continue;
      if (v.err) return false;
      if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") return true;
    } catch {
      /* transient — retry */
    }
  }
  return false;
}
