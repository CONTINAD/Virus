import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { connection, getSolBalance } from "./wallet";
import { logger } from "./logger";

export interface SendResult {
  signature: string;
  lamportsSent: number;
  hops: string[];               // ephemeral wallet pubkeys, in order [hop1, hop2]
}

const TX_FEE_LAMPORTS = 15_000; // base fees + priority fee headroom for the atomic tx

/**
 * Pay the winner EXACTLY `lamports` of SOL through 2 fresh ephemeral hop
 * wallets, all in a single atomic transaction.
 *
 * Topology (one tx, 3 signers):
 *
 *     buyer ──→ hop1 ──→ hop2 ──→ winner
 *
 * - Atomic: Solana txs revert as a unit. SOL can never get stranded — every
 *   transfer succeeds together or none do.
 * - "Leave nothing behind": hop1 and hop2 each receive exactly `lamports` and
 *   immediately pass exactly `lamports` along. They end at 0 SOL and Solana
 *   garbage-collects the empty accounts (no rent, no residue).
 * - The winner's wallet receives EXACTLY `lamports` — to the nano-SOL.
 *
 * The buyer pays the tx fee from outside `lamports`, so the user's prize is
 * never debited for network fees.
 *
 * Includes 3 retries with fresh hop keypairs on transient failures.
 */
export class WinnerSender {
  constructor(private buyer: Keypair) {}

  async sendExact(winnerAddr: string, lamports: number): Promise<SendResult> {
    if (lamports <= 0) throw new Error(`Refusing to send ${lamports} lamports`);
    if (!Number.isInteger(lamports)) throw new Error(`Lamports must be integer, got ${lamports}`);

    // Pre-flight: buyer must have lamports + fee buffer.
    const buyerSol = await getSolBalance(this.buyer.publicKey);
    const buyerLam = Math.floor(buyerSol * LAMPORTS_PER_SOL);
    if (buyerLam < lamports + TX_FEE_LAMPORTS) {
      throw new Error(
        `Buyer wallet has ${(buyerLam / LAMPORTS_PER_SOL).toFixed(6)} SOL · ` +
        `need ${((lamports + TX_FEE_LAMPORTS) / LAMPORTS_PER_SOL).toFixed(6)} (prize + fees).`
      );
    }

    const winner = new PublicKey(winnerAddr);

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.sendOnce(winner, lamports);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Prize send attempt ${attempt}/3 failed: ${msg}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async sendOnce(winner: PublicKey, lamports: number): Promise<SendResult> {
    const hop1 = Keypair.generate();
    const hop2 = Keypair.generate();

    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      // buyer → hop1 (creates hop1's system account on first credit)
      SystemProgram.transfer({
        fromPubkey: this.buyer.publicKey,
        toPubkey: hop1.publicKey,
        lamports,
      }),
      // hop1 → hop2 (drains hop1 to 0)
      SystemProgram.transfer({
        fromPubkey: hop1.publicKey,
        toPubkey: hop2.publicKey,
        lamports,
      }),
      // hop2 → winner (drains hop2 to 0)
      SystemProgram.transfer({
        fromPubkey: hop2.publicKey,
        toPubkey: winner,
        lamports,
      }),
    ];

    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = this.buyer.publicKey;
    tx.sign(this.buyer, hop1, hop2);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });

    // Poll for confirmation; fall back to history search before declaring failure.
    let confirmed = false;
    for (let n = 0; n < 30; n++) {
      try {
        const status = await connection.getSignatureStatus(sig);
        const v = status.value;
        if (v) {
          if (v.err) throw new Error(`tx on chain with error: ${JSON.stringify(v.err)}`);
          if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") {
            confirmed = true;
            break;
          }
        }
      } catch {
        /* transient — keep polling */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!confirmed) {
      const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
      const v = status.value;
      if (!v || v.err) throw new Error(`send tx ${sig} did not confirm`);
    }

    const lamportsSent = lamports;
    logger.info(
      `✓ Infected ${winner.toBase58().slice(0,6)}…${winner.toBase58().slice(-4)} with ` +
      `${(lamportsSent / LAMPORTS_PER_SOL).toFixed(6)} SOL via 2 quarantine hops ` +
      `(${hop1.publicKey.toBase58().slice(0,6)}… → ${hop2.publicKey.toBase58().slice(0,6)}…) tx ${sig}`
    );
    return {
      signature: sig,
      lamportsSent,
      hops: [hop1.publicKey.toBase58(), hop2.publicKey.toBase58()],
    };
  }
}

/**
 * Forward the marketing slice to a separate marketing wallet in a single tx.
 * Best-effort: returns null on failure so a marketing-send issue can't kill
 * the winner payout that already happened.
 */
export async function sendMarketing(
  buyer: Keypair,
  marketing: PublicKey,
  lamports: number
): Promise<string | null> {
  if (lamports <= 0) return null;
  try {
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
      SystemProgram.transfer({
        fromPubkey: buyer.publicKey,
        toPubkey: marketing,
        lamports,
      })
    );
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer.publicKey;
    tx.sign(buyer);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });
    for (let n = 0; n < 20; n++) {
      const s = await connection.getSignatureStatus(sig);
      if (s.value?.confirmationStatus === "confirmed" || s.value?.confirmationStatus === "finalized") {
        logger.info(`Marketing slice ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL → ${marketing.toBase58().slice(0,6)}… tx ${sig}`);
        return sig;
      }
      if (s.value?.err) throw new Error(JSON.stringify(s.value.err));
      await new Promise((r) => setTimeout(r, 2000));
    }
    logger.warn(`Marketing send did not confirm in time: ${sig}`);
    return null;
  } catch (e) {
    logger.error(`Marketing send error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
