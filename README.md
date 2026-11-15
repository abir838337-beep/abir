# 🌸 Aliya Bot v2

Messenger bot, ekbar setup korle nijei chole. Moderation, economy, games, music/video, AI chat (Claude/Gemini).

## Quick start (jekono jaygay)

1. `ADMIN_IDS` = tomar Facebook UID, `APPSTATE` = cookies JSON (**alada/test account** er).
2. `npm start` (prothom bar dependencies nijei install hoy).
3. `npm run doctor` chalale bole dibe ki baki ache.

| Platform | Ki korbe |
|---|---|
| **Render** | New Web Service, repo connect (render.yaml ache). Env vars dao. Free plan e UptimeRobot diye `/health` ping koro |
| **Railway** | Repo deploy, Variables e env dao (railway.json ache, auto restart ON) |
| **Replit** | Import, Secrets e env dao, Run. Free plan sleep kore, UptimeRobot ping koro |
| **VS Code / PC** | `.env.example` ke `.env` banao, fill koro, `npm start` |
| **Termux** | `bash scripts/termux.sh` (nodejs + pm2 + wake-lock setup kore) |
| **Linux VPS** | `npm run pm2` + `pm2 save && pm2 startup`, ba `deploy/aliya-bot.service` (systemd) |
| **Docker** | `docker build -t aliya . && docker run --env-file .env -p 3000:3000 aliya` |
| **Vercel** | ❌ Cholbe na. Vercel serverless, bot er 24/7 connection rakhte pare na |

Node 18+ (20, 22, 26 sob) cholbe. `engines` e upper limit nai.

## Bot jno off na hoy (auto kaj gula)

- **Supervisor** (`index.js`) bot ke crash/freeze hole nijei restart kore (backoff 2s→60s).
- Port prothome-i khole, tai hosting health check pass kore, bot login howar age-i.
- **Freeze watchdog**: 2 min heartbeat na paile kill kore restart.
- **Memory guard**: RAM limit auto-detect kore, beshi hole planned restart.
- **12 ghonta por por restart** (fresh MQTT session), config.json `autoRestartHours`.
- **Cookie auto-refresh**: 30 min por por session save kore, tai cookies beshi din bnche.
- **Self-ping**: Render/Railway/Replit e nijer URL ping kore (sleep komay).
- **Auto backup** 6 ghonta por por (`backup`, `backup restore` command).
- Cookies expire hole crash-loop kore na, 10 min por por retry kore ar alert pathay (Discord/Telegram set thakle).

## Onek group handle korar jonno

- Prottek group er message **serial**, alada group **parallel** (default 25 ekshathe).
- **Send throttle**: sekhane 5 msg/sec max, group-wise gap, ekbar retry. Facebook "too fast" block theke bachay.
- Duplicate event drop, flood hole puran queued event drop.
- Group admin lookup lazy + cached (shudhu lagle API call).
- Sob cache size-capped, memory leak nai.

## Commands (prefix `/`)

- **Group:** `antispam`, `welcome`, `antiout`, `npx` (prefix chara), `gname`, `kick`, `warn`
- **Admin:** `approve`, `ban`, `unban`, `vip`, `backup`, `restart` (role 4)
- **Economy:** `balance`, `daily`, `work`, `send`, `top`
- **Games:** `slots`, `flip`, `rps`, `guess`
- **Media:** `music`, `video` · **AI:** `ai` · **System:** `help`, `ping`

Roles: 0 sobai, 1 group admin, 2 VIP, 3 bot admin, 4 developer. Notun command: `commands/` e `.js` file dao
(`config` + `run`; optional `onChat`, `onReply`, `onReaction`).

## Dhoro (limits)

- 100% off na hoy, eta kono bot dite pare na. Cookies expire, Facebook checkpoint/ban, ba free host er limit hole bondho hobe, tobe bot nijei recover kore ar alert dey.
- Render free e disk reset hoy: data rakhte `DATA_DIR` e persistent disk dao.
- Unofficial Facebook login Facebook er rules er against, ban er jhuki ache. Main account use koro na.
- Music/video unofficial YouTube library, mawkhe mawkhe vangte pare.
- Login library `@dongdev/fca-unofficial` (fallback: `ws3-fca`). Eta vange gele `config.json` e `fcaPackage` bodlao.
