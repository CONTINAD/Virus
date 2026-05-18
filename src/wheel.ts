import { randomBytes } from "crypto";
import type { Holder } from "./holders";

export interface WheelSlice {
  owner: string;
  uiBalance: number;
  weight: number;        // 0..1, what share of the wheel this slice covers
  startAngle: number;    // radians, 0 = top, clockwise
  endAngle: number;
}

export interface WheelLayout {
  slices: WheelSlice[];
  totalWeight: number;
  holderCount: number;
}

export interface SpinResult {
  layout: WheelLayout;
  winner: WheelSlice;
  winnerIndex: number;
  targetAngle: number;    // radians, 0 = pointer at top
  rotations: number;      // full rotations the wheel makes before landing
  durationMs: number;     // how long the spin animation should run on the client
  seed: string;           // hex seed used (so the dashboard can replay if needed)
}

/**
 * Build a wheel layout from a holder snapshot. Slice size is proportional to
 * each holder's share of the post-exclusion circulating supply. The wheel goes
 * around clockwise from the 12-o'clock pointer.
 *
 * To keep the visual readable when there are hundreds of holders, anyone past
 * `maxSlices` is folded into a single "OTHERS" slice that's still eligible —
 * if "OTHERS" wins, the actual winner is drawn weighted from that bucket.
 */
export function buildWheelLayout(
  holders: Holder[],
  maxSlices: number
): { layout: WheelLayout; others: Holder[] } {
  if (holders.length === 0) {
    return { layout: { slices: [], totalWeight: 0, holderCount: 0 }, others: [] };
  }
  const sorted = [...holders].sort((a, b) => b.share - a.share);
  const visible = sorted.slice(0, Math.max(1, maxSlices - 1));
  const others = sorted.slice(Math.max(1, maxSlices - 1));

  const display: { owner: string; uiBalance: number; weight: number }[] = visible.map((h) => ({
    owner: h.owner,
    uiBalance: h.uiBalance,
    weight: h.share,
  }));
  if (others.length > 0) {
    const othersWeight = others.reduce((s, h) => s + h.share, 0);
    const othersUi = others.reduce((s, h) => s + h.uiBalance, 0);
    if (othersWeight > 0) {
      display.push({ owner: `__OTHERS__:${others.length}`, uiBalance: othersUi, weight: othersWeight });
    }
  }

  const totalWeight = display.reduce((s, d) => s + d.weight, 0) || 1;

  const slices: WheelSlice[] = [];
  let cursor = 0;
  for (const d of display) {
    const angle = (d.weight / totalWeight) * Math.PI * 2;
    slices.push({
      owner: d.owner,
      uiBalance: d.uiBalance,
      weight: d.weight / totalWeight,
      startAngle: cursor,
      endAngle: cursor + angle,
    });
    cursor += angle;
  }

  return {
    layout: { slices, totalWeight, holderCount: holders.length },
    others,
  };
}

/**
 * Cryptographically-strong weighted random pick. Returns an index into `slices`.
 * Uses crypto.randomBytes so the result is unpredictable even with full code
 * visibility.
 */
function weightedPick(slices: { weight: number }[]): number {
  const total = slices.reduce((s, x) => s + x.weight, 0);
  // Pull 6 bytes (48-bit) for plenty of precision over [0,1)
  const r = readUnsigned48(randomBytes(6)) / 2 ** 48;
  const target = r * total;
  let acc = 0;
  for (let i = 0; i < slices.length; i++) {
    acc += slices[i].weight;
    if (target < acc) return i;
  }
  return slices.length - 1;
}

function readUnsigned48(b: Buffer): number {
  // 48-bit big-endian unsigned int, fits inside Number safely
  return b[0] * 2 ** 40 + b[1] * 2 ** 32 + b[2] * 2 ** 24 + b[3] * 2 ** 16 + b[4] * 2 ** 8 + b[5];
}

/**
 * Spin the wheel. Picks a winner weighted by slice size, then computes the
 * exact `targetAngle` the dashboard should rotate the wheel to so the pointer
 * (fixed at the top) lands on a random point inside the winning slice.
 *
 * The dashboard receives just the angle + duration + winner index and replays
 * the animation locally — no live socket needed.
 */
export function spinWheel(
  holders: Holder[],
  maxSlices: number,
  opts?: { rotations?: number; durationMs?: number }
): SpinResult | null {
  const { layout, others } = buildWheelLayout(holders, maxSlices);
  if (layout.slices.length === 0) return null;

  const winnerIndex = weightedPick(layout.slices);
  let winnerSlice = layout.slices[winnerIndex];

  // If the OTHERS bucket won, draw the real winner from inside it (weighted)
  // and pin the slice's owner to that holder so the dashboard shows the right name.
  if (winnerSlice.owner.startsWith("__OTHERS__") && others.length > 0) {
    const idx = weightedPick(others.map((h) => ({ weight: h.share })));
    const realWinner = others[idx];
    winnerSlice = {
      ...winnerSlice,
      owner: realWinner.owner,
      uiBalance: realWinner.uiBalance,
    };
    layout.slices[winnerIndex] = winnerSlice;
  }

  // Pick a random point inside the winning slice, then derive the rotation
  // needed to bring that point under the top-of-wheel pointer.
  const innerR = readUnsigned48(randomBytes(6)) / 2 ** 48;
  const angleInSlice =
    winnerSlice.startAngle + innerR * (winnerSlice.endAngle - winnerSlice.startAngle);

  // Wheel rotates clockwise. To put `angleInSlice` (measured clockwise from
  // 12-o'clock on the un-rotated wheel) directly under the pointer, the wheel
  // must rotate (2π − angleInSlice) plus N full turns.
  const rotations = opts?.rotations ?? 6 + Math.floor(Math.random() * 3); // 6..8 spins
  const targetAngle = rotations * 2 * Math.PI + (2 * Math.PI - angleInSlice);

  return {
    layout,
    winner: winnerSlice,
    winnerIndex,
    targetAngle,
    rotations,
    durationMs: opts?.durationMs ?? 7000,
    seed: randomBytes(8).toString("hex"),
  };
}
