# Fluxion

Let a TikTok LIVE audience play the host's game together. Viewers type commands or send gifts; Fluxion turns them into key presses in the host's game.

> Rebuild in progress. The original prototype is preserved at the `v0-legacy` tag.

## Layout

| Path | What |
| --- | --- |
| `apps/server` | Fastify + WebSockets: TikTok connection, mode engine, API. Serves the built web app in production. |
| `apps/web` | React + Vite: host dashboard and stream overlay |
| `apps/companion` | Tauri 2 desktop agent: presses whitelisted keys in the host's game |
| `packages/shared` | Protocol types shared by all three |
| `docker/compose.yml`, `Dockerfile` | Self-hosting (server + Postgres) |

## Development

Requires Node 22+ and Docker (for Postgres). The companion also needs Rust ([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```sh
npm install
cp .env.example .env
npm run db:up                         # Postgres on 127.0.0.1:5432 (plus a fluxion_test database)
npm run build -w packages/shared
npm run dev:server                    # http://127.0.0.1:3000, applies migrations on start
npm run dev:web                       # http://localhost:5173, proxies /api and /ws to the server
npm run tauri dev -w apps/companion
npm test                              # unit + end-to-end tests (needs db:up)
```

The companion pairs with whatever server address you give it (e.g. `http://127.0.0.1:3000`). Key input currently works on Windows only.

After changing `apps/server/src/db/schema.ts`, run `npm run db:generate -w apps/server` to create a migration.

Production: `npm run build && npm start` serves everything from one address. To self-host with Docker, see `docs/SELF_HOSTING.md`. Third-party components and their licenses: `THIRD_PARTY_NOTICES.md`.
