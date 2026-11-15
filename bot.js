/**
 * Worker: logs into Messenger and handles events. Started (and restarted) by index.js.
 * Exit codes: 2 = planned restart, 3 = login/cookies problem, 1 = crash.
 */
"use strict";
require("./core/env");
const config = require("./core/config");
const log = require("./core/logger");
const db = require("./core/db");
const appstate = require("./core/appstate");
const loadCommands = require("./core/loader");
const handle = require("./core/handler");
const createQueue = require("./core/queue");
const wrapSend = require("./core/sendQueue");

const send = (m) => { if (process.send) { try { process.send(m); } catch {} } };
const quit = (code) => { try { db.flush(); } catch {} process.exit(code); };

setInterval(() => send({ type: "heartbeat" }), 15000);                  // supervisor freeze watchdog
setInterval(() => {                                                      // memory guard
  const mb = process.memoryUsage().rss / 1048576;
  if (mb > (Number(process.env.AL_MEM_LIMIT) || config.memoryLimitMB || 420)) { log.warn(`RAM ${Math.round(mb)}MB, restart...`); quit(2); }
}, 60000);
setTimeout(() => { log.info("Scheduled restart (fresh MQTT session)"); quit(2); }, (config.autoRestartHours || 12) * 3600 * 1000);
setInterval(() => { try { db.backup(config.backupKeep || 5); } catch (e) { log.warn("Backup fail:", e.message); } },
  (config.backupHours || 6) * 3600 * 1000);

process.on("SIGTERM", () => quit(0));
process.on("SIGINT", () => quit(0));
process.on("unhandledRejection", (e) => log.error("Unhandled:", e?.message || e));
process.on("uncaughtException", (e) => { log.error("Uncaught:", e?.stack || e); quit(1); });

function loadFca() {
  const names = [...new Set([config.fcaPackage, "@dongdev/fca-unofficial", "ws3-fca", "fca-unofficial"].filter(Boolean))];
  for (const n of names) {
    try {
      const m = require(n);
      const fn = typeof m === "function" ? m : m.default || m.login;
      if (typeof fn === "function") { log.info(`FCA library: ${n}`); return fn; }
    } catch {}
  }
  throw new Error(`FCA library install hoy nai. 'npm install' chalao. Tried: ${names.join(", ")}`);
}

const NETWORK = /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|getaddrinfo|socket hang up|network/i;
const COOKIE_DEAD = /not logged in|checkpoint|login[- ]approval|session.*(expired|invalid)|account.*(suspend|lock|disabled)/i;
const text = (e) => { try { return typeof e === "string" ? e : e?.error || e?.message || JSON.stringify(e); } catch { return String(e); } };

let login, state;
try { login = loadFca(); state = appstate.load(); }
catch (e) { log.error(e.message); quit(/FCA/.test(e.message) ? 1 : 3); }

const { map: commands, unique } = loadCommands();

login({ appState: state.appState }, (err, api) => {
  if (err) {
    const msg = text(err);
    log.error("Login failed:", msg);
    return quit(NETWORK.test(msg) && !COOKIE_DEAD.test(msg) ? 1 : 3);
  }
  api.setOptions({ listenEvents: true, selfListen: false, logLevel: "silent", autoMarkRead: true });
  const botID = api.getCurrentUserID();
  log.info(`Logged in as ${botID}`);
  send({ type: "ready" });

  setInterval(() => { try { appstate.save(api.getAppState(), state.hash); } catch {} }, 30 * 60 * 1000);
  setTimeout(() => { try { appstate.save(api.getAppState(), state.hash); } catch {} }, 60 * 1000);

  wrapSend(api, { perSecond: config.sendPerSecond || 5, threadGapMs: config.threadGapMs || 350 });
  const queue = createQueue({ concurrency: config.concurrency || 25, maxPerThread: config.maxQueuePerThread || 60 });
  const ctx = { api, commands, unique, config, botID };

  // drop duplicate deliveries (MQTT can resend the same event)
  const seen = new Map();
  const isDup = (ev) => {
    if (!ev.messageID) return false;
    const id = `${ev.type}:${ev.messageID}:${ev.userID || ""}:${ev.reaction || ""}`;
    if (seen.has(id)) return true;
    seen.set(id, Date.now());
    if (seen.size > 6000) {
      const now = Date.now();
      for (const [k, t] of seen) { if (now - t > 120000) seen.delete(k); else break; }
      if (seen.size > 6000) seen.delete(seen.keys().next().value);
    }
    return false;
  };

  log.info(`Ready in ${Math.round(process.uptime())}s | concurrency ${config.concurrency || 25}`);
  let dying = false;
  api.listenMqtt((e, event) => {
    if (e) {
      if (dying) return;
      dying = true;
      const msg = text(e);
      log.error("Listen error:", msg);
      return setTimeout(() => quit(COOKIE_DEAD.test(msg) ? 3 : 1), 2000);
    }
    if (isDup(event)) return;
    queue.push(String(event.threadID || "global"), () => handle(ctx, event).catch((x) => log.error("Handler error:", x.message)));
  });
});
