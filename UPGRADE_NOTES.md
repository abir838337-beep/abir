# Aliya Official V4 - final upgrade notes

Everything below is in English. No markdown bold stars are used.

## 1. Account switching (the main request)

There are exactly 5 slots:

1. account.txt
2. account2.txt
3. account3.txt
4. account4.txt
5. account5.txt

Login order is account.txt first, then account2.txt, account3.txt, account4.txt, account5.txt.
If a login fails, that slot is marked with the real reason (expired, suspended, checkpoint, 2FA, network, other) and the next slot is tried in the same run. Resting slots are still tried as a last resort, so the bot keeps trying until one account logs in or all five are really dead.

The shared state lives in bot/login/data/accounts.json. Aliya.js, Wolf.js and the admin command all read and write this one file. A damaged state file is copied to accounts.corrupt-<timestamp>.json and rebuilt automatically.

A corrupted cookie file is never deleted. It is reported as INVALID FORMAT / EMPTY and skipped.

## 2. Admin commands (replace the prefix with yours, default is "(")

account status          Shows all 5 slots: active, available, resting, failed, logged out, suspended, plus the masked ID and reason.
account list            Same as status.
account switch 2        Forces slot 2 (account2.txt) on the next restart. Accepts 1 to 5.
account next            Switches to the next healthy standby slot.
account reset 3         Clears the failure record of slot 3 so it is tried at once.
account reset all       Clears all failure records.
account auto            Removes a forced switch and returns to the normal account.txt first order.

Aliases: acc, switchacc, accounts, pool. Only Bot Admin (role 2) can use them.
The same commands also exist inside Wolf safe mode, so they work even when a command file is broken.
The old broken .preferred_account file is no longer used. Switching now writes the real forced slot into the shared state.

## 2b. Typing indicator

config.json now has:

  typingIndicator.enable       true by default
  typingIndicator.refreshMs    5000, keeps the indicator alive on slow commands
  typingIndicator.onReply      true, reply-based commands also show typing
  typingIndicator.onReaction   true, reaction commands also show typing

Set enable to false if you do not want it. The indicator is sent before a command starts, refreshed while it runs, and cleared afterwards on success or error. It is shared by the main engine and Wolf safe mode.

## 2c. Language files and missing keys

The languages folder is now safe when a translation file is missing:

- languages/en.lang is the always-present source of default global text.
- languages/bn.lang is complete for the keys used by the bot. If a key is missing in any language file, it is filled from en.lang automatically instead of printing "Can't find text" during startup.
- languages/cmds/bn.js and languages/events/bn.js have been added. They reuse the English command text until individual commands are translated.
- languages/cmds/vi.js and languages/events/vi.js have been added for the same reason.
- If config.language or a group language points to a language code with no file, the bot now loads en.js for command and event text and en.lang for global text. A missing file logs one warning and does not stop the bot.
- A broken or unreadable language file is skipped with a warning; the bot continues with English text.
- Language codes are sanitized before they are used in a file path, so a bad language value cannot point outside the languages folder.
- If config.json is reloaded while the bot is running, getText follows the new language instead of keeping the first language seen at startup.
- The command/event language loader now lives in bot/handler/commandLanguage.js and is shared by Aliya.js and Wolf safe mode, so safe mode also sees custom language text.
- updater.js now uses the same language loader instead of its own copy, so an update message cannot fail because a translation file is missing.
- Development mode no longer fails when handlerEvents.dev.js is not present; it falls back to handlerEvents.js.
- A full scan of all global getText calls found one missing key, Goat.googleApiRefreshTokenExpired, used by the dashboard when the Google refresh token dies. It is now defined in both en.lang and bn.lang, so that error path shows a real message instead of "Missing language key". All other global keys are present in both files.

This fixes the startup/cmd failure when the language was changed to bn or to any code whose language file was not shipped.

## 3. Self healing and failover

index.js is the permanent supervisor. It opens the public port first, so health checks pass while the bot is still logging in.

Exit codes:
0 clean exit, restart in 1s
1 crash, restart with back-off
2 planned restart (memory guard, schedule, MQTT unstable)
3 all accounts failed, show the "Restarting / Offline" page and retry with back-off
4 engine cannot run, switch to Wolf.js immediately
5 account dead or switched, restart on the next account
6 npm package missing, install and restart
7 fast restart requested by an admin account switch or by Wolf.js hand-back

Healing included:
- main engine crash loop sends Wolf.js, then retries Aliya.js later
- frozen bot (no heartbeat) is killed and restarted
- login hang (no READY within 6 minutes) is killed and retried on the next account
- missing npm packages are installed by the supervisor
- account files are watched; editing a cookie while offline triggers an immediate retry
- health JSON: /health, /healthz, /status.json, /api/status
- keep-awake self ping on Render, Railway and Replit
- Wolf.js doctor repairs missing modules, native module mismatch, broken JSON config, corrupted SQLite, full disk and syntax errors where possible

