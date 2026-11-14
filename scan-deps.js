/**
 * Finds npm packages your commands/events need but package.json does not list.
 * Run ONCE on your PC / Termux:   node scan-deps.js          (just list)
 *                                  node scan-deps.js --write  (npm install --save them)
 * Then commit package.json: Render/Railway then install them at BUILD time,
 * not at every bot start.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");
const { spawnSync } = require("child_process");

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.optionalDependencies || {})]);
const re = /require(\s+|)\((\s+|)[`'"]([^`'"]+)[`'"](\s+|)\)/g;
const need = new Map();

for (const dir of ["scripts/cmds", "scripts/events"]) {
	const full = path.join(root, dir);
	if (!fs.existsSync(full)) continue;
	for (const file of fs.readdirSync(full).filter(f => f.endsWith(".js"))) {
		const text = fs.readFileSync(path.join(full, file), "utf8");
		for (const m of text.matchAll(re)) {
			let name = m[3];
			if (name.startsWith(".") || name.startsWith("/")) continue;
			name = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
			if (name.startsWith("node:") || builtinModules.includes(name) || declared.has(name)) continue;
			if (!need.has(name)) need.set(name, []);
			need.get(name).push(file);
		}
	}
}

if (!need.size) {
	console.log("✅ Every package your commands use is already in package.json.");
	process.exit(0);
}
console.log("📦 Missing from package.json:");
for (const [name, files] of need) console.log(`  ${name}  <- ${files.slice(0, 3).join(", ")}${files.length > 3 ? ` +${files.length - 3}` : ""}`);
const names = [...need.keys()];
if (process.argv.includes("--write")) {
	const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--save", "--no-audit", "--no-fund", ...names], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
	process.exit(r.status || 0);
}
console.log(`\nInstall them with:\n  npm install --save ${names.join(" ")}\n(or: node scan-deps.js --write)`);
