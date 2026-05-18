import * as fs from "fs";
import * as path from "path";
import type { WheelLayout, SpinResult } from "./wheel";

export interface CycleEvent {
  ts: number;
  type:
    | "info"
    | "claim"
    | "forward"
    | "snapshot"
    | "spin-start"
    | "spin-result"
    | "send"
    | "marketing"
    | "buyback"
    | "burn"
    | "error";
  message: string;
  txSignature?: string;
  amountSol?: number;
  amountTokens?: number;
  winner?: string;
}

export interface InfectionRecord {
  ts: number;
  cycle: number;
  winner: string;
  uiBalance: number;          // their $VIRUS balance at snapshot
  share: number;              // their slice size 0..1
  prizeSol: number;           // SOL delivered
  marketingSol: number;       // SOL that went to marketing this cycle
  sendTx: string;
  hops: string[];             // ephemeral wallet pubkeys the prize routed through
  marketingTx?: string;
}

/**
 * The "live" spin payload the dashboard polls and replays. Time-stamped so the
 * client can play the spin animation at the correct elapsed offset.
 */
export interface LiveSpin {
  startedAt: number;
  durationMs: number;
  rotations: number;
  targetAngle: number;
  winnerIndex: number;
  winnerOwner: string;
  winnerUi: number;
  layout: WheelLayout;
  cycle: number;
  prizeStatus: "pending" | "sending" | "delivered" | "skipped" | "failed";
  prizeSol?: number;
  prizeTx?: string;
  prizeError?: string;
}

/**
 * Live buyback+burn payload the dashboard polls to play the incineration
 * animation. Status flows: buying → burning → done | failed.
 */
export interface LiveBurn {
  startedAt: number;
  cycle: number;
  status: "buying" | "burning" | "done" | "failed";
  solAmount: number;
  tokensBurnedUi?: number;
  buyTx?: string;
  burnTx?: string;
  error?: string;
}

export interface BurnRecord {
  ts: number;
  cycle: number;
  solSpent: number;
  tokensBurnedUi: number;
  buyTx: string;
  burnTx: string;
}

export interface DashboardState {
  status: "idle" | "running" | "spinning" | "paying" | "error" | "stopped" | "watching";
  startedAt: number;
  lastCycleAt: number;
  nextCycleAt: number;
  cycleCount: number;

  creatorWallet: string;
  buyerWallet: string;
  marketingWallet: string;
  virusMint: string;

  totals: {
    solClaimed: number;
    solToWinners: number;     // total SOL paid to winners
    solToMarketing: number;   // total SOL routed to marketing
    solToBuybacks: number;    // total SOL spent buying back $VIRUS for burns
    tokensBurnedUi: number;   // total $VIRUS burned, decimal-adjusted
    burnCount: number;        // # of buyback+burn cycles executed
    outbreaks: number;        // wheel spins completed
    uniqueInfected: number;   // unique wallets that have won at least once
  };

  // The bot's spendable budget. ONLY grows from measured claim deltas; ONLY
  // shrinks from real spends. Decoupled from on-chain wallet balance so the
  // dev's own SOL is provably never spent.
  claimPoolLamports: number;
  lastClaimLamports: number;
  lastClaimAt: number;
  lastTopupApplied?: string;

  current: {
    creatorSol: number;
    buyerSol: number;
    holderCount: number;     // # infected this cycle (eligible holders)
  };

  lastWinner?: InfectionRecord;
  liveSpin?: LiveSpin;
  liveBurn?: LiveBurn;
  lastBurn?: BurnRecord;

  events: CycleEvent[];
  winners: InfectionRecord[];
  burns: BurnRecord[];
  perHolder: Record<string, { wins: number; solReceived: number; lastTs: number; lastTx: string }>;
}

