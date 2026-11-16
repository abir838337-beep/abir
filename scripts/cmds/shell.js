 
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let currentCwd = process.cwd();
const activeProcesses = new Map();

module.exports = {
  config: {
    name: "shell",
    aliases: ["terminal", "bash", "$", "sh"],
    version: "15.1.0",
    author: "𝔐𝔯.𝔎𝔦𝔫𝔤 ☠️✌🏼",
    countDown: 0,
    role: 0,
    category: "owner",
    shortDescription: "Ultimate fully-featured terminal with directory persistence, stdin reply, process management, and manual guide",
    guide: {
      en: "   {pn} <command> (e.g., {pn} ls, {pn} pkg update, {pn} python3 script.py)\n" +
          "   {pn} cd <path> (Change directory persistently)\n" +
          "   Reply to any interactive/waiting process output with 'y', text, or 'kill' to terminate."
    }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const commandText = args.join(" ").trim();

    if (!commandText || args[0].toLowerCase() === "help" || args[0].toLowerCase() === "manual") {
      const manualText = 
        `📚 ── ͟͟͞͞Sʜᴇʟʟ Cᴏｍｍａｎｄ Mᴀɴᴜᴀʟ (A to Z) ── 📚\n\n` +
        `📂 𝖢𝗎𝗋𝗋𝖾𝗇𝗍 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗒:\n\`${currentCwd}\`\n\n` +
        `✨ 𝖶𝗁𝖺𝗍 𝖸𝗈𝗎 𝖢𝖺𝗇 𝖣𝗈:\n` +
        `• System Commands: \`ls\`, \`pwd\`, \`whoami\`, \`uname -a\`, \`df -h\`\n` +
        `• Package Management: \`pkg install <pkg>\`, \`pkg update\`, \`apt update\`, \`npm install <pkg>\`, \`pip install <pkg>\`, package removal/deletion.\n` +
        `• Directory Navigation: \`cd <path>\` (Persistent across commands, e.g., \`cd /sdcard/Download\` or \`cd ..\`)\n` +
        `• Script Execution: Run Python, Node.js, Bash scripts seamlessly (\`python3 main.py\`, \`node index.js\`, \`bash start.sh\`)\n` +
        `• Interactive Prompts & Reply: If a command prompts for input (like \`[Y/n]\` or Python \`input()\`), the bot will send an interactive prompt message. Simply Reply to that message with your input (\`y\`, \`yes\`, text) or type \`kill\` to stop the process!\n\n` +
        `💡 𝖤𝗑𝖺𝗆𝗉𝗅𝖾𝗌:\n` +
        `• \`{pn} pkg install python -y\`\n` +
        `• \`{pn} cd bot && node index.js\`\n` +
        `• \`{pn} python3 -c "print('Hello World')"\``;

      return api.sendMessage(manualText, threadID, messageID);
    }

    if (/^cd(\s+.*)?$/.test(commandText)) {
      const targetDir = commandText.replace(/^cd\s*/, "").trim() || process.env.HOME || "/";
      const resolvedPath = path.resolve(currentCwd, targetDir.replace(/^~/, process.env.HOME || ""));

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        currentCwd = resolvedPath;
        return api.sendMessage(`📂 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗒 𝖼𝗁𝖺𝗇𝗀𝖾𝖽 𝗍𝗈:\n\`${currentCwd}\``, threadID, messageID);
      } else {
        return api.sendMessage(`❌ 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗒 𝗇𝗈𝗍 𝖿𝗈𝗎𝗇𝖽:\n\`${resolvedPath}\``, threadID, messageID);
      }
    }

    api.setMessageReaction("⏳", messageID, () => {}, true);

    const child = spawn(commandText, {
      shell: true,
      cwd: currentCwd,
      env: { ...process.env, TERM: "xterm-256color", PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let outputBuffer = "";
    let isFinished = false;
    let promptSent = false;
    let promptTimer = null;

    const procObj = { child, senderID, isFinished: false };

    const sendOutputMessage = (text, isFinal) => {
      let cleanText = text.trim() || (isFinal ? "✅ Command executed successfully with no output." : "");
      if (!cleanText) return;

      if (cleanText.length > 3800) {
        cleanText = cleanText.substring(0, 3800) + "\n\n...[Output Truncated]";
      }

      const header = isFinal
        ? `𓍢ִ໋🌸✧ ── ͟͟͞͞Sʜᴇʟʟ Oᴜᴛᴘᴜᴛ ── ✧🌸𓍢ִ໋`
        : `⌨️ ── ͟͟͞͞Iɴᴘᴜᴛ Rᴇǫᴜɪʀᴇᴅ (Reply with 'y', text, or 'kill') ── ⌨️`;

      api.sendMessage(`${header}\n\n\`\`\`bash\n${cleanText}\n\`\`\``, threadID, (err, info) => {
        if (!err && info && !isFinal) {
          activeProcesses.set(info.messageID, procObj);
          global.GoatBot?.onReply?.set(info.messageID, {
            commandName: module.exports.config.name,
            messageID: info.messageID,
            author: senderID
          });
        }
      }, messageID);
    };

    const resetInputWaitTimer = () => {
      if (promptTimer) clearTimeout(promptTimer);
      promptTimer = setTimeout(() => {
        if (!isFinished && outputBuffer.trim()) {
          promptSent = true;
          const currentOut = outputBuffer;
          outputBuffer = "";
          sendOutputMessage(currentOut, false);
        }
      }, 3000);
    };

    child.stdout.on("data", (data) => {
      outputBuffer += data.toString();
      resetInputWaitTimer();
    });

    child.stderr.on("data", (data) => {
      outputBuffer += data.toString();
      resetInputWaitTimer();
    });

    child.on("close", (code) => {
      isFinished = true;
      procObj.isFinished = true;
      if (promptTimer) clearTimeout(promptTimer);

      api.setMessageReaction("✅", messageID, () => {}, true);

      if (outputBuffer.trim() || !promptSent) {
        sendOutputMessage(outputBuffer || `✅ Process completed with exit code ${code}.`, true);
      }
    });

    child.on("error", (err) => {
      isFinished = true;
      procObj.isFinished = true;
      if (promptTimer) clearTimeout(promptTimer);

      api.setMessageReaction("❌", messageID, () => {}, true);
      api.sendMessage(`❌ Execution Error:\n\`\`\`bash\n${err.message}\n\`\`\``, threadID, messageID);
    });
  },

  onReply: async function ({ api, event, Reply }) {
    const { threadID, messageID, senderID, body } = event;
    const procData = activeProcesses.get(Reply.messageID);

    if (!procData || procData.isFinished || !procData.child || procData.child.killed) {
      return api.sendMessage("⚠️ This terminal process has already ended.", threadID, messageID);
    }

    if (senderID !== procData.senderID) return;

    const input = body.trim();
    if (input.toLowerCase() === "kill" || input.toLowerCase() === "exit" || input === "^C") {
      procData.child.kill("SIGKILL");
      procData.isFinished = true;
      activeProcesses.delete(Reply.messageID);
      return api.sendMessage("🛑 Process terminated.", threadID, messageID);
    }

    try {
      api.setMessageReaction("⌨️", messageID, () => {}, true);
      procData.child.stdin.write(input + "\n");
    } catch (err) {
      api.sendMessage(`❌ Failed to send input: ${err.message}`, threadID, messageID);
    }
  }
};