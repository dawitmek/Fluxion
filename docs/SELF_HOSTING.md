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

## Backups

```sh
docker compose -f docker/compose.yml --env-file .env exec postgres pg_dump -U fluxion fluxion > fluxion.sql
```
