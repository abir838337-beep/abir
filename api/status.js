/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - VERCEL SERVERLESS STATUS PAGE
 * Maintained by Mr.king
 *
 * Vercel functions are serverless: they wake up per request and disappear. A
 * Messenger bot needs a permanent MQTT connection, so the bot itself must run
 * on Render, Railway, Replit, a VPS, Linux or Termux. This file is the Vercel
 * part: a fast, dependency-free account/status page that reports which cookie
 * slots are configured and which one is marked active/failed/suspended.
 *
 * Endpoints: /  /health  /healthz  /status.json  /api/status
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];
const STATE = path.join(ROOT, "bot", "login", "data", "accounts.json");

const LABEL = {
	active: "ACTIVE (IN USE)", ok: "AVAILABLE (STANDBY)", untested: "AVAILABLE (STANDBY)",
	expired: "LOGGED OUT / EXPIRED", twofa: "TWO-FACTOR AUTH REQUIRED",
	checkpoint: "CHECKPOINT REQUIRED", suspended: "SUSPENDED / LOCKED",
	network: "NETWORK ERROR", other: "FAILED", invalid: "INVALID FORMAT", empty: "EMPTY"
};

function clean(text, limit = 100) {
	return String(text === undefined || text === null ? "" : text)
		.replace(/\b(c_user|xs|sb|datr|fr|access_token|token|password|secret)\s*[=:]\s*\S+/gi, "$1=[hidden]")
		.replace(/EAAA[A-Za-z0-9_-]+/g, "[token-hidden]")
		.replace(/\s+/g, " ").trim().slice(0, limit);
}

function readState() {
	try { return JSON.parse(fs.readFileSync(STATE, "utf8")); }
	catch (e) { return { slots: {}, active: null, forced: null }; }
}

function accounts() {
	const state = readState();
	const now = Date.now();
	return FILES.map((file, i) => {
		const n = i + 1;
		let text = "";
		try { text = fs.readFileSync(path.join(ROOT, file), "utf8").trim(); } catch (e) { /* empty */ }
		if (!text) {
			const envKey = n === 1 ? "ACCOUNT_TXT" : `ACCOUNT${n}_TXT`;
			text = String(process.env[envKey] || "").trim(); // used only for shape detection, never printed
		}
		const shaped = /\bc_user\s*[=:]/.test(text) && /\b(xs|sb|datr|fr)\s*[=:]/.test(text) || /^\[/.test(text) && /\bc_user\b/.test(text);
		const rec = (state.slots && state.slots[n]) || {};
		let raw = LABEL[rec.status] ? rec.status : (text ? "ok" : "empty");
		const left = Number(rec.cooldownUntil) || 0;
		if (left && now >= left) raw = "ok";
		let status = !text ? LABEL.empty : (!shaped ? LABEL.invalid : LABEL[raw] || String(raw).toUpperCase());
		if (state.active === n && text) status = LABEL.active;
		if (left > now && state.active !== n) status += ` (retry in ${Math.ceil((left - now) / 1000)}s)`;
		const m = text.match(/\bc_user\s*[=:]\s*["']?(\d{5,})/);
		const maskedID = m ? m[1].slice(0, 2) + "****" + m[1].slice(-2) : "";
		return { slot: n, file, status, id: maskedID, detail: clean(rec.reason), configured: !!text };
	});
}

function payload() {
	return {
		service: "Aliya Official V4",
		status: "status-page",
		runtime: "Vercel serverless",
		note: "The status page is live on Vercel. The Messenger bot itself needs a permanent host: Render, Railway, Replit, Linux, Ubuntu, VPS or Termux.",
		version: "4.0.3",
		node: process.version,
		serverTime: new Date().toISOString(),
		active: accounts().find(a => a.status === LABEL.active) || null,
		accounts: accounts()
	};
}

function esc(s) {
	return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function html() {
	const rows = accounts().map(a =>
		`<div class="row"><span>${a.slot}. ${esc(a.file)}</span><span>${esc(a.status)}${a.detail ? " | " + esc(a.detail) : ""}</span></div>`
	).join("");
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>Aliya V4 Status</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(circle at 20% 20%,#3a0ca3,#10002b 50%,#000);font-family:system-ui,sans-serif;color:#fff}.card{width:min(94vw,560px);padding:26px 20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:18px}h1{margin:0 0 8px;color:#4cc9f0}p{opacity:.8;line-height:1.5}.row{padding:8px 0;border-top:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;gap:10px;font-size:13px}.row span:last-child{opacity:.75;text-align:right}small{opacity:.5}</style></head>
<body><div class="card"><h1>Aliya V4 Status</h1><p>Hosted on Vercel as a status page. The Messenger bot runs on a permanent host (Render, Railway, Replit, VPS, Linux or Termux).</p>${rows}<p><small>Auto refresh every 30 seconds. No cookies or tokens are shown.</small></p></div></body></html>`;
}

function handler(req, res) {
	const url = String(req.url || "/").split("?")[0];
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Access-Control-Allow-Origin", "*");
	if (url === "/health" || url === "/healthz" || url === "/status.json" || url === "/api/status" || url.startsWith("/api/")) {
		res.statusCode = 200;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		return res.end(JSON.stringify(payload()));
	}
	res.statusCode = 200;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	return res.end(req.method === "HEAD" ? undefined : html());
}

module.exports = handler;
module.exports.default = handler;
module.exports.handler = handler;
