/**
 * Supervisor: keeps the bot alive everywhere.
 *  - health server (always up, so hosting platforms see a live web service)
 *  - spawns bot.js as a child, restarts it on crash / freeze / memory growth
 *  - self-ping (Render / Railway / Replit ...) so free hosts do not put the service to sleep
 */
"use strict";
require("./core/env");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const log = require("./core/logger");
const platform = require("./core/platform");
const alert = require("./core/alert");

const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Node ${process.version} onek purono. Node 18+ lagbe (latest LTS ba current use koro).`);
  process.exit(1);
}

let config;
try { config = require("./core/config"); }
catch (e) { console.error("config.json e vul ache:", e.message); process.exit(1); }

const npmVer = (process.env.npm_config_user_agent || "").match(/npm\/([\d.]+)/)?.[1];
log.info(`Platform: ${platform.name} | Node ${process.version}${npmVer ? ` | npm ${npmVer}` : ""}`);
if (platform.name === "vercel")
  log.warn("Vercel serverless, ekhane long-running bot cholbe na. Render/Railway/Replit/VPS/Termux use koro.");
if (!config.adminBot.length && !config.developer.length)
  log.warn("Admin set kora nai. config.json e adminBot ba ADMIN_IDS env e tomar Facebook UID dao.");

const state = { botState: "starting", restarts: 0, startedAt: Date.now(), lastBeat: Date.now(), lastExit: null };
let child = null;
let stopping = false;
let backoff = 2000;
let startedAt = 0;
let retryTimer = null;
const crashTimes = [];

// ───────────── health server ─────────────
function listen(port) {
  const srv = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/health")) {
      const ok = state.botState === "running";
      const strict = url.includes("strict=1");
      res.writeHead(strict && !ok ? 503 : 200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        status: state.botState,
        uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
        restarts: state.restarts,
        lastExit: state.lastExit,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
        platform: platform.name,
        node: process.version
      }));
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`${config.botName} is ${state.botState}\n`);
  });
  srv.on("error", (e) => {
    if (e.code === "EADDRINUSE" && port !== 0) { log.warn(`Port ${port} busy, random port use korchi`); listen(0); }
    else log.error("Health server error:", e.message);
  });
  srv.listen(port, () => log.info(`Health server on port ${srv.address().port}`));
}
listen(Number(process.env.PORT) || 3000);

// ───────────── memory sizing (works in containers, Termux, VPS) ─────────────
function memLimitMB() {
  if (Number(process.env.ALIYA_MAX_MEM_MB)) return Number(process.env.ALIYA_MAX_MEM_MB);
  let lim = os.totalmem();
  for (const f of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try { const v = fs.readFileSync(f, "utf8").trim(); if (v !== "max" && Number(v) > 0 && Number(v) < lim) lim = Number(v); } catch {}
  }
  return Math.floor(lim / 1048576);
}
const LIMIT_MB = memLimitMB();
const HEAP_MB = config.heapMB || Math.max(192, Math.min(2048, Math.floor(LIMIT_MB * 0.6)));
const GUARD_MB = config.memoryLimitMB || Math.max(256, Math.floor(LIMIT_MB * 0.8));
log.info(`Memory limit ~${LIMIT_MB}MB | heap cap ${HEAP_MB}MB`);

// ───────────── first-boot dependency install (no manual npm install needed) ─────────────
const depsMissing = () =>
  !["@dongdev/fca-unofficial", "ws3-fca", "fca-unofficial"].some((n) => fs.existsSync(path.join(__dirname, "node_modules", n)));

function ensureDeps() {
  return new Promise((resolve) => {
    if (!depsMissing()) return resolve();
    state.botState = "installing";
    log.info("Dependencies nai, nijei install korchi (prothom bar 1-3 minute lagte pare)...");
    let p;
    try {
      p = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev", "--no-audit", "--no-fund"],
        { cwd: __dirname, stdio: "inherit", shell: process.platform === "win32" });
    } catch (e) { log.error("npm chalano gelo na:", e.message); return resolve(); }
    const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 15 * 60 * 1000);
    p.on("exit", (code) => { clearTimeout(killer); if (code) log.error(`npm install fail (code ${code})`); else log.info("Dependencies installed."); resolve(); });
    p.on("error", (e) => { clearTimeout(killer); log.error("npm error:", e.message); resolve(); });
  });
}

// ───────────── bot process ─────────────
async function start() {
  if (stopping || child) return;
  await ensureDeps();
  if (stopping || child) return;
  state.botState = "starting";
  state.lastBeat = Date.now();
  startedAt = Date.now();
  child = spawn(
    process.execPath,
    [`--max-old-space-size=${HEAP_MB}`, path.join(__dirname, "bot.js")],
    { stdio: ["inherit", "inherit", "inherit", "ipc"], env: { ...process.env, AL_RESTARTS: String(state.restarts), AL_MEM_LIMIT: String(GUARD_MB) } }
  );
  child.on("message", (m) => {
    if (m?.type === "heartbeat") state.lastBeat = Date.now();
    if (m?.type === "ready") { state.botState = "running"; backoff = 2000; }
  });
  child.on("error", (e) => log.error("Spawn error:", e.message));
  child.on("exit", (code, signal) => {
    child = null;
    state.lastExit = { code, signal, at: new Date().toISOString() };
    onExit(code, signal);
  });
}

function schedule(ms) {
  if (stopping || retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; start(); }, ms);
}

function onExit(code, signal) {
  if (stopping) return;
  state.restarts++;
  const ranMs = Date.now() - startedAt;

  if (code === 2) {                       // planned restart (auto-restart, /restart, memory guard)
    state.botState = "restarting";
    log.info("Planned restart...");
    return schedule(1000);
  }
  if (code === 3) {                       // cookies dead / account locked: crash-looping will not help
    state.botState = "login-failed";
    const mins = config.loginRetryMinutes || 10;
    log.error(`Login fail (cookies expire?). Notun cookies dao. ${mins} minute pore abar try korbo.`);
    alert("Login fail hoise. Cookies expire hoise ba account e checkpoint. Notun cookies dao.");
    return schedule(mins * 60 * 1000);
  }

  state.botState = "crashed";
  if (ranMs > 120000) backoff = 2000;
  log.warn(`Bot stopped (code ${code}, signal ${signal}). ${backoff / 1000}s pore restart...`);
  const now = Date.now();
  crashTimes.push(now);
  while (crashTimes.length && now - crashTimes[0] > 10 * 60 * 1000) crashTimes.shift();
  if (crashTimes.length >= 5) alert(`Bot 10 minute e ${crashTimes.length} bar crash korse. Log dekho.`);
  schedule(backoff);
  backoff = Math.min(backoff * 2, 60000);
}

// freeze watchdog: worker sends a heartbeat every 15s; no heartbeat for 2 min = frozen
setInterval(() => {
  if (child && Date.now() - state.lastBeat > 120000) {
    log.error("Bot freeze hoise (heartbeat nai), kill korchi...");
    state.lastBeat = Date.now();
    try { child.kill("SIGKILL"); } catch {}
  }
}, 30000);

// self-ping so free hosts do not sleep
const self = platform.selfUrl();
if (self && process.env.SELF_PING !== "false") {
  log.info(`Self-ping on: ${self}`);
  setInterval(() => fetch(self + "/health", { signal: AbortSignal.timeout(15000) }).catch(() => {}), 4 * 60 * 1000);
}

// graceful shutdown
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log.info(`${sig} received, shutting down...`);
  if (child) { try { child.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(0), 4000).unref();
  if (!child) process.exit(0);
  else child.once("exit", () => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error("Unhandled:", e?.message || e));
process.on("uncaughtException", (e) => log.error("Uncaught:", e?.message || e));

start();