const DATA_DIR = process.env.STATE_DIR || path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const MAX_EVENTS = 500;
const MAX_WINNERS = 500;
const MAX_BURNS = 500;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState(): DashboardState {
  if (!fs.existsSync(STATE_FILE)) return emptyState();

  let parsed: Partial<DashboardState> | null = null;
  try {
    parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    try {
      parsed = JSON.parse(fs.readFileSync(STATE_FILE + ".tmp", "utf-8"));
    } catch {
      return emptyState();
    }
  }
  if (!parsed || typeof parsed !== "object") return emptyState();

  const base = emptyState();
  return {
    ...base,
    ...parsed,
    totals: { ...base.totals, ...(parsed.totals || {}) },
    current: { ...base.current, ...(parsed.current || {}) },
    perHolder: { ...(parsed.perHolder || {}) },
    events: Array.isArray(parsed.events) ? parsed.events : [],
    winners: Array.isArray(parsed.winners) ? parsed.winners : [],
    burns: Array.isArray(parsed.burns) ? parsed.burns : [],
  };
}

function emptyState(): DashboardState {
  return {
    status: "idle",
    startedAt: Date.now(),
    lastCycleAt: 0,
    nextCycleAt: 0,
    cycleCount: 0,
    creatorWallet: "",
    buyerWallet: "",
    marketingWallet: "",
    virusMint: "",
    totals: {
      solClaimed: 0,
      solToWinners: 0,
      solToMarketing: 0,
      solToBuybacks: 0,
      tokensBurnedUi: 0,
      burnCount: 0,
      outbreaks: 0,
      uniqueInfected: 0,
    },
    claimPoolLamports: 0,
    lastClaimLamports: 0,
    lastClaimAt: 0,
    current: { creatorSol: 0, buyerSol: 0, holderCount: 0 },
    events: [],
    winners: [],
    burns: [],
    perHolder: {},
  };
}

class Tracker {
  private state: DashboardState;

  constructor() {
    ensureDir();
    this.state = loadState();
  }

  private persist() {
    try {
      const tmp = STATE_FILE + ".tmp";
      const fd = fs.openSync(tmp, "w");
      try {
        fs.writeSync(fd, JSON.stringify(this.state, null, 2));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, STATE_FILE);
    } catch {
      /* best-effort */
    }
  }

  private push(event: CycleEvent) {
    this.state.events.push(event);
    if (this.state.events.length > MAX_EVENTS) {
      this.state.events = this.state.events.slice(-MAX_EVENTS);
    }
  }

  setIdentity(p: { creatorWallet: string; buyerWallet: string; marketingWallet: string; virusMint: string }) {
    Object.assign(this.state, p);
    this.persist();
  }

  resetIfWalletChanged(currentCreatorWallet: string): boolean {
    const persisted = this.state.creatorWallet;
    if (persisted && persisted !== currentCreatorWallet) {
      this.state = emptyState();
      this.persist();
      return true;
    }
    return false;
  }

  forceReset() {
    this.state = emptyState();
    this.persist();
  }

  applyPoolTopup(envValue: string | undefined): { applied: boolean; lamports: number } {
    const v = (envValue || "").trim();
    if (!v || v === "0") {
      this.state.lastTopupApplied = v || "0";
      this.persist();
      return { applied: false, lamports: 0 };
    }
    if (this.state.lastTopupApplied === v) return { applied: false, lamports: 0 };
    const lamports = Math.max(0, Math.floor(Number(v)));
    if (!Number.isFinite(lamports) || lamports <= 0) return { applied: false, lamports: 0 };
    this.state.claimPoolLamports += lamports;
    this.state.lastTopupApplied = v;
    this.persist();
    return { applied: true, lamports };
  }

  setStatus(status: DashboardState["status"]) {
    this.state.status = status;
    this.persist();
  }

  setNextCycleAt(t: number) {
    this.state.nextCycleAt = t;
    this.persist();
  }

  updateBalances(p: { creatorSol: number; buyerSol: number }) {
    this.state.current.creatorSol = p.creatorSol;
    this.state.current.buyerSol = p.buyerSol;
    this.persist();
  }

  setHolderCount(n: number) {
    this.state.current.holderCount = n;
    this.persist();
  }

  cycleStart() {
    this.state.cycleCount++;
    this.state.lastCycleAt = Date.now();
    this.state.status = "running";
    this.push({ ts: Date.now(), type: "info", message: `🦠 Cycle #${this.state.cycleCount} started — outbreak in progress` });
    this.persist();
  }

