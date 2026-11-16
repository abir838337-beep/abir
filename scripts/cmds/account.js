/**
 * ============================================================================
 * COMMAND: account (Multi-Account Switcher & Pool Status Inspector)
 * Usage:
 *   /account status          -> Shows all 5 accounts (active, standby, failed, suspended)
 *   /account switch <1-5>    -> Switches immediately to account.txt .. account5.txt
 *   /account next            -> Rotates to the next available standby account
 * ============================================================================
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");

const ACCOUNT_FILES = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];

module.exports = {
	config: {
		name: "account",
		aliases: ["acc", "switchacc", "accounts"],
		version: "4.0.2",
		author: "Mr.king",
		countDown: 3,
		role: 2, // Bot Admin only
		description: {
			en: "Manage and switch between the 5 multi-account slots (account.txt to account5.txt)",
			vi: "Quản lý và chuyển đổi giữa 5 tài khoản bot"
		},
		category: "owner",
		guide: {
			en: "{pn} status | {pn} switch <1-5> | {pn} next"
		}
	},

	onStart: async function ({ message, args }) {
		const sub = (args[0] || "status").toLowerCase();
		const root = process.cwd();
		const pool = global.GoatBot.accountPoolStatus || {};
		const currentActive = global.GoatBot.activeAccountFile || "account.txt";

		if (sub === "status" || sub === "list" || sub === "info") {
			let report = "👑 𝗔𝗟𝗜𝗬𝗔 𝗠𝗨𝗟𝗧𝗜-𝗔𝗖𝗖𝗢𝗨𝗡𝗧 𝗣𝗢𝗢𝗟 𝗦𝗧𝗔𝗧𝗨𝗦\n";
			report += "━━━━━━━━━━━━━━━━━━━━━━\n";
			report += `🟢 𝗖𝘂𝗿𝗿𝗲𝗻𝘁𝗹𝘆 𝗔𝗰𝘁𝗶𝘃𝗲: ${currentActive}\n`;
			report += `🆔 𝗕𝗼𝘁 𝗨𝗜𝗗: ${global.GoatBot.botID || "Unknown"}\n`;
			report += "━━━━━━━━━━━━━━━━━━━━━━\n";

			ACCOUNT_FILES.forEach((file, idx) => {
				const filePath = path.join(root, file);
				const exists = fs.existsSync(filePath);
				const content = exists ? fs.readFileSync(filePath, "utf8").trim() : "";
				const info = pool[file] || {
					status: content.length > 10 ? "AVAILABLE (STANDBY)" : "EMPTY",
					detail: content.length > 10 ? "Ready" : "No state"
				};

				let icon = "⚪";
				if (file === currentActive) icon = "🟢";
				else if (info.status.includes("AVAILABLE")) icon = "🔵";
				else if (info.status.includes("SUSPENDED")) icon = "🔴";
				else if (info.status.includes("FAIL") || info.status.includes("INVALID")) icon = "🟠";

				report += `${idx + 1}. ${icon} ${file}\n   └ Status: ${info.status}\n   └ Info: ${info.detail}\n`;
			});

			report += "━━━━━━━━━━━━━━━━━━━━━━\n";
			report += "💡 Tip: Use /account switch <1-5> or /account next";
			return message.reply(report);
		}

		if (sub === "switch" || sub === "use") {
			const slot = parseInt(args[1], 10);
			if (isNaN(slot) || slot < 1 || slot > 5) {
				return message.reply("⚠️ Please specify a valid account slot between 1 and 5.\nExample: /account switch 2");
			}
			const targetFile = ACCOUNT_FILES[slot - 1];
			const targetPath = path.join(root, targetFile);
			if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, "utf8").trim().length < 10) {
				return message.reply(`❌ Cannot switch: ${targetFile} is empty or missing! Add a valid cookie/appstate first.`);
			}

			fs.writeFileSync(path.join(root, ".preferred_account"), targetFile);
			await message.reply(`🔄 Switching active bot account to [${targetFile}]...\n♻️ Restarting core now (takes ~3 seconds).`);
			setTimeout(() => process.exit(2), 1200);
			return;
		}

		if (sub === "next" || sub === "rotate") {
			const currentIdx = ACCOUNT_FILES.indexOf(currentActive);
			let nextFile = null;
			for (let offset = 1; offset <= 5; offset++) {
				const candidate = ACCOUNT_FILES[(currentIdx + offset) % 5];
				const p = path.join(root, candidate);
				if (fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 10) {
					const st = pool[candidate]?.status || "";
					if (!st.includes("SUSPENDED") && !st.includes("FAIL")) {
						nextFile = candidate;
						break;
					}
				}
			}

			if (!nextFile || nextFile === currentActive) {
				return message.reply("⚠️ No other healthy standby account found in account.txt through account5.txt!");
			}

			fs.writeFileSync(path.join(root, ".preferred_account"), nextFile);
			await message.reply(`🔄 Rotating to next available account: [${nextFile}]...\n♻️ Restarting core now.`);
			setTimeout(() => process.exit(2), 1200);
			return;
		}

		return message.reply("⚠️ Unknown option. Use:\n• /account status\n• /account switch <1-5>\n• /account next");
	}
};
                              
