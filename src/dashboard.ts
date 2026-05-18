import express, { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { config } from "./config";
import { tracker } from "./activity";
import { logger } from "./logger";

export function startDashboard() {
  const app = express();

  const publicDir = path.join(process.cwd(), "public");
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

  app.get("/api/state", (_req: Request, res: Response) => {
    res.json(tracker.snapshot());
  });

  app.get("/", (_req: Request, res: Response) => {
    res.set("Content-Type", "text/html; charset=utf-8").send(renderHTML());
  });

  app.listen(config.port, "0.0.0.0", () => {
    logger.info(`Dashboard listening on 0.0.0.0:${config.port}`);
  });
}

export function renderHTML(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>$VIRUS — This Will Spread</title>
<link rel="icon" type="image/png" href="/virus-logo.png" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Caveat:wght@400;700&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-0: #050803;
    --bg-1: #0a1108;
    --bg-2: #0e1a0a;
    --bg-3: #142510;
    --virus-0: #22c55e;
    --virus-1: #4ade80;
    --virus-2: #86efac;
    --virus-glow: #4ade80aa;
    --sickly: #d4ed31;
    --hazard: #f59e0b;
    --blood: #ef4444;
    --ink: #ecffe5;
    --ink-dim: #84a378;
    --line: rgba(74,222,128,.16);
    --grid: rgba(74,222,128,.06);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--ink);
    min-height: 100vh;
    background:
      radial-gradient(ellipse 60% 50% at 20% 10%, rgba(34,197,94,.14), transparent 60%),
      radial-gradient(ellipse 50% 50% at 85% 80%, rgba(74,222,128,.12), transparent 60%),
      linear-gradient(180deg, #050803 0%, #07100a 50%, #050803 100%);
    overflow-x: hidden;
  }
  /* graph paper grid — feels like a lab notebook */
  body::before {
    content: "";
    position: fixed; inset: 0;
    background-image:
      linear-gradient(var(--grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, transparent 90%);
    z-index: 0;
  }
  /* drifting virus particles */
  .particle {
    position: fixed; width: 6px; height: 6px; border-radius: 50%;
    background: var(--virus-0); opacity: .35;
    box-shadow: 0 0 14px var(--virus-glow);
    animation: drift 22s ease-in-out infinite alternate;
    z-index: 0; pointer-events: none;
  }
  .particle.p1 { top: 12vh; left: 14vw; }
  .particle.p2 { top: 30vh; left: 86vw; animation-duration: 18s; opacity: .5; }
  .particle.p3 { top: 55vh; left: 6vw;  animation-duration: 26s; animation-delay: -10s; opacity: .25; }
  .particle.p4 { top: 75vh; left: 82vw; animation-duration: 19s; animation-delay: -7s; opacity: .5; }
  .particle.p5 { top: 38vh; left: 50vw; animation-duration: 24s; animation-delay: -15s; opacity: .3; }
  @keyframes drift { from { transform: translate(0,0); } to { transform: translate(60px,-45px); } }

  .container {
    max-width: 1280px; margin: 0 auto;
    padding: 24px 24px 80px;
    position: relative; z-index: 1;
  }

  /* ── BIOHAZARD WARNING STRIP ─────────────────────────────────────── */
  .bio-strip {
    background: repeating-linear-gradient(
      45deg,
      var(--hazard) 0 28px,
      #000 28px 56px
    );
    color: #000;
    font-family: 'JetBrains Mono'; font-weight: 700; font-size: 11px;
    letter-spacing: .3em; text-transform: uppercase;
    padding: 6px 0; text-align: center;
    margin: -24px -24px 20px;
    box-shadow: 0 4px 14px rgba(245,158,11,.3);
  }
  .bio-strip span {
    background: var(--hazard);
    padding: 2px 14px;
    border-radius: 2px;
    display: inline-block;
  }

  /* ── TOP BAR ─────────────────────────────────────────────────────── */
  .topbar {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(10,17,8,.78);
    backdrop-filter: blur(12px);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px 18px;
    box-shadow: 0 12px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(74,222,128,.06);
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-mark {
    width: 46px; height: 46px;
    border-radius: 12px;
    background: rgba(34,197,94,.08);
    border: 1px solid var(--line);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    box-shadow: 0 0 18px rgba(74,222,128,.2);
  }
  .brand-mark img {
    width: 100%; height: 100%; object-fit: contain;
    filter: drop-shadow(0 0 4px rgba(74,222,128,.5));
  }
  .brand-name {
    font-family: 'Permanent Marker', cursive;
    font-size: 26px; letter-spacing: .04em;
    color: var(--virus-0);
    text-shadow: 0 0 18px rgba(74,222,128,.45);
  }
  .brand-tag {
    font-family: 'Caveat', cursive;
    font-size: 18px; color: var(--ink-dim);
    transform: rotate(-3deg);
    margin-left: -4px;
  }
  .live {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: 'JetBrains Mono'; font-weight: 600; font-size: 10.5px;
    color: var(--blood); letter-spacing: .14em; text-transform: uppercase;
    padding: 4px 10px;
    background: rgba(239,68,68,.1);
    border: 1px solid rgba(239,68,68,.3);
    border-radius: 999px;
  }
  .live .dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--blood);
    box-shadow: 0 0 0 0 rgba(239,68,68,.7);
    animation: pulse 1.4s ease-out infinite;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.7); }
    70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .mc-pill {
    display: inline-flex; align-items: center; gap: 8px;
    margin-left: 4px; padding: 5px 12px;
    background: linear-gradient(135deg, var(--virus-0), var(--virus-1));
    color: #04140a;
    border-radius: 999px;
    font-family: 'JetBrains Mono'; font-size: 12px; font-weight: 700;
    text-decoration: none;
    box-shadow: 0 6px 14px rgba(34,197,94,.35);
    transition: transform .15s;
  }
  .mc-pill:hover { transform: translateY(-1px); }
  .mc-pill .mc-label { opacity: .7; font-size: 10px; letter-spacing: .14em; }
  .nav { display: flex; gap: 4px; align-items: center; font-size: 12px; font-weight: 500; }
  .nav a {
    color: var(--ink-dim); text-decoration: none;
    padding: 7px 12px; border-radius: 10px;
    border: 1px solid transparent;
    transition: .15s;
    font-family: 'JetBrains Mono'; letter-spacing: .1em;
  }
  .nav a:hover { color: var(--virus-1); border-color: var(--line); background: rgba(74,222,128,.06); }

  /* ── HERO ────────────────────────────────────────────────────────── */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 36px; align-items: center;
    margin-top: 32px;
  }
  .hero-copy .kicker {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px;
    background: rgba(239,68,68,.1);
    border: 1px solid rgba(239,68,68,.3);
    border-radius: 999px;
    font-family: 'JetBrains Mono'; font-size: 11px;
    letter-spacing: .2em; text-transform: uppercase;
    color: var(--blood);
    margin-bottom: 18px;
  }
  .hero-copy h1 {
    font-family: 'Permanent Marker', cursive;
    font-size: 84px; line-height: .95; letter-spacing: .01em;
    margin: 0 0 16px;
    color: var(--virus-0);
    text-shadow:
      0 0 30px rgba(74,222,128,.5),
      3px 3px 0 rgba(0,0,0,.6);
    transform: rotate(-1.5deg);
  }
  .hero-copy h1 .virus-mark {
    color: var(--sickly);
    text-shadow: 0 0 30px rgba(212,237,49,.5), 3px 3px 0 rgba(0,0,0,.6);
  }
  .hero-copy .subhead {
    font-family: 'Caveat', cursive;
    font-size: 30px; color: var(--ink);
    margin: 0 0 18px;
    transform: rotate(-0.5deg);
  }
  .hero-copy p {
    font-size: 15px; line-height: 1.55; color: var(--ink-dim);
    max-width: 540px; margin: 0 0 16px;
  }
  .hero-copy p b { color: var(--virus-1); font-weight: 600; }

  .ca-pill {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 12px 18px;
    background: rgba(10,17,8,.85);
    border: 1px solid var(--line);
    backdrop-filter: blur(8px);
    border-radius: 999px;
    font-family: 'JetBrains Mono'; font-size: 12px;
    color: var(--ink); cursor: pointer;
    transition: .15s;
  }
  .ca-pill:hover { border-color: var(--virus-0); transform: translateY(-1px); }
  .ca-pill.copied { background: var(--virus-0); color: #04140a; border-color: transparent; }
  .ca-pill .copy { opacity: .55; }

  .hero-cta-row { display: flex; gap: 12px; align-items: center; margin-top: 18px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 22px;
    border-radius: 12px;
    font-family: 'Inter'; font-weight: 700; font-size: 13.5px; letter-spacing: .04em;
    text-decoration: none; cursor: pointer; border: 1px solid var(--line);
    text-transform: uppercase;
    transition: .15s;
  }
  .btn.primary {
    background: linear-gradient(135deg, var(--virus-0), var(--virus-1));
    color: #04140a; border-color: transparent;
    box-shadow: 0 10px 28px rgba(34,197,94,.35);
  }
  .btn.primary:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(34,197,94,.5); }
  .btn.ghost { background: rgba(10,17,8,.6); color: var(--ink); }
  .btn.ghost:hover { border-color: var(--virus-0); color: var(--virus-1); }

  /* ── WHEEL (petri-dish) ──────────────────────────────────────────── */
  .wheel-stage {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    aspect-ratio: 1;
    max-width: 540px;
    margin: 0 auto;
  }
  .wheel-stage::before {
    content: ""; position: absolute; inset: -14%;
    background: radial-gradient(circle, rgba(74,222,128,.28), transparent 65%);
    filter: blur(24px); z-index: -1;
  }
  .wheel-pointer {
    position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 22px solid transparent;
    border-right: 22px solid transparent;
    border-top: 38px solid var(--blood);
    filter: drop-shadow(0 6px 14px rgba(239,68,68,.65));
    z-index: 5;
    transform-origin: 50% 0%;
    transition: filter .15s ease;
  }
  .wheel-pointer::after {
    content: "🧪"; position: absolute; top: -52px; left: 50%; transform: translateX(-50%);
    font-size: 26px;
    filter: drop-shadow(0 0 8px rgba(239,68,68,.6));
  }
  /* every time a slice boundary crosses under the pointer it "ticks" — like
     a roulette wheel hitting pins. JS toggles .tick briefly. */
  .wheel-pointer.tick {
    animation: pointer-tick 110ms ease-out;
  }
  @keyframes pointer-tick {
    0%   { transform: translateX(-50%) rotate(0deg) scaleY(1); }
    35%  { transform: translateX(-50%) rotate(-9deg) scaleY(0.92); filter: drop-shadow(0 4px 10px rgba(251,146,60,.9)); }
    100% { transform: translateX(-50%) rotate(0deg) scaleY(1); }
  }
  /* during the high-speed phase the canvas gets a tiny motion blur, removed
     once the spin decelerates so labels are sharp on the final slice. */
  .wheel-canvas.spin-fast { filter: blur(2px) saturate(1.1); }
  .wheel-canvas.spin-mid  { filter: blur(0.8px); }
  .wheel-canvas.spin-end  { filter: none; }
  .wheel-outer {
    position: absolute; inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, rgba(74,222,128,.5), rgba(34,197,94,.1), rgba(74,222,128,.5));
    padding: 10px;
    box-shadow:
      0 0 60px rgba(74,222,128,.35),
      inset 0 0 30px rgba(74,222,128,.12);
  }
  /* second "petri dish" rim */
  .wheel-outer::before {
    content: "";
    position: absolute; inset: 4px;
    border-radius: 50%;
    border: 1.5px dashed rgba(74,222,128,.35);
    pointer-events: none;
  }
  .wheel-inner {
    position: relative;
    width: 100%; height: 100%; border-radius: 50%;
    background: var(--bg-1);
    overflow: hidden;
    box-shadow: inset 0 0 70px rgba(0,0,0,.85);
  }
  .wheel-canvas {
    width: 100%; height: 100%;
    transform-origin: center center;
  }
  .wheel-hub {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: 24%; height: 24%; border-radius: 50%;
    background: #0a0f06;
    border: 2px solid var(--virus-0);
    box-shadow:
      0 0 30px rgba(74,222,128,.5),
      inset 0 0 14px rgba(74,222,128,.3);
    display: flex; align-items: center; justify-content: center;
    z-index: 4;
    animation: hubPulse 3s ease-in-out infinite;
  }
  @keyframes hubPulse {
    0%, 100% { box-shadow: 0 0 30px rgba(74,222,128,.5), inset 0 0 14px rgba(74,222,128,.3); }
    50%      { box-shadow: 0 0 42px rgba(74,222,128,.75), inset 0 0 18px rgba(74,222,128,.5); }
  }
  .wheel-hub img {
    width: 88%; height: 88%; object-fit: contain;
  }

  /* WHEEL OVERLAY (winner reveal) */
  .wheel-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none; opacity: 0;
    transition: opacity .4s ease;
    z-index: 6;
  }
  .wheel-overlay.show { opacity: 1; }
  .winner-card {
    background: linear-gradient(135deg, rgba(10,17,8,.95), rgba(14,26,10,.95));
    border: 2px solid var(--virus-0);
    border-radius: 18px;
    padding: 18px 24px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(74,222,128,.4);
    backdrop-filter: blur(8px);
    transform: scale(.85) rotate(-2deg); transition: transform .5s cubic-bezier(.25,1.5,.5,1);
    min-width: 260px;
  }
  .wheel-overlay.show .winner-card { transform: scale(1) rotate(-2deg); }
  .winner-card .label {
    font-family: 'Permanent Marker', cursive;
    font-size: 14px; letter-spacing: .14em;
    color: var(--blood); text-transform: uppercase; margin-bottom: 4px;
  }
  .winner-card .addr {
    font-family: 'JetBrains Mono'; font-weight: 600; font-size: 16px;
    color: var(--ink);
    margin-top: 2px;
  }
  .winner-card .prize {
    margin-top: 10px;
    font-family: 'Permanent Marker', cursive;
    font-size: 32px;
    color: var(--virus-0);
    text-shadow: 0 0 14px rgba(74,222,128,.5);
  }
  .winner-card .prize .unit { font-size: 16px; opacity: .7; margin-left: 4px; }
  .winner-card .status-line {
    margin-top: 6px;
    font-size: 12px; color: var(--ink-dim);
    font-family: 'JetBrains Mono';
  }

  /* ── COUNTDOWN STRIP ─────────────────────────────────────────────── */
  .countdown-strip {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 18px; align-items: center;
    margin-top: 28px;
    background: linear-gradient(135deg, rgba(14,26,10,.92), rgba(10,17,8,.92));
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 18px 22px;
    box-shadow: 0 12px 40px rgba(0,0,0,.5);
  }
  .countdown-strip .heading {
    font-family: 'JetBrains Mono'; font-size: 11px; letter-spacing: .2em;
    color: var(--virus-1); text-transform: uppercase;
  }
  .countdown-strip .big {
    font-family: 'Permanent Marker', cursive;
    font-size: 64px; letter-spacing: .04em;
    color: var(--ink); line-height: 1;
    text-shadow: 0 0 30px rgba(74,222,128,.4);
  }
  .countdown-strip .meta { font-size: 12px; color: var(--ink-dim); margin-top: 6px; font-family: 'JetBrains Mono'; }
  .status-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: 'JetBrains Mono'; font-size: 11px; font-weight: 700;
    letter-spacing: .14em; text-transform: uppercase;
    background: rgba(74,222,128,.08);
    color: var(--virus-1);
  }
  .status-pill.idle      { color: var(--ink-dim); background: rgba(255,255,255,.04); }
  .status-pill.running   { color: var(--virus-1); background: rgba(74,222,128,.1); }
  .status-pill.spinning  { color: var(--hazard); background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.3); }
  .status-pill.paying    { color: var(--sickly); background: rgba(212,237,49,.08); border-color: rgba(212,237,49,.25); }
  .status-pill.error     { color: var(--blood); background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.3); }
  .status-pill.watching  { color: var(--hazard); background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.25); }
  .status-pill .blip {
    width: 6px; height: 6px; border-radius: 50%; background: currentColor;
    animation: blipPulse 1.4s ease-in-out infinite;
  }
  @keyframes blipPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
  .ring { position: relative; width: 96px; height: 96px; flex-shrink: 0; }
  .ring svg { transform: rotate(-90deg); }
  .ring .track { stroke: rgba(74,222,128,.12); }
  .ring .fill  { stroke: url(#ringG); stroke-linecap: round; transition: stroke-dashoffset .9s ease; }

  /* ── STATS ───────────────────────────────────────────────────────── */
  .stat-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 24px;
  }
  .stat {
    background: linear-gradient(160deg, var(--bg-2), var(--bg-1));
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px 20px;
    position: relative; overflow: hidden;
  }
  .stat::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(circle at top right, rgba(74,222,128,.14), transparent 60%);
    pointer-events: none;
  }
  .stat .label {
    font-family: 'JetBrains Mono'; font-size: 10px; letter-spacing: .2em;
    color: var(--ink-dim); text-transform: uppercase;
  }
  .stat .value {
    font-family: 'Permanent Marker', cursive;
    font-size: 36px;
    color: var(--ink); margin-top: 6px; letter-spacing: .02em;
    text-shadow: 0 0 18px rgba(74,222,128,.2);
  }
  .stat .value .unit { font-size: 14px; opacity: .55; margin-left: 4px; }
  .stat .sub { font-size: 11px; color: var(--ink-dim); margin-top: 4px; font-family: 'JetBrains Mono'; }
  .stat.accent { border-color: rgba(74,222,128,.35); }
  .stat.accent .value { color: var(--virus-0); text-shadow: 0 0 22px rgba(74,222,128,.5); }
  .stat.danger { border-color: rgba(239,68,68,.3); }
  .stat.danger .value { color: var(--blood); text-shadow: 0 0 18px rgba(239,68,68,.4); }

  /* ── SECTIONS ────────────────────────────────────────────────────── */
  .section-title {
    font-family: 'Permanent Marker', cursive;
    font-size: 30px;
    margin: 56px 0 14px;
    color: var(--virus-0);
    display: flex; align-items: baseline; justify-content: space-between;
    letter-spacing: .02em;
    transform: rotate(-0.5deg);
    text-shadow: 0 0 18px rgba(74,222,128,.3);
  }
  .section-title .updated {
    font-family: 'JetBrains Mono'; font-size: 11px; font-weight: 400;
    color: var(--ink-dim); letter-spacing: 0;
    transform: rotate(0.5deg);
  }

  .panel {
    background: linear-gradient(165deg, var(--bg-2), var(--bg-1));
    border: 1px solid var(--line);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 14px 40px rgba(0,0,0,.5);
  }

  table { width: 100%; border-collapse: collapse; }
  thead th {
    padding: 14px 22px; text-align: left;
    font-family: 'JetBrains Mono'; font-size: 10px; letter-spacing: .2em;
    color: var(--ink-dim); text-transform: uppercase; font-weight: 700;
    border-bottom: 1px solid var(--line);
    background: rgba(0,0,0,.25);
  }
  tbody td {
    padding: 14px 22px; font-size: 13px;
    border-top: 1px solid rgba(74,222,128,.04);
    color: var(--ink);
  }
  tbody tr { transition: background .12s; }
  tbody tr:hover { background: rgba(74,222,128,.04); }
  td.right, th.right { text-align: right; }
  td.mono { font-family: 'JetBrains Mono'; font-size: 12px; color: var(--ink); }
  td a { color: var(--virus-1); text-decoration: none; font-family: 'JetBrains Mono'; font-size: 12px; }
  td a:hover { text-decoration: underline; }

  .rank {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px;
    font-family: 'JetBrains Mono'; font-size: 11px; font-weight: 700;
    background: rgba(74,222,128,.08); color: var(--virus-1); margin-right: 12px;
    border: 1px solid var(--line);
  }
  .rank.r1 { background: linear-gradient(135deg,#fff7c2,#ffd84d); color: #6b4a00; border-color: transparent; }
  .rank.r2 { background: linear-gradient(135deg,#e6ecf2,#a9bccd); color: #2c3a47; border-color: transparent; }
  .rank.r3 { background: linear-gradient(135deg,#ffd9a3,#d68a3b); color: #3a1e00; border-color: transparent; }
  .holder-cell { display: flex; align-items: center; }
  .avatar {
    width: 26px; height: 26px; border-radius: 50%;
    margin-right: 12px; flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(74,222,128,.2), 0 0 10px rgba(74,222,128,.15);
  }

  .events { max-height: 540px; overflow-y: auto; }
  .events::-webkit-scrollbar { width: 6px; }
  .events::-webkit-scrollbar-thumb { background: rgba(74,222,128,.25); border-radius: 999px; }
  .ev {
    display: flex; gap: 14px; align-items: flex-start;
    padding: 12px 22px; border-top: 1px solid rgba(74,222,128,.04);
  }
  .ev:first-child { border-top: 0; }
  .ev .pill {
    display: inline-flex; align-items: center; padding: 4px 12px;
    border-radius: 999px; font-family: 'JetBrains Mono';
    font-size: 10px; font-weight: 600; letter-spacing: .14em;
    text-transform: uppercase; flex-shrink: 0;
    min-width: 88px; justify-content: center;
  }
  .ev.kind-claim    .pill { background: rgba(74,222,128,.14); color: var(--virus-1); }
  .ev.kind-forward  .pill { background: rgba(74,222,128,.10); color: var(--virus-1); }
  .ev.kind-snapshot .pill { background: rgba(212,237,49,.14); color: var(--sickly); }
  .ev.kind-spin-start  .pill { background: rgba(245,158,11,.14); color: var(--hazard); }
  .ev.kind-spin-result .pill { background: rgba(239,68,68,.18); color: var(--blood); }
  .ev.kind-send     .pill { background: rgba(74,222,128,.18); color: var(--virus-0); }
  .ev.kind-marketing .pill { background: rgba(212,237,49,.14); color: var(--sickly); }
  .ev.kind-buyback  .pill { background: rgba(245,158,11,.18); color: var(--hazard); }
  .ev.kind-burn     .pill { background: rgba(239,68,68,.20); color: #fb923c; font-weight: 700; }
  .ev.kind-error    .pill { background: rgba(239,68,68,.14); color: var(--blood); }
  .ev.kind-info     .pill { background: rgba(255,255,255,.05); color: var(--ink-dim); }

  /* ─── burn animation overlay (sits over the wheel after winner is paid) ─── */
  .burn-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none; opacity: 0; transition: opacity .5s ease;
    z-index: 9;
  }
  .burn-overlay.show { opacity: 1; pointer-events: auto; }
  .burn-card {
    background: radial-gradient(ellipse at center, rgba(20,5,5,.95), rgba(8,4,4,.92));
    border: 2px solid rgba(251,146,60,.7);
    box-shadow: 0 0 60px rgba(251,146,60,.5), inset 0 0 40px rgba(239,68,68,.2);
    padding: 28px 36px; border-radius: 22px;
    text-align: center; min-width: 280px;
    backdrop-filter: blur(8px);
    animation: burn-pulse 1.4s ease-in-out infinite alternate;
  }
  .burn-card .label {
    font-family: 'Permanent Marker', cursive;
    color: #fb923c; font-size: 14px; letter-spacing: .14em;
    margin-bottom: 8px;
  }
  .burn-card .amount {
    font-family: 'Permanent Marker', cursive;
    font-size: 44px; color: #fff;
    text-shadow: 0 0 18px #fb923cdd, 0 0 36px #ef4444aa;
    line-height: 1;
  }
  .burn-card .amount .unit { font-size: 16px; color: var(--ink-dim); margin-left: 6px; }
  .burn-card .status-line {
    margin-top: 12px; font-size: 12px; color: var(--ink-dim);
    font-family: 'JetBrains Mono';
  }
  .burn-card .flames { font-size: 28px; margin: 6px 0; letter-spacing: 6px; }
  .burn-card .flames span {
    display: inline-block;
    animation: flame-flicker 0.6s ease-in-out infinite alternate;
  }
  .burn-card .flames span:nth-child(2) { animation-delay: .1s; }
  .burn-card .flames span:nth-child(3) { animation-delay: .2s; }
  .burn-card .flames span:nth-child(4) { animation-delay: .15s; }
  .burn-card .flames span:nth-child(5) { animation-delay: .05s; }
  @keyframes burn-pulse {
    0% { box-shadow: 0 0 60px rgba(251,146,60,.4), inset 0 0 40px rgba(239,68,68,.15); }
    100% { box-shadow: 0 0 90px rgba(251,146,60,.8), inset 0 0 60px rgba(239,68,68,.35); }
  }
  @keyframes flame-flicker {
    0% { transform: translateY(0) scale(1); filter: hue-rotate(0deg); }
    100% { transform: translateY(-3px) scale(1.12); filter: hue-rotate(-12deg); }
  }

  /* burn stat tile gets a hotter color */
  .stat.burn { border-color: rgba(251,146,60,.35); }
  .stat.burn .label { color: #fb923c; }
  .stat.burn .value { color: #ffba6b; text-shadow: 0 0 14px rgba(251,146,60,.4); }
  .ev .body { flex: 1; min-width: 0; }
  .ev .msg { font-size: 13px; color: var(--ink); word-break: break-word; }
  .ev .meta { font-size: 11px; color: var(--ink-dim); margin-top: 3px; font-family: 'JetBrains Mono'; }

  .footer {
    margin-top: 48px; text-align: center;
    font-size: 12px; color: var(--ink-dim);
    font-family: 'JetBrains Mono';
  }
  .footer img { width: 32px; height: 32px; vertical-align: middle; margin-right: 8px; opacity: .7; }

  .empty { padding: 32px; text-align: center; color: var(--ink-dim); font-size: 13px; }

  /* mobile */
  @media (max-width: 980px) {
    .hero { grid-template-columns: 1fr; gap: 28px; }
    .hero-copy h1 { font-size: 56px; }
    .wheel-stage { max-width: 420px; }
    .stat-strip { grid-template-columns: repeat(2, 1fr); }
    .countdown-strip { grid-template-columns: 1fr; text-align: center; }
    .countdown-strip .ring { margin: 0 auto; }
  }
  @media (max-width: 560px) {
    .container { padding: 16px 14px 60px; }
    .hero-copy h1 { font-size: 44px; }
    .stat-strip { grid-template-columns: 1fr; }
    .nav { display: none; }
    .brand-name { font-size: 20px; }
    .brand-tag { font-size: 14px; }
    .bio-strip { font-size: 9px; letter-spacing: .2em; }
  }
</style>
</head>
<body>
  <div class="particle p1"></div><div class="particle p2"></div>
  <div class="particle p3"></div><div class="particle p4"></div>
  <div class="particle p5"></div>

  <div class="container">

    <div class="bio-strip">
      <span>⚠ BIOHAZARD ⚠</span> &nbsp; OUTBREAK IN PROGRESS &nbsp; <span>⚠ CONTAINMENT BREACHED ⚠</span>
    </div>

    <!-- TOP BAR -->
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark"><img src="/virus-logo.png" alt="$VIRUS" /></div>
        <div>
          <div class="brand-name">$VIRUS</div>
          <div class="brand-tag">— this will spread —</div>
        </div>
        <span class="live"><span class="dot"></span> INFECTING</span>
        <a id="mcPill" class="mc-pill" href="#" target="_blank" rel="noopener" title="DexScreener" style="display:none;">
          <span class="mc-label">MC</span><span id="mcValue">—</span>
        </a>
      </div>
      <div class="nav">
        <a id="dexLink" href="https://dexscreener.com/solana" target="_blank" rel="noopener">DEX</a>
        <a id="pumpLink" href="https://pump.fun" target="_blank" rel="noopener">PUMP</a>
        <a href="https://x.com/i/communities/2005814104720605637" target="_blank" rel="noopener">X COMMUNITY</a>
        <a href="https://t.me" target="_blank" rel="noopener">TG</a>
      </div>
    </div>

    <!-- HERO -->
    <section class="hero">
      <div class="hero-copy">
        <span class="kicker">⚠ HOLDER-WEIGHTED OUTBREAK ⚠</span>
        <h1>SPIN.<br/>INFECT.<br/><span class="virus-mark">SPREAD.</span></h1>
        <div class="subhead">it's spreading and eating the supply alive 🦠🔥</div>
        <p>
          Hold <b>$VIRUS</b> → you're a carrier. Every 5 min the bot claims pump.fun
          creator fees, snapshots every infected wallet, and spins a wheel where
          <b>bigger bags = bigger slices</b>. One winner per outbreak takes
          <b><span id="winnerPct">50</span>% of the claim in pure SOL</b>, routed
          through 2 ephemeral quarantine wallets so there's no direct trail.
          <span id="marketingPct">30</span>% feeds the marketing budget — and
          <b style="color:#fb923c"><span id="buybackPct">20</span>% buys $VIRUS
          and incinerates it on-chain</b> every single cycle. The supply only
          shrinks. The pot only grows.
        </p>
        <div class="ca-pill" id="ca" title="click to copy contract address">
          <span id="caText">awaiting outbreak…</span>
          <span class="copy">⎘</span>
        </div>
        <div class="hero-cta-row">
          <a class="btn primary" id="buyBtn" href="https://pump.fun" target="_blank" rel="noopener">CATCH $VIRUS →</a>
          <a class="btn ghost" id="chartBtn" href="https://dexscreener.com/solana" target="_blank" rel="noopener">CHART</a>
        </div>
        <div id="watchBanner" style="display:none; margin-top: 18px; padding: 12px 18px; background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.3); color: var(--hazard); border-radius: 12px; font-size: 13px; font-weight: 500;">
          ⏳ Patient Zero pending — watching <span id="watchWallet" class="mono" style="font-family: 'JetBrains Mono'"></span> for token launch
        </div>
      </div>

      <!-- THE PETRI DISH -->
      <div class="wheel-stage">
        <div class="wheel-pointer"></div>
        <div class="wheel-outer"></div>
        <div class="wheel-inner">
          <canvas class="wheel-canvas" id="wheelCanvas" width="800" height="800"></canvas>
        </div>
        <div class="wheel-hub"><img src="/virus-logo.png" alt="" /></div>
        <div class="wheel-overlay" id="wheelOverlay">
          <div class="winner-card">
            <div class="label">🏥 PATIENT ZERO</div>
            <div class="addr" id="overlayAddr">—</div>
            <div class="prize" id="overlayPrize">— <span class="unit">SOL</span></div>
            <div class="status-line" id="overlayStatus">awaiting infection…</div>
          </div>
        </div>
        <div class="burn-overlay" id="burnOverlay">
          <div class="burn-card">
            <div class="label" id="burnLabel">🔥 BUYING BACK 🔥</div>
            <div class="flames"><span>🔥</span><span>🔥</span><span>🔥</span><span>🔥</span><span>🔥</span></div>
            <div class="amount" id="burnAmount">— <span class="unit">SOL</span></div>
            <div class="status-line" id="burnStatus">queuing pump.fun buy…</div>
          </div>
        </div>
      </div>
    </section>

    <!-- COUNTDOWN -->
    <div class="countdown-strip">
      <div>
        <div class="heading">Next outbreak in</div>
        <div class="big" id="countdownBig">--:--</div>
        <div class="meta" id="countdownMeta">cycle #0 · sampling ${config.snapshotLeadSeconds}s before spin</div>
      </div>
      <div class="ring">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <defs><linearGradient id="ringG" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%"  stop-color="#86efac"/>
            <stop offset="100%" stop-color="#22c55e"/>
          </linearGradient></defs>
          <circle class="track" cx="48" cy="48" r="40" fill="none" stroke-width="6"/>
          <circle class="fill"  cx="48" cy="48" r="40" fill="none" stroke-width="6"
                  stroke-dasharray="251.33" stroke-dashoffset="251.33" id="ringFill"/>
        </svg>
      </div>
      <div class="status-pill idle" id="statusPill">
        <span class="blip"></span> <span id="statusText">idle</span>
      </div>
    </div>

    <!-- STATS -->
    <section class="stat-strip">
      <div class="stat accent">
        <div class="label">🦠 TOTAL SPREADERS</div>
        <div class="value" id="totalSpreaders">0</div>
        <div class="sub" id="totalSpreadersSub">wallets currently holding $VIRUS</div>
      </div>
      <div class="stat">
        <div class="label">💀 PEOPLE INFECTED</div>
        <div class="value" id="uniqueInfected">0</div>
        <div class="sub" id="infectedSub">unique wallets that have caught $VIRUS</div>
      </div>
      <div class="stat danger">
        <div class="label">🧬 TOTAL SOL SPREAD</div>
        <div class="value"><span id="solToWinners">0</span><span class="unit">SOL</span></div>
        <div class="sub" id="solToWinnersSub">across all outbreaks</div>
      </div>
      <div class="stat burn">
        <div class="label">🔥 SUPPLY INCINERATED</div>
        <div class="value"><span id="tokensBurned">0</span></div>
        <div class="sub" id="tokensBurnedSub">$VIRUS permanently burned</div>
      </div>
      <div class="stat">
        <div class="label">🦠 OUTBREAKS RUN</div>
        <div class="value" id="outbreaks">0</div>
        <div class="sub" id="outbreaksSub">wheel spins completed</div>
      </div>
      <div class="stat">
        <div class="label">🧪 NEXT POT</div>
        <div class="value"><span id="nextPot">0</span><span class="unit">SOL</span></div>
        <div class="sub" id="nextPotSub">${config.winnerPercent}% of claim pool</div>
      </div>
    </section>

    <!-- INFECTION LOG -->
    <h2 class="section-title">🏥 Infection Log <span class="updated" id="updatedLog"></span></h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Patient</th>
            <th class="right">SOL infected with</th>
            <th class="right">Slice</th>
            <th>Quarantine route</th>
            <th class="right">When</th>
            <th class="right">Receipt</th>
          </tr>
        </thead>
        <tbody id="winnersBody"></tbody>
      </table>
    </div>

    <!-- INCINERATION LOG -->
    <h2 class="section-title">🔥 Incineration Log <span class="updated" id="updatedBurns"></span></h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Cycle</th>
            <th class="right">SOL spent</th>
            <th class="right">$VIRUS burned</th>
            <th>Buy tx</th>
            <th>Burn tx</th>
            <th class="right">When</th>
          </tr>
        </thead>
        <tbody id="burnsBody"></tbody>
      </table>
    </div>

    <!-- TOP CARRIERS -->
    <h2 class="section-title">🦠 Most Infected <span class="updated" id="updatedLeaders"></span></h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Carrier</th>
            <th class="right">Times infected</th>
            <th class="right">SOL banked</th>
            <th class="right">Last infection</th>
            <th class="right">Last tx</th>
          </tr>
        </thead>
        <tbody id="leadersBody"></tbody>
      </table>
    </div>

    <!-- LIVE ACTIVITY -->
    <h2 class="section-title">⟁ Live Lab Feed</h2>
    <div class="panel events" id="events"></div>

    <div class="footer">
      <img src="/virus-logo.png" alt="" />
      $VIRUS is a memecoin for entertainment only. Spin outcomes are weighted by holdings; payouts depend on claimable fees and continued operation. Not financial advice. THIS WILL SPREAD.
    </div>
  </div>

<script>
const SNAPSHOT_LEAD = ${config.snapshotLeadSeconds};
const WINNER_PCT = ${config.winnerPercent};
const MARKETING_PCT = ${config.marketingPercent};
const BUYBACK_PCT = ${config.buybackPercent};
const fmt = (n, d=2) => Number(n||0).toLocaleString(undefined, { maximumFractionDigits: d });
const fmtTok = (n) => {
  n = Number(n||0);
  if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(2)+'K';
  return n.toFixed(2);
};
const fmtUsd = (n) => {
  n = Number(n||0);
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};
const short = (s) => s ? s.slice(0,4)+'…'+s.slice(-4) : '—';
const sigLink = (s) => s ? '<a href="https://solscan.io/tx/'+s+'" target="_blank">'+short(s)+'</a>' : '';
const ago = (t) => {
  if (!t) return '—';
  const d = Math.floor((Date.now()-t)/1000);
  if (d < 60) return d+'s ago';
  if (d < 3600) return Math.floor(d/60)+'m ago';
  if (d < 86400) return Math.floor(d/3600)+'h ago';
  return Math.floor(d/86400)+'d ago';
};
// virus-themed color: green / sickly yellow / red palette derived from address
const colorFor = (s) => {
  let h = 0;
  for (const c of (s||'?')) h = (h*31 + c.charCodeAt(0)) >>> 0;
  // 60..160 = yellow through green; rare reds via mod
  const hueChoice = h % 100;
  const hue = hueChoice < 70 ? 90 + (hueChoice * 60 / 70)   // 90..150 (acid green)
                              : 35 + ((hueChoice - 70) * 25 / 30); // 35..60 (sickly yellow)
  const sat = 70 + (h % 20);
  const light = 45 + ((h>>5) % 18);
  return 'hsl('+hue+','+sat+'%,'+light+'%)';
};
const avatar = (addr) => {
  const c1 = colorFor(addr);
  const c2 = colorFor((addr||'').slice(-6));
  return '<span class="avatar" style="background:linear-gradient(135deg,'+c1+','+c2+')"></span>';
};
function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============== WHEEL RENDERING ==============
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const SIZE = canvas.width;
const CX = SIZE / 2, CY = SIZE / 2, R = SIZE / 2 - 14;

let renderedLayoutKey = "";

function layoutKey(layout) {
  if (!layout || !layout.slices) return "";
  return layout.slices.map(s => s.owner + ':' + s.weight.toFixed(6)).join('|');
}

function drawWheel(layout) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (!layout || !layout.slices || layout.slices.length === 0) {
    // Idle decorative wheel: green segments waiting for infection
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = i * 2 * Math.PI / N - Math.PI/2;
      const a1 = (i+1) * 2 * Math.PI / N - Math.PI/2;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(34,197,94,.22)' : 'rgba(34,197,94,.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,222,128,.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(236,255,229,.45)';
    ctx.font = '600 28px "Permanent Marker", cursive';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('awaiting carriers…', CX, CY * 1.55);
    return;
  }

  for (let i = 0; i < layout.slices.length; i++) {
    const s = layout.slices[i];
    const a0 = s.startAngle - Math.PI / 2;
    const a1 = s.endAngle - Math.PI / 2;
    const grad = ctx.createRadialGradient(CX, CY, R*0.18, CX, CY, R);
    const baseColor = colorFor(s.owner);
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, shade(baseColor, -32));
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // sketchy divider — black like marker outlines
    ctx.strokeStyle = '#040603';
    ctx.lineWidth = 4;
    ctx.stroke();

    // label inside the slice if big enough
    const midAngle = (a0 + a1) / 2;
    const sliceArc = a1 - a0;
    if (sliceArc > 0.07) {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(midAngle);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = s.owner.startsWith('__OTHERS__')
        ? 'OTHERS (' + s.owner.split(':')[1] + ')'
        : short(s.owner);
      const fontSize = Math.max(11, Math.min(22, sliceArc * 90));
      ctx.fillStyle = '#040603';
      ctx.font = '700 ' + fontSize + 'px "JetBrains Mono", monospace';
      ctx.shadowColor = 'rgba(255,255,255,.4)';
      ctx.shadowBlur = 2;
      ctx.fillText(label, R - 24, 0);
      ctx.restore();
    }
  }
  // outer ring stroke (petri-dish rim feel)
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, 2 * Math.PI);
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(74,222,128,.65)';
  ctx.stroke();
}

function shade(hsl, delta) {
  const m = hsl.match(/hsl\\(([-\\d.]+),\\s*([\\d.]+)%,\\s*([\\d.]+)%\\)/);
  if (!m) return hsl;
  const h = m[1], s = m[2];
  let l = Math.max(0, Math.min(100, parseFloat(m[3]) + delta));
  return 'hsl(' + h + ',' + s + '%,' + l + '%)';
}

// ============== SPIN ANIMATION ==============
let spinPlaybackId = null;
let currentRotation = 0;
// Quintic ease-out — fast launch, long suspenseful taper. Holds the audience
// at "is it stopping?" for the last ~25% of the duration.
const easeOut = (t) => 1 - Math.pow(1 - t, 5);

const TWO_PI = Math.PI * 2;
function normAngle(a) {
  a = a % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/**
 * Find which slice is currently under the top pointer given the wheel's
 * current rotation. Returns slice index or -1 if no layout.
 */
function sliceUnderPointer(layout, rot) {
  if (!layout || !layout.slices || !layout.slices.length) return -1;
  // The pointer sits at angle 0 in world space (12-o'clock). The wheel's
  // local coordinate at the pointer is (2π - rot mod 2π).
  const local = normAngle(TWO_PI - normAngle(rot));
  for (let i = 0; i < layout.slices.length; i++) {
    const s = layout.slices[i];
    if (local >= s.startAngle && local < s.endAngle) return i;
  }
  return layout.slices.length - 1;
}

function tickPointer() {
  const ptr = document.querySelector('.wheel-pointer');
  if (!ptr) return;
  ptr.classList.remove('tick');
  // force reflow so the animation can restart back-to-back
  void ptr.offsetWidth;
  ptr.classList.add('tick');
}

function setCanvasBlur(t) {
  // t is normalized 0..1 elapsed-time. Match blur class to current visual speed.
  canvas.classList.remove('spin-fast', 'spin-mid', 'spin-end');
  if (t < 0.55) canvas.classList.add('spin-fast');
  else if (t < 0.82) canvas.classList.add('spin-mid');
  else canvas.classList.add('spin-end');
}

function playSpin(spin) {
  const id = spin.startedAt + ':' + spin.winnerIndex;
  if (spinPlaybackId === id) return;
  spinPlaybackId = id;

  drawWheel(spin.layout);
  renderedLayoutKey = layoutKey(spin.layout);
  document.getElementById('wheelOverlay').classList.remove('show');

  const startRot = currentRotation % (2 * Math.PI);
  const endRot = spin.targetAngle;
  const startedAt = spin.startedAt;
  const duration = spin.durationMs;
  let lastSliceIdx = sliceUnderPointer(spin.layout, startRot);

  const tick = () => {
    const t = Math.min(1, Math.max(0, (Date.now() - startedAt) / duration));
    const eased = easeOut(t);
    const rot = startRot + (endRot - startRot) * eased;
    canvas.style.transform = 'rotate(' + rot + 'rad)';
    currentRotation = rot;
    setCanvasBlur(t);

    // pointer "ticks" whenever a slice boundary crosses under it — drama in
    // the slow-down phase. Only fire ticks once we're past the high-speed
    // blur phase so it doesn't look like a strobe.
    if (t > 0.45) {
      const idx = sliceUnderPointer(spin.layout, rot);
      if (idx !== lastSliceIdx) {
        tickPointer();
        lastSliceIdx = idx;
      }
    }

    if (t < 1 && spinPlaybackId === id) requestAnimationFrame(tick);
    else if (spinPlaybackId === id) {
      canvas.style.transform = 'rotate(' + endRot + 'rad)';
      currentRotation = endRot;
      canvas.classList.remove('spin-fast', 'spin-mid', 'spin-end');
      tickPointer(); // one last tick as it locks in
      showWinnerOverlay(spin);
    }
  };
  requestAnimationFrame(tick);
}

function showWinnerOverlay(spin) {
  document.getElementById('overlayAddr').textContent = short(spin.winnerOwner);
  if (spin.prizeStatus === 'delivered' && spin.prizeSol != null) {
    document.getElementById('overlayPrize').innerHTML = fmt(spin.prizeSol, 4) + ' <span class="unit">SOL</span>';
    document.getElementById('overlayStatus').innerHTML = 'infected · ' + sigLink(spin.prizeTx);
  } else if (spin.prizeStatus === 'sending') {
    document.getElementById('overlayPrize').innerHTML = '— <span class="unit">SOL</span>';
    document.getElementById('overlayStatus').textContent = 'injecting through quarantine wallets…';
  } else if (spin.prizeStatus === 'skipped') {
    document.getElementById('overlayPrize').innerHTML = '— <span class="unit">SOL</span>';
    document.getElementById('overlayStatus').textContent = 'skipped: ' + (spin.prizeError || 'no pot');
  } else if (spin.prizeStatus === 'failed') {
    document.getElementById('overlayPrize').innerHTML = '— <span class="unit">SOL</span>';
    document.getElementById('overlayStatus').textContent = 'failed: ' + (spin.prizeError || '');
  } else {
    document.getElementById('overlayPrize').innerHTML = '— <span class="unit">SOL</span>';
    document.getElementById('overlayStatus').textContent = 'preparing infection…';
  }
  document.getElementById('wheelOverlay').classList.add('show');
}

// ============== COUNTDOWN ==============
let nextCycleAt = 0;
let cycleIntervalSec = ${config.cycleIntervalSeconds};
let cachedStatus = 'idle';

function tickCountdown() {
  const big = document.getElementById('countdownBig');
  const ring = document.getElementById('ringFill');
  if (!nextCycleAt) {
    big.textContent = '--:--';
    ring.setAttribute('stroke-dashoffset', '251.33');
    return;
  }
  const remainSec = Math.max(0, Math.floor((nextCycleAt - Date.now())/1000));
  const m = Math.floor(remainSec/60), s = remainSec%60;
  big.textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  const total = Math.max(1, cycleIntervalSec);
  const ratio = Math.min(1, Math.max(0, remainSec / total));
  const dash = 2 * Math.PI * 40;
  ring.setAttribute('stroke-dashoffset', String(dash * (1 - ratio)));

  if (cachedStatus === 'spinning') big.textContent = 'SPIN';
  else if (cachedStatus === 'paying') big.textContent = 'PAY';
  else if (cachedStatus === 'watching') big.textContent = 'WAIT';
  else if (remainSec <= SNAPSHOT_LEAD && cachedStatus === 'idle') {
    big.textContent = '🧪 ' + String(remainSec).padStart(2,'0');
  }
}
setInterval(tickCountdown, 1000);

// ============== POLL + RENDER ==============
async function refresh() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const s = await r.json();

    var wp = document.getElementById('winnerPct'); if (wp) wp.textContent = String(WINNER_PCT);
    var mp = document.getElementById('marketingPct'); if (mp) mp.textContent = String(MARKETING_PCT);
    var bp = document.getElementById('buybackPct'); if (bp) bp.textContent = String(BUYBACK_PCT);

    // CA + links
    const ca = s.virusMint || '';
    document.getElementById('caText').textContent = ca ? ca : 'awaiting outbreak…';
    if (ca) {
      document.getElementById('dexLink').href = 'https://dexscreener.com/solana/' + ca;
      document.getElementById('buyBtn').href = 'https://pump.fun/coin/' + ca;
      document.getElementById('chartBtn').href = 'https://dexscreener.com/solana/' + ca;
      document.getElementById('pumpLink').href = 'https://pump.fun/coin/' + ca;
      document.getElementById('mcPill').href = 'https://dexscreener.com/solana/' + ca;
      const nowMs = Date.now();
      if (!window._lastMcFetch || nowMs - window._lastMcFetch > 25000) {
        window._lastMcFetch = nowMs;
        fetch('https://api.dexscreener.com/latest/dex/tokens/' + ca, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data || !data.pairs || !data.pairs.length) return;
            const pair = data.pairs.reduce((a, b) =>
              ((b.liquidity && b.liquidity.usd || 0) > (a.liquidity && a.liquidity.usd || 0)) ? b : a
            );
            const mc = pair.marketCap || pair.fdv || 0;
            if (mc > 0) {
              document.getElementById('mcValue').textContent = fmtUsd(mc);
              document.getElementById('mcPill').style.display = 'inline-flex';
            }
          })
          .catch(() => {});
      }
    }

    const banner = document.getElementById('watchBanner');
    if (s.status === 'watching') {
      banner.style.display = 'block';
      document.getElementById('watchWallet').textContent = short(s.creatorWallet);
    } else {
      banner.style.display = 'none';
    }

    // stats
    document.getElementById('totalSpreaders').textContent = fmtTok(s.current.holderCount || 0);
    document.getElementById('uniqueInfected').textContent = fmtTok(s.totals.uniqueInfected || 0);
    document.getElementById('solToWinners').textContent = fmt(s.totals.solToWinners || 0, 4);
    document.getElementById('outbreaks').textContent = fmtTok(s.totals.outbreaks || 0);
    const tb = s.totals.tokensBurnedUi || 0;
    document.getElementById('tokensBurned').textContent = fmtTok(tb);
    document.getElementById('tokensBurnedSub').textContent =
      (s.totals.burnCount || 0) + ' burns · ' + fmt(s.totals.solToBuybacks || 0, 4) + ' SOL spent';

    const poolSol = (s.claimPoolLamports||0)/1e9;
    const nextPot = poolSol * (WINNER_PCT / 100);
    document.getElementById('nextPot').textContent = fmt(nextPot, 4);
    document.getElementById('nextPotSub').textContent =
      WINNER_PCT + '% of ' + fmt(poolSol, 4) + ' SOL pool';

    // status + countdown
    cachedStatus = s.status || 'idle';
    nextCycleAt = s.nextCycleAt || 0;
    if (s.lastCycleAt && nextCycleAt) {
      cycleIntervalSec = Math.max(1, Math.round((nextCycleAt - s.lastCycleAt)/1000));
    }
    const pill = document.getElementById('statusPill');
    pill.className = 'status-pill ' + cachedStatus;
    document.getElementById('statusText').textContent = cachedStatus;
    document.getElementById('countdownMeta').textContent =
      'cycle #' + (s.cycleCount||0) + ' · sampling ' + SNAPSHOT_LEAD + 's before spin';

    // wheel
    const live = s.liveSpin;
    if (live) {
      const stillRunning = (Date.now() - live.startedAt) < live.durationMs;
      const lk = layoutKey(live.layout);
      if (lk !== renderedLayoutKey) {
        drawWheel(live.layout);
        renderedLayoutKey = lk;
      }
      if (stillRunning || cachedStatus === 'spinning') {
        playSpin(live);
      } else {
        showWinnerOverlay(live);
        canvas.style.transform = 'rotate(' + live.targetAngle + 'rad)';
        currentRotation = live.targetAngle;
        if (Date.now() - live.startedAt > live.durationMs + 60_000 && cachedStatus !== 'spinning') {
          document.getElementById('wheelOverlay').classList.remove('show');
        }
      }
    } else {
      if (renderedLayoutKey !== 'idle') {
        drawWheel(null);
        renderedLayoutKey = 'idle';
      }
      document.getElementById('wheelOverlay').classList.remove('show');
    }

    // burn animation overlay — but hold back at least 5s after the winner
    // card became visible so the audience reads the patient zero first.
    const burn = s.liveBurn;
    const burnOverlay = document.getElementById('burnOverlay');
    const winnerCardVisibleAt = live ? (live.startedAt + live.durationMs) : 0;
    const minBurnShowAt = winnerCardVisibleAt + 5000;
    const burnGateOpen = !winnerCardVisibleAt || Date.now() >= minBurnShowAt;
    if (burn && burnGateOpen) {
      const age = Date.now() - burn.startedAt;
      const stillFresh = burn.status === 'buying' || burn.status === 'burning' || age < 30000;
      if (stillFresh) {
        burnOverlay.classList.add('show');
        // hide the winner card so the burn animation gets the spotlight
        document.getElementById('wheelOverlay').classList.remove('show');
        const label = document.getElementById('burnLabel');
        const amt = document.getElementById('burnAmount');
        const status = document.getElementById('burnStatus');
        if (burn.status === 'buying') {
          label.innerHTML = '🦠 BUYING BACK 🦠';
          amt.innerHTML = fmt(burn.solAmount, 4) + ' <span class="unit">SOL</span>';
          status.textContent = 'pumping ' + fmt(burn.solAmount, 4) + ' SOL into $VIRUS…';
        } else if (burn.status === 'burning') {
          label.innerHTML = '🔥 INCINERATING 🔥';
          amt.innerHTML = fmt(burn.solAmount, 4) + ' <span class="unit">SOL</span>';
          status.innerHTML = 'bought · burning the bag · ' + (burn.buyTx ? sigLink(burn.buyTx) : '');
        } else if (burn.status === 'done') {
          label.innerHTML = '🔥 SUPPLY EATEN 🔥';
          amt.innerHTML = fmtTok(burn.tokensBurnedUi || 0) + ' <span class="unit">$VIRUS</span>';
          status.innerHTML = 'burned · ' + (burn.burnTx ? sigLink(burn.burnTx) : '');
        } else if (burn.status === 'failed') {
          label.innerHTML = '⚠ BURN FAILED ⚠';
          amt.innerHTML = '— <span class="unit">$VIRUS</span>';
          status.textContent = (burn.error || 'unknown error').slice(0, 80);
        }
      } else {
        burnOverlay.classList.remove('show');
      }
    } else {
      burnOverlay.classList.remove('show');
    }

    // incineration log
    const burns = (s.burns || []).slice().reverse().slice(0, 50);
    document.getElementById('burnsBody').innerHTML = burns.length ? burns.map(b =>
      '<tr>' +
        '<td><span class="rank">#' + b.cycle + '</span></td>' +
        '<td class="right">' + fmt(b.solSpent, 4) + ' SOL</td>' +
        '<td class="right" style="color:#fb923c;font-weight:700">' + fmtTok(b.tokensBurnedUi) + '</td>' +
        '<td class="mono">' + sigLink(b.buyTx) + '</td>' +
        '<td class="mono">' + sigLink(b.burnTx) + '</td>' +
        '<td class="right">' + ago(b.ts) + '</td>' +
      '</tr>'
    ).join('') : '<tr><td colspan="6" class="empty">No burns yet — first incineration after the next outbreak.</td></tr>';
    document.getElementById('updatedBurns').textContent = 'updated ' + new Date().toLocaleTimeString();

    // infection log
    const winners = (s.winners || []).slice().reverse().slice(0, 50);
    document.getElementById('winnersBody').innerHTML = winners.length ? winners.map(w => {
      const hops = (w.hops || []);
      const hopsHtml = hops.length
        ? hops.map(h => '<span class="mono" style="opacity:.75">' + short(h) + '</span>').join(' <span style="color:var(--ink-dim)">→</span> ')
        : '<span style="color:var(--ink-dim)">—</span>';
      return '<tr>' +
        '<td><span class="rank">#' + w.cycle + '</span></td>' +
        '<td><div class="holder-cell">' + avatar(w.winner) + '<span class="mono">' + short(w.winner) + '</span></div></td>' +
        '<td class="right" style="color:var(--virus-1);font-weight:600">' + fmt(w.prizeSol, 4) + ' SOL</td>' +
        '<td class="right">' + (w.share*100).toFixed(2) + '%</td>' +
        '<td style="font-size:11px">' + hopsHtml + '</td>' +
        '<td class="right">' + ago(w.ts) + '</td>' +
        '<td class="right mono">' + sigLink(w.sendTx) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty">No outbreaks yet — first wheel pending.</td></tr>';
    document.getElementById('updatedLog').textContent = 'updated ' + new Date().toLocaleTimeString();

    // top carriers
    const leaders = Object.entries(s.perHolder||{})
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a,b) => b.solReceived - a.solReceived)
      .slice(0, 50);
    document.getElementById('leadersBody').innerHTML = leaders.length ? leaders.map((r,i) => {
      const rankClass = i === 0 ? 'rank r1' : i === 1 ? 'rank r2' : i === 2 ? 'rank r3' : 'rank';
      return '<tr>' +
        '<td><div class="holder-cell">' +
          '<span class="' + rankClass + '">' + (i+1) + '</span>' +
          avatar(r.owner) +
          '<span class="mono">' + short(r.owner) + '</span>' +
        '</div></td>' +
        '<td class="right">' + r.wins + '</td>' +
        '<td class="right" style="color:var(--virus-1);font-weight:600">' + fmt(r.solReceived, 4) + ' SOL</td>' +
        '<td class="right">' + ago(r.lastTs) + '</td>' +
        '<td class="right mono">' + sigLink(r.lastTx) + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No carriers yet.</td></tr>';
    document.getElementById('updatedLeaders').textContent = 'updated ' + new Date().toLocaleTimeString();

    // live feed
    const evs = (s.events||[]).slice(-150).reverse();
    document.getElementById('events').innerHTML = evs.length ? evs.map(e =>
      '<div class="ev kind-' + e.type + '">' +
        '<span class="pill">' + e.type.replace('spin-','') + '</span>' +
        '<div class="body">' +
          '<div class="msg">' + escapeHtml(e.message) + '</div>' +
          '<div class="meta">' + new Date(e.ts).toLocaleTimeString() +
            (e.txSignature ? ' · ' + sigLink(e.txSignature) : '') +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('') : '<div class="empty">Waiting for the first event…</div>';

    tickCountdown();
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('ca').addEventListener('click', () => {
  const t = document.getElementById('caText').textContent.trim();
  if (t && t !== 'awaiting outbreak…' && t !== '—') {
    navigator.clipboard.writeText(t);
    const el = document.getElementById('ca');
    el.classList.add('copied');
    setTimeout(()=>el.classList.remove('copied'), 800);
  }
});

drawWheel(null);
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;
}