  recordClaim(solAmount: number, txSignature: string) {
    this.state.totals.solClaimed += solAmount;
    this.state.lastClaimLamports = Math.floor(solAmount * 1e9);
    this.state.lastClaimAt = Date.now();
    this.push({ ts: Date.now(), type: "claim", message: `Claimed ${solAmount.toFixed(6)} SOL`, txSignature, amountSol: solAmount });
    this.persist();
  }

  getLastClaimLamports(): number {
    return this.state.lastClaimLamports || 0;
  }

  creditClaimPool(lamports: number) {
    this.state.claimPoolLamports += lamports;
    this.persist();
  }

  debitClaimPool(lamports: number) {
    this.state.claimPoolLamports = Math.max(0, this.state.claimPoolLamports - lamports);
    this.persist();
  }

  getClaimPool(): number {
    return this.state.claimPoolLamports;
  }

  recordForward(solAmount: number, txSignature: string) {
    this.push({ ts: Date.now(), type: "forward", message: `Forwarded ${solAmount.toFixed(6)} SOL → buyer`, txSignature, amountSol: solAmount });
    this.persist();
  }

  recordSnapshot(holderCount: number) {
    this.state.current.holderCount = holderCount;
    this.push({ ts: Date.now(), type: "snapshot", message: `🧪 Sampled ${holderCount} infected wallets — locking in for the spin` });
    this.persist();
  }

  recordSpinStart(spin: SpinResult) {
    this.state.status = "spinning";
    this.state.totals.outbreaks++;
    this.state.liveSpin = {
      startedAt: Date.now(),
      durationMs: spin.durationMs,
      rotations: spin.rotations,
      targetAngle: spin.targetAngle,
      winnerIndex: spin.winnerIndex,
      winnerOwner: spin.winner.owner,
      winnerUi: spin.winner.uiBalance,
      layout: spin.layout,
      cycle: this.state.cycleCount,
      prizeStatus: "pending",
    };
    this.push({
      ts: Date.now(), type: "spin-start",
      message: `🦠 Outbreak: spinning the wheel with ${spin.layout.slices.length} carriers in the petri dish`,
    });
    this.persist();
  }

  recordSpinResult(winner: string) {
    if (this.state.liveSpin) this.state.liveSpin.prizeStatus = "sending";
    this.state.status = "paying";
    this.push({
      ts: Date.now(), type: "spin-result",
      message: `🏥 PATIENT ZERO: ${winner.slice(0, 6)}…${winner.slice(-4)}`,
      winner,
    });
    this.persist();
  }

  recordSend(p: {
    winner: string;
    prizeSol: number;
    marketingSol: number;
    txSignature: string;
    hops: string[];
    marketingTx?: string;
  }) {
    this.state.totals.solToWinners += p.prizeSol;
    this.state.totals.solToMarketing += p.marketingSol;

    const prev = this.state.perHolder[p.winner];
    const isNew = !prev;
    this.state.perHolder[p.winner] = {
      wins: (prev?.wins || 0) + 1,
      solReceived: (prev?.solReceived || 0) + p.prizeSol,
      lastTs: Date.now(),
      lastTx: p.txSignature,
    };
    if (isNew) this.state.totals.uniqueInfected++;

    const rec: InfectionRecord = {
      ts: Date.now(),
      cycle: this.state.cycleCount,
      winner: p.winner,
      uiBalance: this.state.liveSpin?.winnerUi || 0,
      share: this.state.liveSpin?.layout.slices[this.state.liveSpin.winnerIndex]?.weight || 0,
      prizeSol: p.prizeSol,
      marketingSol: p.marketingSol,
      sendTx: p.txSignature,
      hops: p.hops,
      marketingTx: p.marketingTx,
    };
    this.state.winners.push(rec);
    if (this.state.winners.length > MAX_WINNERS) {
      this.state.winners = this.state.winners.slice(-MAX_WINNERS);
    }
    this.state.lastWinner = rec;

    if (this.state.liveSpin) {
      this.state.liveSpin.prizeStatus = "delivered";
      this.state.liveSpin.prizeSol = p.prizeSol;
      this.state.liveSpin.prizeTx = p.txSignature;
    }

    this.push({
      ts: Date.now(), type: "send",
      message: `💉 Infected ${p.winner.slice(0, 6)}…${p.winner.slice(-4)} with ${p.prizeSol.toFixed(6)} SOL via 2 quarantine hops`,
      txSignature: p.txSignature, amountSol: p.prizeSol, winner: p.winner,
    });
    this.persist();
  }

