# 👑 Aliya V4 – Universal Deploy Guide

Node `>=20` (tested flow: Node 22 → 26), npm `>=9`.

## 1. File replace koro
| File | Kothay |
|---|---|
| `index.js`, `Aliya.js`, `package.json` | project root |
| `bot/login/login.js` | `bot/login/login.js` |
| baki shob (`Dockerfile`, `render.yaml`, `start.sh` ...) | project root (je platform use korba shudhu seta lage) |

Tarpor **ekbar**: `rm -f package-lock.json && npm install` (lock file purano Node 20 er, ta delete kore notun banao).

## 2. Platform wise
| Platform | Kibhabe |
|---|---|
| **VS Code / Linux** | `npm install` → `npm start` (ba `./start.sh`) |
| **Termux** | `bash termux-setup.sh` → `./start.sh bg` · Battery → Termux → *Unrestricted* |
| **VPS** | `./start.sh pm2` (reboot er por auto on) ba `aliya.service` (systemd) |
| **Docker** | `docker build -t aliya . && docker run -d --restart always -p 8080:8080 aliya` |
| **Render** | repo connect → `render.yaml` auto nibe · Health path `/health` |
| **Railway** | repo connect → `railway.json` auto nibe |
| **Replit** | `.replit` + `replit.nix` upload → Deploy → **Reserved VM** (24/7) |
| **Vercel** | ❌ Messenger bot 24/7 cholbe na (serverless, background process nai). Railway/Render/VPS use koro |

## 3. Bot jno kokhono off na hoy
- `index.js` ekhon **exit code 0** hole-o bot restart kore (age server bondho hoye jeto).
- Network fail (GitHub gban/notification/version check) hole bot ar bondho hoy na, shudhu warning dey.
- Port **~100ms e open** hoy → Render/Railway/Replit health check pass kore, bot login korte thakleo.
- Bar bar crash korle wait barhe (2s → 4s → … max 5 min) → Facebook account login-spam e lock hoy na.
- RAM limit onujayi heap cap auto set hoy (`ALIYA_MAX_MEM_MB` diye change kora jay).

## 4. Dhyan rakho
- **Render free** 15 min inactive thakle ghumay → `config.json` e `autoUptime.enable: true` + `url` dao, ba UptimeRobot e `/health` ping koro.
- **Ephemeral disk** (Render free, Railway volume chara, Docker) → redeploy e SQLite data jay. `database.type: "mongodb"` + `uriMongodb` use koro. Cookie er jonno `ACCOUNT_TXT_B64` env dao (`base64 -w0 account.txt`).
- `NODE_ENV` set koro na (`production` dile dashboard `account.dev.txt` e likhe).
- `update` command GitHub theke file overwrite kore (`package.json` shoho). Age ei notun file gulo nijer repo te push koro, na hole purano version fire ashbe.
- `update.js` remote code `eval` kore → repo/account compromise hole risk. Use na korle command ta remove koro.
- `config.json` e Gmail `clientSecret`/`refreshToken` ache. Repo public hole Google Cloud theke **rotate** koro.
- `canvas` package.json e nai (notun Node/Termux e build hoy na). Tomar `scripts/cmds` e `require("canvas")` thakle `@napi-rs/canvas` use koro.
- `sqlite3` Termux e compile hoy (ek-bar, 3-6 min). Baki platform e prebuilt, fast.
