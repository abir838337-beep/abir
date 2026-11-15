// autodl v4.1 - same look & same supported sites, but safe for a 512MB host:
//  - video is streamed to disk (never loaded into RAM), size-capped
//  - every network call has a timeout (no more endless ⌛)
//  - max 2 downloads at once + per-user cooldown (213-member groups, link spam)
//  - errors are logged instead of swallowed
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable, Transform } = require("stream");

const API_BASE = process.env.AUTODL_API || "https://xsaim8x-xxx-api.onrender.com/api/auto";
const MAX_MB = 25;                 // Messenger attachment limit is about 25MB
const MAX_PARALLEL = 2;            // downloads running at the same time
const MAX_WAITING = 4;             // more than this waiting -> ❌ (bot is busy)
const USER_COOLDOWN_MS = 8000;     // one link per user per 8s
const API_TIMEOUT_MS = 45000;      // includes the cold start of a free Render API
const DOWNLOAD_TIMEOUT_MS = 90000;

const supportedDomains = [
	"facebook.com", "fb.watch",
	"youtube.com", "youtu.be",
	"tiktok.com",
	"instagram.com", "instagr.am",
	"likee.com", "likee.video",
	"capcut.com",
	"spotify.com",
	"terabox.com",
	"twitter.com", "x.com",
	"drive.google.com",
	"soundcloud.com",
	"ndown.app",
	"pinterest.com", "pin.it"
];

const warn = msg => global.utils?.log?.warn ? global.utils.log.warn("AUTODL", msg) : console.warn("[AUTODL]", msg);
const cacheDir = path.join(__dirname, "cache");

// "https://m.facebook.com/x" -> facebook.com ; "https://notfacebook.com" -> undefined
function matchDomain(link) {
	let host;
	try { host = new URL(link).hostname.toLowerCase(); }
	catch (e) { return undefined; }
	return supportedDomains.find(d => host === d || host.endsWith("." + d));
}

// ── small semaphore ──
let active = 0;
const waiting = [];
function acquire() {
	return new Promise(resolve => {
		if (active < MAX_PARALLEL) { active++; resolve(); }
		else waiting.push(resolve);
	});
}
function release() {
	const next = waiting.shift();
	if (next) next();
	else active--;
}

async function downloadToFile(url, filePath) {
	const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "follow" });
	if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
	const max = MAX_MB * 1024 * 1024;
	const declared = Number(res.headers.get("content-length"));
	if (declared && declared > max) throw new Error(`file too large (${Math.round(declared / 1048576)}MB)`);
	let size = 0;
	const limiter = new Transform({
		transform(chunk, enc, cb) {
			size += chunk.length;
			if (size > max) cb(new Error(`file too large (> ${MAX_MB}MB)`));
			else cb(null, chunk);
		}
	});
	await pipeline(Readable.fromWeb(res.body), limiter, fs.createWriteStream(filePath));
}

const lastUse = new Map();

module.exports = {
	config: {
		name: "autodl",
		version: "4.1.0",
		author: "Mr.king",
		role: 0,
		shortDescription: "All-in-one video/media downloader",
		longDescription:
			"Automatically downloads videos or media from Facebook, YouTube, TikTok, Instagram, Likee, CapCut, Spotify, Terabox, Twitter, Google Drive, SoundCloud, NDown, Pinterest, and more.",
		category: "utility",
		guide: { en: "Just send any supported media link (https://) to auto-download." }
	},

	onStart: async function ({ api, event }) {
		api.sendMessage(
			"📥 Send a video/media link (https://) from any supported site (YouTube, Facebook, TikTok, Instagram, Likee, CapCut, Spotify, Terabox, Twitter, Google Drive, SoundCloud, NDown, Pinterest, etc.) to auto-download.",
			event.threadID,
			event.messageID
		);
	},

	onChat: async function ({ api, event }) {
		const content = event.body ? event.body.trim() : "";
		if (content.toLowerCase().startsWith("auto")) return;
		if (!content.startsWith("https://")) return;
		const link = content.split(/\s+/)[0];
		const domain = matchDomain(link);
		if (!domain) return;

		// flood protection
		const now = Date.now();
		if (now - (lastUse.get(event.senderID) || 0) < USER_COOLDOWN_MS) return;
		lastUse.set(event.senderID, now);
		if (lastUse.size > 2000) lastUse.clear();

		const react = emoji => api.setMessageReaction(emoji, event.messageID, () => { }, true);

		if (waiting.length >= MAX_WAITING) return react("❌️");
		react("⌛️");

		await acquire();
		let filePath;
		try {
			const apiRes = await fetch(`${API_BASE}?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
			if (!apiRes.ok) throw new Error(`API error (HTTP ${apiRes.status})`);
			const data = await apiRes.json();
			const mediaURL = data && (data.high_quality || data.low_quality);
			if (!mediaURL) throw new Error("Media not found");

			const extension = mediaURL.includes(".mp3") ? "mp3" : "mp4";
			fs.mkdirSync(cacheDir, { recursive: true });
			filePath = path.join(cacheDir, `auto_media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`);
			await downloadToFile(mediaURL, filePath);

			react("✅️");
			const platformName = domain.replace(/(\.com|\.app|\.video|\.net)/, "").toUpperCase();
			const infoCard =
				`╭──${platformName}──⬣\n` +
				`│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤\n` +
				`╰────────────────⬣`;

			const sentPath = filePath;
			filePath = null; // from here the send callback owns the cleanup
			api.sendMessage(
				{ body: infoCard, attachment: fs.createReadStream(sentPath) },
				event.threadID,
				err => {
					fs.unlink(sentPath, () => { });
					if (err) { warn(`send failed: ${err.message || err.error || err}`); react("❌️"); }
				},
				event.messageID
			);
		}
		catch (err) {
			warn(`${domain}: ${err && err.message}`);
			react("❌️");
			if (filePath) fs.unlink(filePath, () => { });
		}
		finally {
			release();
		}
	}
};
