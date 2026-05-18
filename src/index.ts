import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "./config";
import {
  loadCreatorWallet,
  loadBuyerWallet,
  getSolBalance,
  connection,
} from "./wallet";
import { RewardsClaimer } from "./claim-rewards";
import { forwardLamports } from "./forwarder";
import { WinnerSender, sendMarketing } from "./sender";
import { BuybackBurner } from "./buyback";
import { snapshotHolders } from "./holders";
import { spinWheel } from "./wheel";
import { tracker } from "./activity";
import { startDashboard } from "./dashboard";
import { waitForCreatedMint } from "./mint-watcher";
import { logger } from "./logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  logger.info("=== $VIRUS — claim → spin → infect one wallet → repeat ===");

  const creator = loadCreatorWallet();
  const buyer = loadBuyerWallet();

  logger.info(`Creator wallet:    ${creator.publicKey.toBase58()}`);
  logger.info(`Buyer wallet:      ${buyer.publicKey.toBase58()}${config.singleWalletMode ? "  (same — single-wallet mode)" : ""}`);
  logger.info(`Marketing wallet:  ${config.marketingWallet || "(unset — marketing slice stays in buyer wallet)"}`);
  logger.info(`Cycle:             ${config.cycleIntervalSeconds}s · snapshot lead ${config.snapshotLeadSeconds}s`);
  logger.info(
    `Split:             ${config.winnerPercent}% winner · ${config.marketingPercent}% marketing · ${config.buybackPercent}% buyback+burn 🔥`
  );

  if (tracker.resetIfWalletChanged(creator.publicKey.toBase58())) {
    logger.info("Creator wallet differs from persisted state — wiped dashboard counters for a fresh start.");
  }

  if (process.env.RESET_STATE === "1") {
    tracker.forceReset();
    logger.info("RESET_STATE=1 — wiped all persisted state. Unset this env var now or it will wipe again on every boot.");
  }

  {
    const topup = tracker.applyPoolTopup(process.env.TOPUP_POOL_LAMPORTS);
    if (topup.applied) {
      logger.info(`TOPUP_POOL_LAMPORTS applied: +${topup.lamports} lamports (${(topup.lamports / 1e9).toFixed(4)} SOL) added to claim pool.`);
    }
  }

  let virusMintStr = config.virusMint;
  const cached = tracker.snapshot().virusMint;
  if (!virusMintStr && cached && cached.length > 32) {
    virusMintStr = cached;
    logger.info(`Resuming with previously detected $VIRUS: ${virusMintStr}`);
  }

  tracker.setIdentity({
    creatorWallet: creator.publicKey.toBase58(),
    buyerWallet: buyer.publicKey.toBase58(),
    marketingWallet: config.marketingWallet || creator.publicKey.toBase58(),
    virusMint: virusMintStr || "",
  });

  startDashboard();
  logger.info(`Dashboard live at http://localhost:${config.port}`);

  if (!virusMintStr) {
    tracker.setStatus("watching");
    tracker.recordInfo(`Watching ${creator.publicKey.toBase58()} for pump.fun token creation…`);
    logger.info(`Auto-detect mode: polling for token creation every ${config.mintWatchPollSeconds}s`);
    virusMintStr = await waitForCreatedMint(
      connection,
      creator.publicKey,
      config.mintWatchPollSeconds,
      (n) => {
        if (n === 1 || n % 5 === 0) tracker.recordInfo(`Still watching for token creation… (poll #${n})`);
      }
    );
    tracker.recordInfo(`Detected $VIRUS mint: ${virusMintStr} — outbreaks beginning.`);
    tracker.setIdentity({
      creatorWallet: creator.publicKey.toBase58(),
      buyerWallet: buyer.publicKey.toBase58(),
      marketingWallet: config.marketingWallet || creator.publicKey.toBase58(),
      virusMint: virusMintStr,
    });
  }

  const virusMint = new PublicKey(virusMintStr);
  logger.info(`$VIRUS mint:       ${virusMint.toBase58()}`);

  const claimer = new RewardsClaimer(creator);
  const sender = new WinnerSender(buyer);
  const burner = new BuybackBurner(buyer, virusMint);
  const marketingPubkey = config.marketingWallet
    ? new PublicKey(config.marketingWallet)
    : creator.publicKey;

  const updateBalances = async () => {
    const [creatorSol, buyerSol] = await Promise.all([
      getSolBalance(creator.publicKey),
      getSolBalance(buyer.publicKey),
    ]);
    tracker.updateBalances({ creatorSol, buyerSol });
    return { creatorSol, buyerSol };
  };

  await updateBalances();

  const runCycle = async () => {
    try {
      tracker.cycleStart();

      // ── 1. Claim creator fees ────────────────────────────────────────────
      // Measure exact lamports gained via a before/after balance read on the
      // creator wallet. This is the ONLY money the bot will touch this cycle.
      const balBeforeLamports = Math.floor(
        (await getSolBalance(creator.publicKey)) * LAMPORTS_PER_SOL
      );
      const claimSig = await claimer.claim();
      let claimedLamports = 0;

      if (claimSig) {
        await sleep(3000);
        const balAfterLamports = Math.floor(
          (await getSolBalance(creator.publicKey)) * LAMPORTS_PER_SOL
        );
        claimedLamports = Math.max(0, balAfterLamports - balBeforeLamports);
        if (claimedLamports > 0) {
          const claimedSol = claimedLamports / LAMPORTS_PER_SOL;
          tracker.recordClaim(claimedSol, claimSig);
          tracker.creditClaimPool(claimedLamports);
          logger.info(`Claim pool now: ${(tracker.getClaimPool() / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
        } else {
          tracker.recordInfo("Claim tx submitted but no SOL delta detected.");
        }
      } else {
        tracker.recordInfo("No creator fees to claim this cycle.");
      }

      // ── 2. Forward EXACTLY the claimed lamports to the buyer wallet ──────
      // The creator wallet's pre-existing SOL is never touched.
      if (claimedLamports > 0 && !config.singleWalletMode) {
        const fwd = await forwardLamports(creator, buyer.publicKey, claimedLamports);
        if (fwd.signature) tracker.recordForward(fwd.lamports / LAMPORTS_PER_SOL, fwd.signature);
      } else if (claimedLamports > 0) {
        tracker.recordInfo("Single-wallet mode — claimed SOL stays in the same wallet (no forward needed).");
      }

      await updateBalances();

      // ── 3. Snapshot lead — gives the dashboard a visible 🧪 countdown ────
      tracker.recordInfo(`🧪 Sampling infected wallets in ${config.snapshotLeadSeconds}s — balances locking in.`);
      await sleep(config.snapshotLeadSeconds * 1000);

      const holders = await snapshotHolders(virusMint.toBase58());
      tracker.recordSnapshot(holders.length);
      if (holders.length === 0) {
        tracker.recordInfo("No eligible infected wallets — skipping spin this cycle.");
        return;
      }

      // ── 4. Spin the wheel — weighted-random pick ─────────────────────────
      const spin = spinWheel(holders, config.maxHoldersOnWheel);
      if (!spin) {
        tracker.recordInfo("Wheel was empty — skipping spin this cycle.");
        return;
      }
      tracker.recordSpinStart(spin);

      // Let the dashboard animation finish before we change the prize state.
      await sleep(spin.durationMs + 500);
      tracker.recordSpinResult(spin.winner.owner);

      // ── 5. Compute the 3-way split — strict, never exceeds claim pool ────
      // The claim pool is the bot's only spendable budget. WINNER / MARKETING
      // / BUYBACK percentages must sum to 100. Any rounding remainder rolls
      // into the marketing slice (preserves a clean winner percentage).
      const pool = tracker.getClaimPool();
      const totalPct = Math.max(
        1,
        config.winnerPercent + config.marketingPercent + config.buybackPercent
      );
      const winnerPct = Math.max(0, Math.min(100, config.winnerPercent));
      const buybackPct = Math.max(0, Math.min(100, config.buybackPercent));
      let winnerLamports = Math.floor((pool * winnerPct) / totalPct);
      let buybackLamports = Math.floor((pool * buybackPct) / totalPct);
      let marketingLamports = pool - winnerLamports - buybackLamports;

      // Hard ceiling: a single winner payout may never exceed MAX_SOL_PER_CYCLE.
      // Any trimmed amount flows back to marketing (NOT buyback) so the
      // headline "50% to a holder" promise stays clean and predictable.
      const cycleCeil = Math.floor(Math.max(0, config.maxSolPerCycle) * LAMPORTS_PER_SOL);
      if (cycleCeil > 0 && winnerLamports > cycleCeil) {
        logger.info(`Cycle ceiling kicked in: trimming winner payout to ${config.maxSolPerCycle} SOL.`);
        const trimmed = winnerLamports - cycleCeil;
        winnerLamports = cycleCeil;
        marketingLamports += trimmed;
      }

      // Runtime safety assert — the bot can never spend more than the pool.
      if (winnerLamports + marketingLamports + buybackLamports > pool) {
        const msg = `SAFETY ABORT: split (${winnerLamports} + ${marketingLamports} + ${buybackLamports}) > pool (${pool}).`;
        logger.error(msg);
        tracker.markPrizeFailed(msg);
        return;
      }

      const winnerSol = winnerLamports / LAMPORTS_PER_SOL;
      const marketingSol = marketingLamports / LAMPORTS_PER_SOL;
      const buybackSol = buybackLamports / LAMPORTS_PER_SOL;
      logger.info(
        `Pool ${(pool / LAMPORTS_PER_SOL).toFixed(6)} SOL · ` +
        `winner ${winnerSol.toFixed(6)} (${config.winnerPercent}%) · ` +
        `marketing ${marketingSol.toFixed(6)} (${config.marketingPercent}%) · ` +
        `buyback ${buybackSol.toFixed(6)} (${config.buybackPercent}%) 🔥`
      );

      if (winnerLamports <= 0 || winnerSol < config.minPrizeSol) {
        tracker.markPrizeSkipped(
          `Winner slice ${winnerSol.toFixed(6)} SOL below min ${config.minPrizeSol} — pool carries over.`
        );
        return;
      }

      // ── 6. Send the prize to the winner through 2 ephemeral hop wallets ──
      // Atomic: buyer → hop1 → hop2 → winner, all in one tx. Hops leave nothing.
      let sendResult;
      try {
        sendResult = await sender.sendExact(spin.winner.owner, winnerLamports);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        tracker.markPrizeFailed(msg);
        return;
      }
      tracker.debitClaimPool(winnerLamports);

      // ── 7. Route the marketing slice ─────────────────────────────────────
      // If a separate marketing wallet is set AND we're not in single-wallet
      // mode (in which case the buyer IS the dev), forward the marketing
      // slice. Otherwise the marketing SOL just stays in the buyer wallet for
      // the dev to use manually.
      let marketingTx: string | undefined;
      const shouldRouteMarketing =
        marketingLamports > 0 &&
        config.marketingWallet &&
        !config.singleWalletMode &&
        !marketingPubkey.equals(buyer.publicKey);
      if (shouldRouteMarketing) {
        const mTx = await sendMarketing(buyer, marketingPubkey, marketingLamports);
        if (mTx) {
          marketingTx = mTx;
          tracker.recordMarketing(marketingSol, mTx);
          tracker.debitClaimPool(marketingLamports);
        } else {
          tracker.recordInfo(`Marketing send failed — slice stays in buyer wallet, will retry next cycle.`);
        }
      } else if (marketingLamports > 0) {
        tracker.recordInfo(
          `Marketing slice ${marketingSol.toFixed(6)} SOL stays in ${marketingPubkey.toBase58().slice(0,6)}… (no separate marketing wallet configured).`
        );
        tracker.debitClaimPool(marketingLamports);
      }

      tracker.recordSend({
        winner: spin.winner.owner,
        prizeSol: winnerSol,
        marketingSol,
        txSignature: sendResult.signature,
        hops: sendResult.hops,
        marketingTx,
      });

      // ── 8. Buyback + incinerate ──────────────────────────────────────────
      // Take BUYBACK_PERCENT of the original pool, buy $VIRUS on pump.fun,
      // and burn the bought tokens via SPL burn instruction (visible burn,
      // actually decrements mint.supply). Pool is only debited by the actual
      // SOL spent (measured via balance delta), never the request amount.
      if (buybackLamports > 0 && buybackSol >= config.minBuybackSol) {
        tracker.startBurnAnimation(buybackSol);
        try {
          const result = await burner.buybackAndBurn(buybackSol);
          tracker.markBurnPhase(result.buyTx);
          tracker.recordBurn({
            solSpent: result.solSpent,
            tokensBurnedUi: result.tokensBurnedUi,
            buyTx: result.buyTx,
            burnTx: result.burnTx,
          });
          // Debit pool by ACTUAL SOL spent (delta), not requested amount.
          const spentLamports = Math.floor(result.solSpent * LAMPORTS_PER_SOL);
          tracker.debitClaimPool(Math.min(spentLamports, buybackLamports));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`Buyback/burn failed: ${msg}`);
          tracker.markBurnFailed(msg);
          // Pool is not debited — buyback slice carries over to next cycle.
        }
      } else if (buybackLamports > 0) {
        tracker.recordInfo(
          `Buyback slice ${buybackSol.toFixed(6)} SOL below min ${config.minBuybackSol} — carrying over.`
        );
      }

      await updateBalances();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error && e.stack ? `\n${e.stack}` : "";
      tracker.recordError(`Cycle error: ${msg}`);
      logger.error(`Cycle error: ${msg}${stack}`);
    } finally {
      tracker.setStatus("idle");
      const next = Date.now() + config.cycleIntervalSeconds * 1000;
      tracker.setNextCycleAt(next);
    }
  };

  let stopping = false;
  const loop = async () => {
    while (!stopping) {
      await runCycle();
      await sleep(config.cycleIntervalSeconds * 1000);
    }
  };
  loop().catch((e) => logger.error(`Loop crashed: ${e instanceof Error ? e.message : e}`));

  process.on("SIGINT", () => {
    stopping = true;
    tracker.setStatus("stopped");
    logger.info("Shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopping = true;
    tracker.setStatus("stopped");
    process.exit(0);
  });
}

main().catch((e) => {
  logger.error(`Fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
