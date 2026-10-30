# Self-hosting

Run your own Fluxion server. One container runs the server, dashboard and overlay, a second runs Postgres, and an
optional third runs [Caddy](https://caddyserver.com) for automatic HTTPS. The companion app isn't part of this: it
runs on the PC that plays the game and connects to your server.

There are three ways to run it:

- **On a public server with a domain:** follow the steps below. This is the one to use for going live, because
  overlays and companions can reach it from anywhere.
- **Only on your own PC:** see [Just on your own PC](#just-on-your-own-pc).
- **On a home network:** see [On a private network](#on-a-private-network).

## Before you start

You need:

- A Linux server with [Docker](https://docs.docker.com/engine/install/) (with Compose) and Git
- About 2 GB of free disk space for the build. The finished image is about 700 MB with all five voices; see
  [Text-to-speech](#text-to-speech) for a smaller one
- A domain or subdomain you can point at the server, such as `fluxion.example.com`
- Ports 80 and 443 open to the internet

Run every command from the `Fluxion` folder.

## Step by step

### 1. Point your domain at the server

Add an `A` record for your domain with the server's IP address, at your domain provider. Caddy can't get a
certificate until this works, so check it first:

```sh
dig +short fluxion.example.com
```

This should print your server's IP address.

### 2. Get the code

```sh
git clone https://github.com/dawitmek/Fluxion && cd Fluxion
```

### 3. Create your settings

Replace the domain with yours, then run this. It creates a `.env` file with a random database password and
encryption key:

```sh
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRETS_KEY=$(openssl rand -base64 32)
DOMAIN=fluxion.example.com
COMPOSE_PROFILES=https
EOF
```

Copy `.env` somewhere safe, such as a password manager. If you lose `SECRETS_KEY`, hosts have to enter their saved
API keys and TikTok sign-ins again.

### 4. Start Fluxion

```sh
docker compose -f docker/compose.yml --env-file .env up -d --build
```

The first build takes a while, because it downloads the voices. Database migrations run by themselves on startup.

### 5. Check it's running

```sh
docker compose -f docker/compose.yml --env-file .env ps
curl https://fluxion.example.com/api/health
```

All three services should show as `Up`, and the second command should print `{"ok":true,...}`. The certificate can
take a minute to arrive the first time.

### 6. Create your account

Open your domain in a browser and sign up.

**Signups are open to anyone who can reach your server.** Each account can upload files and use your server's voices,
and there's no switch to turn signups off yet, so only share the address with people you trust.

### 7. Connect the companion

1. On the gaming PC, install the companion from your server's `/download` page.
2. In the dashboard, open the Companion page and click **Create pairing code**. The code lasts 10 minutes.
3. In the companion, enter your full address, such as `https://fluxion.example.com`, and the code.

### 8. Add the overlay

Copy the overlay link from the dashboard's overlay page and add it to OBS or LIVE Studio as a Browser source. Treat
this link like a password: anyone who has it can watch your overlay's live data, and it can't be changed yet.

## Just on your own PC

For trying Fluxion out. Leave out `DOMAIN` and `COMPOSE_PROFILES`:

```sh
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRETS_KEY=$(openssl rand -base64 32)
EOF
docker compose -f docker/compose.yml --env-file .env up -d --build
```

Fluxion is then on `http://localhost:3000`, and nothing outside your PC can reach it. Pair the companion with
`http://localhost:3000`.

## On a private network

To reach Fluxion from other devices at home, over plain HTTP, add these to `.env` and start it the same way:

```sh
COOKIE_SECURE=false
FLUXION_BIND=0.0.0.0
TRUST_PROXY=none
```

Use `http://<this PC's address>:3000`. Logins and the companion's tokens travel unencrypted, so only do this on a
network you trust, and never forward the port to the internet.

## Using your own reverse proxy

Leave out `DOMAIN` and `COMPOSE_PROFILES`, and proxy to `127.0.0.1:3000`. With Caddy already on the host:

```
fluxion.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

WebSockets (`/ws/companion`, `/ws/overlay`) need to pass through too, which Caddy does with no extra config. If your
proxy isn't on the same machine, set `TRUST_PROXY` to its address, or everyone may share one rate limit.

## Updating

```sh
git pull
docker compose -f docker/compose.yml --env-file .env up -d --build
```

Your data stays in Docker volumes. Back up first, because migrations run on startup.

## Backups

Save the database:

```sh
docker compose -f docker/compose.yml --env-file .env exec -T postgres pg_dump -U fluxion --clean --if-exists fluxion > fluxion.sql
```

A backup is only complete with `.env`: without `SECRETS_KEY`, the saved keys in it can't be read.

To restore one, stop the server, load the file and start it again:

```sh
docker compose -f docker/compose.yml --env-file .env stop fluxion
docker compose -f docker/compose.yml --env-file .env exec -T postgres psql -q -U fluxion -d fluxion < fluxion.sql
docker compose -f docker/compose.yml --env-file .env start fluxion
```

## Troubleshooting

See what a service is doing with `docker compose -f docker/compose.yml --env-file .env logs -f fluxion` (or `caddy`).

| Problem | Likely cause |
| --- | --- |
| `set POSTGRES_PASSWORD in .env` when starting | `.env` is missing or a value is empty, or you left out `--env-file .env` |
| No HTTPS, or a certificate error | The domain doesn't point at this server yet, or ports 80 and 443 are closed. Check `logs -f caddy` |
| You can sign in but are signed out straight away | You're on plain HTTP. Use HTTPS or `localhost`, or set `COOKIE_SECURE=false` on a private network |
| The companion won't pair | Use the full address, with `https://`. Pairing codes last 10 minutes and work once |
| Everyone gets "too many requests" at login | Your own proxy's address isn't in `TRUST_PROXY`, so all visitors share one limit |
| The database rejects its password | `POSTGRES_PASSWORD` only applies the first time Postgres starts, so changing it in `.env` later doesn't change the database |

## Settings (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | required | Database password |
| `SECRETS_KEY` | required | Encrypts hosts' API keys and TikTok sessions in the database. 32 random bytes in base64: `openssl rand -base64 32`. Back it up with the database; if it's lost or changed, hosts must enter those again |
| `EULER_API_KEY` | empty | Optional Euler Stream key for TikTok request signing |
| `TIKTOK_SESSION_ID` | empty | Optional `sessionid` cookie of a TikTok account, for TikTok voices. Every host without their own sign-in uses it. Use a spare account: the TikTok voice API is unofficial |
| `DOMAIN` | empty | Your domain, for automatic HTTPS. Used with `COMPOSE_PROFILES=https` |
| `COMPOSE_PROFILES` | empty | Set to `https` to run Caddy |
| `COOKIE_SECURE` | `true` | Set `false` only to use plain HTTP on a private network |
| `TRUST_PROXY` | `loopback,uniquelocal` | Which addresses are your reverse proxy, so rate limits apply per visitor: addresses, ranges, or `loopback` and `uniquelocal` (private networks). The default suits the built-in Caddy or a proxy on the same machine. With no proxy (port published on a LAN), set `none`, or clients could fake their address |
| `FLUXION_BIND` | `127.0.0.1` | Interface the port is published on; `0.0.0.0` exposes it on the LAN |
| `FLUXION_PORT` | `3000` | Published port |

Browsers share cookies between servers on the same host name regardless of port, so two Fluxion servers on
`127.0.0.1:3000` and `127.0.0.1:3131` log each other out in one browser. Use different host names (for example
`localhost` for one and `127.0.0.1` for the other) or separate browser profiles.

## Text-to-speech

The image includes [Piper](https://github.com/rhasspy/piper) and five English voices (two of them multi-speaker, with 904 and 109 speakers), so the "Piper" voice engine
works out of the box. Each spoken line costs a little server CPU (about half a second for a short line).

- Smaller image: under `build:` in `docker/compose.yml`, add `args: { WITH_PIPER: "false" }` to leave Piper out
  (about 360 MB less; hosts who pick Piper get the in-overlay eSpeak voice instead), or
  `args: { PIPER_VOICES: "en_GB/alba/medium/en_GB-alba-medium" }` to bundle fewer voices (each is 60–80 MB).
- More voices: mount a folder of Piper voices (`.onnx` + `.onnx.json` pairs) at `/opt/piper-voices`. Check each
  voice's license first; see `THIRD_PARTY_NOTICES.md`.
- Running without Docker: set `PIPER_BIN` (the `piper` executable) and `PIPER_VOICES_DIR` in `.env`.

Hosts who choose the "cloud" engine store their own Google / Azure / ElevenLabs API key in the database. It is
never sent back to the browser, and it's encrypted in the database with `SECRETS_KEY`.
