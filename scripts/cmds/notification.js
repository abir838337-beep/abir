 
module.exports = {
	config: {
		name: "notification",
		aliases: ["notice", "noti", "announce"],
		version: "1.0.0",
		author: "Mr.king",
		countDown: 5,
		role: 2,
		shortDescription: {
			en: "Send a global notice to all groups with full member mentions"
		},
		category: "owner",
		guide: {
			en: "   {pn} <notice message>"
		}
	},

	onStart: async function ({ api, event, args, threadsData, usersData, message }) {
		const { senderID, messageID } = event;
		const noticeMsg = args.join(" ").trim();

		if (!noticeMsg) {
			return message.reply("⚠️ Please provide a notice message!\n\n💡 Example: `{pn} Bot will be updated tonight at 10 PM.`");
		}

		api.setMessageReaction("📢", messageID, () => {}, true);

		try {
			let ownerName = "Mr.king";
			try {
				ownerName = await usersData.getName(senderID);
			} catch (e) {
				const userInfo = await api.getUserInfo(senderID);
				if (userInfo && userInfo[senderID]) {
					ownerName = userInfo[senderID].name;
				}
			}

			const allThreads = await threadsData.getAll();
			const groupThreads = allThreads.filter(t => t.isGroup === true);

			if (groupThreads.length === 0) {
				return message.reply("❌ The bot is currently not in any groups.");
			}

			let successCount = 0;
			let failCount = 0;

			const baseHeader = "Allllllllllllllllllllllllllllllllll 🐇🌸";
			const footerText = 
`\nnotice : "${noticeMsg}"

- From: "${ownerName}"

╭───────────────⬣
│ 𝐌𝐚𝐝𝐞 𝐰𝐢𝐭𝐡 🤍 𝐛𝐲 --𝔐𝔯.𝔎𝔦𝔫𝔤
╰───────────────⬣`;

			for (const thread of groupThreads) {
				try {
					const tid = thread.threadID;
					let participantIDs = [];

					if (thread.members && thread.members.length > 0) {
						participantIDs = thread.members.filter(m => m.inGroup !== false).map(m => m.userID);
					} else {
						const info = await api.getThreadInfo(tid);
						participantIDs = info.participantIDs || [];
					}

					const botID = api.getCurrentUserID();
					participantIDs = participantIDs.filter(id => id !== botID);

					const mentions = [];
					let tagLine = baseHeader;
					let bodyLength = tagLine.length;

					for (let i = 0; i < participantIDs.length; i++) {
						const uid = participantIDs[i];
						let fromIndex = 0;

						if (bodyLength <= i) {
							tagLine += " ";
							bodyLength++;
						}

						if (tagLine.slice(0, i).lastIndexOf(tagLine[i]) !== -1) {
							fromIndex = i;
						}

						mentions.push({
							tag: tagLine[i],
							id: uid,
							fromIndex
						});
					}

					const fullBody = tagLine + footerText;

					await api.sendMessage({
						body: fullBody,
						mentions
					}, tid);

					successCount++;

					await new Promise(resolve => setTimeout(resolve, 1500));

				} catch (err) {
					failCount++;
				}
			}

			api.setMessageReaction("✅", messageID, () => {}, true);
			return message.reply(
				`📢 ── ͟͟͞͞Nᴏᴛɪᴄᴇ Rᴇᴘᴏ𝐫𝐭 ── ✧\n\n` +
				`✅ Successfully sent: ${successCount} groups\n` +
				`❌ Failed: ${failCount} groups`
			);

		} catch (error) {
			api.setMessageReaction("❌", messageID, () => {}, true);
			return message.reply(`❌ Failed to send notice:\n${error.message}`);
		}
	}
};