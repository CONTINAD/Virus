import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./wallet";
import { config } from "./config";
import { logger } from "./logger";

export class RewardsClaimer {
  constructor(private wallet: Keypair) {}

  async claim(): Promise<string | null> {
    logger.info("Claiming pump.fun creator fees...");
    try {
      return config.pumpPortalApiKey
        ? await this.viaLightning()
        : await this.viaLocal();
    } catch (e) {
      logger.error(`Claim error: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async viaLightning(): Promise<string | null> {
    const r = await fetch(
      `https://pumpportal.fun/api/trade?api-key=${config.pumpPortalApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collectCreatorFee",
          priorityFee: config.priorityFee,
          pool: "pump",
        }),
      }
    );
    const data = (await r.json()) as { signature?: string; errors?: string };
    if (data.errors) {
      logger.warn(`Claim failed: ${data.errors}`);
      return null;
    }
    if (data.signature) {
      logger.info(`Claimed! TX: ${data.signature}`);
      return data.signature;
    }
    return null;
  }

  private async viaLocal(): Promise<string | null> {
    const r = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: this.wallet.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: config.priorityFee,
      }),
    });
    if (!r.ok) {
      logger.warn(`Claim API ${r.status}: ${await r.text()}`);
      return null;
    }
    const tx = VersionedTransaction.deserialize(Buffer.from(await r.arrayBuffer()));
    const bh = await connection.getLatestBlockhash("confirmed");
    tx.message.recentBlockhash = bh.blockhash;
    tx.signatures = [new Uint8Array(64)];
    tx.sign([this.wallet]);
    const sig = await connection.sendTransaction(tx, {
      skipPreflight: true,
      maxRetries: 5,
    });
    const ok = await pollSignature(sig);
    if (!ok) {
      logger.error(`Claim TX did not confirm in time: ${sig}`);
      return null;
    }
    logger.info(`Claimed! TX: ${sig}`);
    return sig;
  }
}

async function pollSignature(sig: string, attempts = 30, intervalMs = 2000): Promise<boolean> {
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
