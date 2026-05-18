import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { connection, getSolBalance } from "./wallet";
import { logger } from "./logger";

const TX_FEE_RESERVE = 10_000;

/**
 * Forward an EXACT lamport amount from creator → buyer. The forward tx fee is
 * paid out of the claimed lamports, so the creator wallet's pre-existing balance
 * is never touched.
 */
export async function forwardLamports(
  creator: Keypair,
  buyer: PublicKey,
  lamports: number
): Promise<{ signature: string | null; lamports: number }> {
  if (lamports <= TX_FEE_RESERVE) {
    logger.info(`Skipping forward: ${lamports} lamports below fee reserve.`);
    return { signature: null, lamports: 0 };
  }

  const sendAmount = lamports - TX_FEE_RESERVE;
  const balance = await getSolBalance(creator.publicKey);
  if (balance * LAMPORTS_PER_SOL < lamports) {
    logger.warn(
      `Creator balance ${balance.toFixed(6)} SOL < requested forward ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL — skipping.`
    );
    return { signature: null, lamports: 0 };
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: creator.publicKey,
      toPubkey: buyer,
      lamports: sendAmount,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [creator]);
  logger.info(
    `Forwarded ${(sendAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL → buyer wallet. TX: ${sig}`
  );
  return { signature: sig, lamports: sendAmount };
}
