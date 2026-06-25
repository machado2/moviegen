# Deploy / persistence (host: vmmint, LAN 192.168.15.9)

The server's LLM gateway key (`LLM_API_KEY`) must survive VM/service restarts —
otherwise the screenplay parse and prompt generation break until someone
re-exports it by hand (TASK-3). Two pieces make that work:

1. **The app loads a persistent `.env` in every launch mode.** `backend/src/env.ts`
   is imported first by the server and reads the nearest `.env` (walking up from
   the working directory, or `DOTENV_PATH` if set) without overriding variables
   already present in the real environment. So a single gitignored `.env` on the
   host is authoritative for `pnpm dev`, `pnpm start`, and the systemd service
   alike. `.env` is gitignored — the key never lands in the repo.

2. **A systemd unit keeps the server running across reboots**, loading the same
   `.env` via `EnvironmentFile`.

## One-time setup on the host

```sh
# 1. Create the persistent env file (gitignored). Use the LiteLLM gateway key.
cp .env.example .env
$EDITOR .env            # set LLM_API_KEY=sk-…  (and DATA_DIR / LLM_BASE_URL if needed)
chmod 600 .env          # it holds a secret

# 2. Build once.
pnpm install
pnpm build

# 3. Install + start the service (as root).
sudo cp deploy/mediagen.service /etc/systemd/system/mediagen.service
sudo systemctl daemon-reload
sudo systemctl enable --now mediagen
```

## Verify it survives a restart

```sh
sudo systemctl restart mediagen
curl -s http://localhost:3000/api/v1/settings | grep -o '"apiKeyFromEnv":[a-z]*'
#  → "apiKeyFromEnv":true   (the key came from the persistent .env)
```

A parse from the UI then works with no manual key entry. A full host reboot
brings the service (and the key) back automatically because the unit is enabled.