  recordMarketing(solAmount: number, txSignature: string) {
    this.push({
      ts: Date.now(), type: "marketing",
      message: `📣 Marketing slice ${solAmount.toFixed(6)} SOL routed`,
      txSignature, amountSol: solAmount,
    });
    this.persist();
  }

  startBurnAnimation(solAmount: number) {
    this.state.liveBurn = {
      startedAt: Date.now(),
      cycle: this.state.cycleCount,
      status: "buying",
      solAmount,
    };
    this.push({
      ts: Date.now(), type: "buyback",
      message: `🦠 Buying back ${solAmount.toFixed(6)} SOL of $VIRUS — about to incinerate the supply`,
      amountSol: solAmount,
    });
    this.persist();
  }

  markBurnPhase(buyTx: string) {
    if (this.state.liveBurn) {
      this.state.liveBurn.status = "burning";
      this.state.liveBurn.buyTx = buyTx;
    }
    this.persist();
  }

  recordBurn(p: {
    solSpent: number;
    tokensBurnedUi: number;
    buyTx: string;
    burnTx: string;
  }) {
    this.state.totals.solToBuybacks += p.solSpent;
    this.state.totals.tokensBurnedUi += p.tokensBurnedUi;
    this.state.totals.burnCount += 1;

    const rec: BurnRecord = {
      ts: Date.now(),
      cycle: this.state.cycleCount,
      solSpent: p.solSpent,
      tokensBurnedUi: p.tokensBurnedUi,
      buyTx: p.buyTx,
      burnTx: p.burnTx,
    };
    this.state.burns.push(rec);
    if (this.state.burns.length > MAX_BURNS) {
      this.state.burns = this.state.burns.slice(-MAX_BURNS);
    }
    this.state.lastBurn = rec;

    if (this.state.liveBurn) {
      this.state.liveBurn.status = "done";
      this.state.liveBurn.tokensBurnedUi = p.tokensBurnedUi;
      this.state.liveBurn.burnTx = p.burnTx;
    }

    this.push({
      ts: Date.now(), type: "burn",
      message: `🔥 Incinerated ${p.tokensBurnedUi.toLocaleString(undefined, { maximumFractionDigits: 2 })} $VIRUS — supply down, faith up`,
      txSignature: p.burnTx,
      amountSol: p.solSpent,
      amountTokens: p.tokensBurnedUi,
    });
    this.persist();
  }

  markBurnFailed(reason: string) {
    if (this.state.liveBurn) {
      this.state.liveBurn.status = "failed";
      this.state.liveBurn.error = reason;
    }
    this.push({ ts: Date.now(), type: "error", message: `Buyback/burn failed: ${reason}` });
    this.persist();
  }

  markPrizeSkipped(reason: string) {
    if (this.state.liveSpin) {
      this.state.liveSpin.prizeStatus = "skipped";
      this.state.liveSpin.prizeError = reason;
    }
    this.push({ ts: Date.now(), type: "info", message: `Prize skipped: ${reason}` });
    this.persist();
  }

  markPrizeFailed(reason: string) {
    if (this.state.liveSpin) {
      this.state.liveSpin.prizeStatus = "failed";
      this.state.liveSpin.prizeError = reason;
    }
    this.recordError(`Prize delivery failed: ${reason}`);
  }

  recordInfo(message: string) {
    this.push({ ts: Date.now(), type: "info", message });
    this.persist();
  }

  recordError(message: string) {
    this.state.status = "error";
    this.push({ ts: Date.now(), type: "error", message });
    this.persist();
  }

  snapshot(): DashboardState {
    return this.state;
  }
}

export const tracker = new Tracker();