## 3b. sqlite3 binding failure no longer stops the bot

The error "Could not locate the bindings file ... node_modules/sqlite3/build/node_sqlite3.node" happens when the native sqlite3 addon was not compiled for the current device or Node version. This is common on Termux because there is no prebuilt Android binary. Previously database/controller/index.js logged the error and called process.exit(), so Aliya.js died immediately after a successful login and the supervisor just restarted it in a loop.

Now:

- sqlite3 stays the primary database because it is the fastest option when it works.
- If its binding is missing or incompatible, the bot automatically switches to the built-in JSON database and continues starting. No manual edit and no crash loop.
- The switch is controlled by config.json -> database.fallbackToJson (true by default). Set it to false only if you deliberately want the bot to stop when sqlite is broken.
- A clear startup message explains what happened and gives the repair command: npm rebuild sqlite3 --build-from-source
- termux-setup.sh now forces a local sqlite3 build and checks that the binding file actually exists; if it does not, it tells you the JSON fallback will be used.
- Once sqlite3 is repaired, set database.type back to sqlite (it is already sqlite by default) and restart to use the SQLite file again.

## 4. Fixed bugs in this upgrade

- IPC messages from Wolf used lower-case names; the supervisor expected upper case. Both are accepted now.
- Wolf hand-back used exit code 3, which the supervisor read as "all accounts failed" and showed the offline page. Hand-back now uses code 7.
- The account command wrote .preferred_account, but nothing read it. It now calls the shared account manager.
- The network error classifier had literal spaces in its regex, so ENOTFOUND/ETIMEDOUT were never recognised.
- Suspended accounts never recovered from a stale status entry. Cooldowns now expire and suspended slots are retried last.
- The root accountPool.js pointed to ../../accountManager.js outside the project. It is now a safe shim to the real pool.
- The admin alert used undefined note fields (n.file / n.kind). It now prints the real stored reason.
- isChildRunning() treated a terminating child as already gone because of child.killed, which could start two bots. It now checks real exit codes.
- package.json did not declare lodash and mime-db, although utils.js requires them. Both are declared now.
- bcrypt was a native module that often failed to compile on Termux. It is replaced by the pure-JavaScript bcryptjs in the dashboard; the API used by the project is compatible.
- package.json engine range is now Node 20 and newer, so Termux Node 22 does not cause an engine warning.
- Fake npm packages named after Node built-ins (child_process, fs, https, path, os) were removed; Node always uses the real built-ins.
- Added .npmrc with engine-strict=false and legacy-peer-deps=true so npm 7+ does not reject this older dependency tree on a fresh install.
- Typing indicator: the old code sent the arguments in the wrong order for the bundled fb-chat-api (it passed threadID as the first argument). Added bot/handler/typingIndicator.js, which detects the library signature and correctly sends isTyping=true while a command runs and isTyping=false when it finishes. It refreshes every 5 seconds for slow commands and is ref-counted so parallel commands in one thread do not fight over the indicator. Works in Aliya.js and in Wolf safe mode. Configurable under config.json -> typingIndicator.

## 5. Platforms

Full bot: Render (render.yaml), Railway (railway.json), Replit (replit.nix), Docker (Dockerfile), PM2 (ecosystem.config.js), Linux/Ubuntu service (aliya.service + start.sh), Termux (termux-setup.sh), VPS (npm start or pm2).

Vercel: a serverless function cannot hold a permanent Messenger MQTT connection. Vercel therefore serves the new dependency-free status page in api/status.js. vercel.json routes every path to it. Deploy the actual bot on one of the permanent hosts above.

Termux: a plain npm install is not guaranteed to be smooth because sqlite3 and sharp are native modules. canvas is no longer a problem: package.json installs it as an alias to @napi-rs/canvas, which has a prebuilt aarch64-linux-android binary, so no Cairo/Pango node-gyp build is needed. require("canvas") still works in every image command. Run "bash termux-setup.sh" instead of a plain install. It verifies canvas, retries npm install safely and rebuilds sqlite3 when needed. Full details are in TERMUX_INSTALL.md.

Start commands:
  node index.js
  npm start
  pm2 start ecosystem.config.js

## 6. Optional zip

Everything was upgraded directly in this folder, so there is nothing to copy by hand. If you still want a single archive, run:

  npm run zip

This creates Aliya-Official-V4-personal-full.zip using only Node built-ins. It includes your cookie files, so keep the archive private.

## 7. Safety notes

Cookie values, tokens and passwords are stripped from logs, status pages and the admin report. Only masked IDs and short error reasons are shown. Your config.json contains real Google OAuth secrets from the previous setup; regenerate them if this project is public.
