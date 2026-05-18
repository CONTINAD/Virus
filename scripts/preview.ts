// Local dashboard preview — boots the dashboard with seeded fake state so you
// can see the wheel/animation without a real wallet or RPC. Use:
//   PORT=4178 npx ts-node scripts/preview.ts
//
// Then open http://localhost:4178 in a browser.

import "dotenv/config";
process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://example.invalid";
process.env.CREATOR_WALLET_PRIVATE_KEY = process.env.CREATOR_WALLET_PRIVATE_KEY ||
  "3Lzo7nptYpUH2J3kVHrW7N8s47G3hCnHcZ9wKL3oW3WdQGsT8XSRwTcS41jzr8Cmrf2VsM1xwULTpgGqV3sm9b8j";

import { tracker } from "../src/activity";
import { spinWheel } from "../src/wheel";
import { startDashboard } from "../src/dashboard";

// Reset to fresh state so the preview looks like a launch.
tracker.forceReset();

tracker.setIdentity({
  creatorWallet: "5o7zJqpqWFK5W4U2Qwh4N6vXc3a3K6Yyy6kfPnQE1AbC",
  buyerWallet: "5o7zJqpqWFK5W4U2Qwh4N6vXc3a3K6Yyy6kfPnQE1AbC",
  marketingWallet: "5o7zJqpqWFK5W4U2Qwh4N6vXc3a3K6Yyy6kfPnQE1AbC",
  virusMint: "9VIRUSxxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApump",
});

// Fake some holders for the wheel
const fakeHolders = Array.from({ length: 14 }).map((_, i) => {
  const owner = "Inf" + i + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".slice(0, 40);
  const ui = Math.pow(1.6, 14 - i) * 1000;
  return { owner, rawBalance: BigInt(Math.floor(ui)) * 1000000n, uiBalance: ui, share: 0 };
});
const total = fakeHolders.reduce((s, h) => s + h.uiBalance, 0);
fakeHolders.forEach(h => { h.share = h.uiBalance / total; });

tracker.cycleStart();
tracker.recordClaim(2.456, "FakeClaimTxabcdefgh");
tracker.creditClaimPool(2_456_000_000);
tracker.recordSnapshot(fakeHolders.length);

const spin = spinWheel(fakeHolders, 200, { durationMs: 10_000 });
if (spin) {
  tracker.recordSpinStart(spin);
  setTimeout(() => {
    tracker.recordSpinResult(spin.winner.owner);
    setTimeout(() => {
      tracker.recordSend({
        winner: spin.winner.owner,
        prizeSol: 1.228,    // 50%
        marketingSol: 1.228, // 50%
        txSignature: "FakeSendTxabcdef0123hopsAtomicMagic",
        hops: ["Q1FakeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "Q2FakeBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],
        marketingTx: "FakeMktTx0123456789xyz",
      });
      tracker.recordMarketing(1.228, "FakeMktTx0123456789xyz");
    }, 1500);
  }, spin.durationMs + 800);
}

tracker.setNextCycleAt(Date.now() + 5 * 60 * 1000);

startDashboard();
console.log("Preview dashboard up. Open http://localhost:" + (process.env.PORT || 3000));
