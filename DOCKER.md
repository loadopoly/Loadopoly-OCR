# Loadopoly-OCR Docker

Run GeoGraph / Loadopoly-OCR in Docker on WSL or Windows, then attach
`loadopoly.com` / `www.loadopoly.com` through Cloudflare.

## Prerequisites

- Docker Desktop 4.x with the WSL 2 backend
- Ubuntu WSL distro (`agard@GARDDesktop`)
- Optional: `.env.local` copied from `.env.example`
- Cloudflare account that already owns `loadopoly.com` DNS
  (`cleo.ns.cloudflare.com` / `elsa.ns.cloudflare.com`)

## Dev server (hot reload)

From `Loadopoly-OCR`:

```bash
cp -n .env.example .env.local
docker compose up --build
```

App: http://localhost:3000

### The QUIPU mesh (Observer + Bakugo)

`docker compose up` now also starts:

| Service | Port | Role |
| --- | --- | --- |
| `quipu` | 7100 | Observer — trains the shared MESH SLM on both corpora |
| `bakugo` | 8765 | Structured card scans (cardcenter + Tesseract) |

Bi-directional flow:

- Loadopoly-OCR (major **unstructured** images) posts completed OCR text to
  `POST /observe` → QUIPU's **vision** axis. Its Gemini prompt receives the
  learned cross-corpus lexicon back as disambiguation priors.
- Bakugo (relatively **structured** images) posts measurement/collector-number
  observations → QUIPU's **touch** axis. QUIPU's numeric priors break ties
  between otherwise-ambiguous catalog collector numbers.
- QUIPU folds both into one mesh (background `train_round`) and enacts the
  result on both via `GET /guidance?source=...`.

Inspect the Observer:

```bash
curl http://localhost:7100/health
curl "http://localhost:7100/guidance?source=loadopoly-ocr"
curl http://localhost:8765/quipu     # Bakugo's view of the link
curl http://localhost:7100/digest    # today's learning
```

Build contexts `../QUIPU` and `../Bakugo` must sit beside this repo.

## Production image

```bash
docker compose --profile prod up --build loadopoly-ocr-prod
```

App: http://localhost:8080

## Cutover order (do not skip)

`www.loadopoly.com` still CNAMEs to `loadopoly.github.io`. If the Pages
redirect workflow is pushed **before** DNS moves, GitHub will replace the
live custom-domain app with a static page.

1. Keep `loadopoly-ocr` healthy on `:3000` (already running).
2. Start a tunnel (`--profile tunnel` or a named tunnel).
3. In Cloudflare, point `www` and `@` at the tunnel (not this PC's IP).
4. Confirm `https://www.loadopoly.com` is served by the Docker app.
5. Remove the GitHub Pages custom domain.
6. **Then** push `.github/workflows/deploy-pages.yml` + `pages-redirect/`
   so `https://loadopoly.github.io/Loadopoly-OCR/` follows the new origin.

## Attach loadopoly.com (Cloudflare Tunnel)

DNS currently points at GitHub Pages:

| Record | Type | Current target |
| --- | --- | --- |
| `www` | CNAME | `loadopoly.github.io` |
| `@` | A | `185.199.108–111.153` (GitHub Pages) |

Do **not** point those records at this PC's public IP (`100.16.37.25`).
Use a Cloudflare Tunnel so TLS and inbound traffic stay on Cloudflare.

### 1. Temporary try-cloudflare hostname

```bash
docker compose --profile tunnel up -d
docker compose --profile tunnel logs -f cloudflared
```

Logs print a `https://*.trycloudflare.com` URL that already proxies
`loadopoly-ocr:3000`. Use that to confirm the container is reachable.

### 2. Named tunnel for the real domain

On a machine with `cloudflared` logged in (`cloudflared tunnel login`):

```bash
cloudflared tunnel create loadopoly-ocr
# copy the printed UUID into cloudflared/config.yml (tunnel: <uuid>)
# copy ~/.cloudflared/<uuid>.json to cloudflared/credentials.json
cloudflared tunnel route dns loadopoly-ocr loadopoly.com
cloudflared tunnel route dns loadopoly-ocr www.loadopoly.com
docker compose --profile named-tunnel up -d
```

Then in Cloudflare DNS:

1. Change `www` from CNAME `loadopoly.github.io` to CNAME
   `<tunnel-id>.cfargotunnel.com` (Proxied / orange cloud).
2. Change apex `@` from the four GitHub Pages A records to the same
   CNAME (Cloudflare CNAME flattening) or to the tunnel CNAME.
3. SSL/TLS mode: **Full (strict)**.
4. In GitHub → repo **Settings → Pages**, remove the custom domain
   `www.loadopoly.com` so Pages stops claiming those IPs.

### Optional local TLS edge (ports 80/443)

Only if this host is publicly reachable and you want Caddy to terminate
TLS instead of a tunnel:

```bash
docker compose --profile edge up -d
```

## Redirect GitHub Pages

`.github/workflows/deploy-pages.yml` now publishes `pages-redirect/`
instead of the Vite app. After that workflow runs,
`https://loadopoly.github.io/Loadopoly-OCR/` meta-refreshes to
`https://www.loadopoly.com/` and keeps path/query/hash.

## VS Code Dev Container

1. Open this folder in VS Code.
2. Command Palette → **Dev Containers: Reopen in Container**.
3. The Vite server starts on port 3000.

## Common commands

```bash
docker compose ps
docker compose logs -f loadopoly-ocr
docker compose --profile tunnel logs -f cloudflared
docker compose down
```
