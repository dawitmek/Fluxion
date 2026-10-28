# Self-hosting

One container runs the server, dashboard and overlay; a second runs Postgres. Migrations apply on startup.

```sh
git clone <this repo> && cd Fluxion
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD (and EULER_API_KEY if you have one)
docker compose -f docker/compose.yml --env-file .env up -d --build
```

Fluxion is now on `http://127.0.0.1:3000`. Update with `git pull` and the same command; data lives in the
`pgdata` volume.

## HTTPS

Login cookies are `Secure` by default, so browsers only send them over HTTPS (or `localhost`). Put a reverse
proxy in front. With [Caddy](https://caddyserver.com), which gets certificates automatically, a `Caddyfile` is:

```
fluxion.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

WebSockets (`/ws/companion`, `/ws/overlay`) pass through Caddy with no extra config. Companions then pair with
`https://fluxion.example.com`.

## Settings (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | required | Database password |
| `EULER_API_KEY` | empty | Optional Euler Stream key for TikTok request signing |
| `COOKIE_SECURE` | `true` | Set `false` only to use plain HTTP on a private network |
| `FLUXION_BIND` | `127.0.0.1` | Interface the port is published on; `0.0.0.0` exposes it on the LAN |
| `FLUXION_PORT` | `3000` | Published port |

Browsers share cookies between servers on the same host name regardless of port, so two Fluxion servers on
`127.0.0.1:3000` and `127.0.0.1:3131` log each other out in one browser. Use different host names (for example
`localhost` for one and `127.0.0.1` for the other) or separate browser profiles.

## Text-to-speech

The image includes [Piper](https://github.com/rhasspy/piper) and two English voices, so the "Piper" voice engine
works out of the box. Each spoken line costs a little server CPU (about half a second for a short line).

- Smaller image without Piper (about 170 MB less): add `args: { WITH_PIPER: "false" }` under `build:` in
  `docker/compose.yml`. Hosts who pick Piper then get the in-overlay eSpeak voice instead.
- More voices: mount a folder of Piper voices (`.onnx` + `.onnx.json` pairs) at `/opt/piper-voices`. Check each
  voice's license first; see `THIRD_PARTY_NOTICES.md`.
- Running without Docker: set `PIPER_BIN` (the `piper` executable) and `PIPER_VOICES_DIR` in `.env`.

Hosts who choose the "cloud" engine store their own Google / Azure / ElevenLabs API key in the database. It is
never sent back to the browser, but it is stored as plain text, so protect database access and backups.

## Backups

```sh
docker compose -f docker/compose.yml --env-file .env exec postgres pg_dump -U fluxion fluxion > fluxion.sql
```
