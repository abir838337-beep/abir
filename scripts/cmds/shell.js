const { exec } = require("child_process");

module.exports = {
  config: {
    name: "shell",
    aliases: ["terminal", "bash", "$"],
    version: "5.0.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤 ☠️✌🏼",
    countDown: 0,
    role: 0,
    category: "owner",
    shortDescription: "Execute full system and package management terminal commands",
    guide: "{pn} <command>"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const command = args.join(" ").trim();

    if (!command) {
      return api.sendMessage("⚠️ 𝖯𝗅𝖾𝖺𝗌𝖾 𝖾𝗇𝗍𝖾𝗋 𝖺 𝖼𝗈𝗆𝗆𝖺𝗇𝖽.\n\n𝖤𝗑𝖺𝗆𝗉𝗅𝖾𝘴:\n• ${pn} whoami\n• ${pn} pkg install npm -y\n• ${pn} npm install axios", threadID, messageID);
    }

    api.setMessageReaction("⏳", messageID, () => {}, true);

    exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: 60000 }, (error, stdout, stderr) => {
      let output = "";

      if (error) {
        output += `❌ 𝖤𝗋𝗋𝗈𝗋:\n${error.message}\n\n`;
      }
      if (stderr) {
        output += `⚠️ 𝖲𝗍𝖽𝖾𝗋𝗋:\n${stderr}\n\n`;
      }
      if (stdout) {
        output += `${stdout}`;
      }

      if (!output.trim()) {
        output = "✅ 𝖢𝗈𝗆𝗆𝖺𝗇𝖽 𝖾𝗑𝖾𝖼𝗎𝗍𝖾𝖽 𝗌𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅𝗅𝗒 𝗐𝗂𝗍𝗁 𝗇𝗈 𝗈𝗎𝗍𝗉𝗎𝗍.";
      }

      if (output.length > 3800) {
        output = output.substring(0, 3800) + "\n\n...[Output Truncated]";
      }

      api.setMessageReaction("✅", messageID, () => {}, true);

      const responseText = `𓍢ִ໋🌸✧ ── ͟͟͞͞Sʜᴇʟʟ Oᴜᴛᴘᴜᴛ ── ✧🌸𓍢ִ໋\n\n\`\`\`bash\n${output}\n\`\`\``;
      return api.sendMessage(responseText, threadID, messageID);
    });
  }
};
