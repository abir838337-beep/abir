/**
 * Creates a portable zip of this project using only Node built-ins.
 * Run: npm run zip     (or: node zip-project.js)
 * Output: Aliya-Official-V4-personal-full.zip in this folder.
 * Cookies are included, so keep the zip private.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "Aliya-Official-V4-personal-full.zip");
const SKIP_DIRS = new Set(["node_modules", ".git", "cache", "temp", "tmp", ".vscode"]);
const SKIP_FILES = new Set([path.basename(OUTPUT), "npm-debug.log", "yarn-error.log"]);
const SKIP_EXT = new Set([".log", ".sqlite", "-wal", "-shm", ".pid"]);
const METHOD = 8; // deflate

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		table[n] = c;
	}
	return table;
})();

function crc32(buf) {
	let c = 0 ^ (-1);
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
	return (c ^ (-1)) >>> 0;
}

function dosDateTime(date) {
	const year = Math.max(1980, date.getFullYear());
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
	};
}

function shouldSkip(name, rel) {
	if (SKIP_FILES.has(name)) return true;
	if (SKIP_EXT.has(path.extname(name)) || name.endsWith("-wal") || name.endsWith("-shm")) return true;
	if (/(^|\/)scripts\/cmds\/(cache|temp|tmp)\//.test(rel)) return true;
	return false;
}

function collect(dir, base = "") {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_FILES.has(entry.name) || SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...collect(full, rel));
		else if (entry.isFile() && !shouldSkip(entry.name, rel)) out.push({ full, rel, stat: fs.statSync(full) });
	}
	return out;
}

function utf8(name) { return Buffer.from(name, "utf8"); }

function build() {
	const files = collect(ROOT).sort((a, b) => a.rel.localeCompare(b.rel));
	const locals = [];
	const centrals = [];
	let offset = 0;

	for (const file of files) {
		const raw = fs.readFileSync(file.full);
		const packed = zlib.deflateRawSync(raw, { level: 6 });
		const crc = crc32(raw);
		const { time, date } = dosDateTime(file.stat.mtime);
		const name = utf8(file.rel);

		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(METHOD, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(packed.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		name.copy(local, 30);
		locals.push(local, packed);

		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(METHOD, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(date, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(packed.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0o100644 << 16, 38);
		central.writeUInt32LE(offset, 42);
		name.copy(central, 46);
		centrals.push(central);

		offset += local.length + packed.length;
	}

	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(centralSize, 12);
	eocd.writeUInt32LE(offset, 16);
	eocd.writeUInt16LE(0, 20);

	fs.writeFileSync(OUTPUT, Buffer.concat([...locals, ...centrals, eocd]));
	console.log(`Created ${OUTPUT} with ${files.length} files (${(fs.statSync(OUTPUT).size / 1048576).toFixed(1)} MB).`);
}

try { build(); }
catch (e) { console.error(`Could not create zip: ${e.message}`); process.exit(1); }
