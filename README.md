# Mango IoT Gateway Platform

**Developed by Prashant Kumar** — Director & Founder, Tech Burst Solutions LLP

**Business Contact:**
- Email: business@techburstsolutions.in, iot.techburst@gmail.com
- Phone/WhatsApp: +91 9310720730
- Web: www.techburstsolutions.in
- Office: New Delhi - 41, India

Enterprise IoT gateway management platform. Cloud server for managing fleets of Raspberry Pi gateways via authenticated MQTT with real-time WebSocket, OTA firmware, remote shell (SSH), and Modbus/GPIO data pipelines.

Production-ready with **Cloudflare** integration: Pages (frontend), Workers (edge API gateway), R2 (firmware storage), CDN/Cache, WAF and Turnstile. The platform connects to **your own external MQTT broker** — no broker is bundled or deployed.

Sister project: **[mango-iot-gateway-client](https://github.com/mango-iot/gateway-client)** — the Go gateway agent that runs on each Pi and connects to this platform.

---

## Features

### Gateway Management
- **Device Inventory** — Paginated list, detail views, status tracking
- **Zero-Touch Provisioning** — Token-based registration, auto-onboarding
- **Remote Commands** — Reboot, agent restart, shell execution, relay control, register reads
- **OTA Firmware** — Deploy firmware images to selected gateways with history tracking
- **Real-Time Telemetry** — CPU, RAM, disk, temperature, network via MQTT → WebSocket push

### Secure Remote Console (Reverse-Connection)
- **The backend NEVER connects to gateways.** The lightweight **Gateway Agent**
  running on (or beside) each gateway opens a single persistent **outbound TLS
  WebSocket** to the backend — so it works behind NAT, CGNAT, firewalls,
  cellular and dynamic IPs with **zero inbound ports**.
- Browser → backend → agent PTY relay (xterm.js). Multi-tab, dark/light theme,
  resizable, reconnect, connection + latency indicators, session recovery.
- SCP-like file upload/download over the same channel.
- Signed, replay-protected wire protocol (HMAC per-gateway keys), 30s heartbeat
  with exponential-backoff reconnect, offline detection.
- Full session audit in PostgreSQL (user, gateway, duration, bytes, commands).
- RBAC: Super Admin / Company Admin / Operator can open terminals; Viewer cannot.
  Strict tenant isolation; concurrent users supported.

### Multi-Protocol Support
| Protocol | Role |
|----------|------|
| MQTT (external broker) | Primary agent ↔ cloud messaging (mqtt / mqtts / ws) |
| Modbus TCP/RTU | Industrial device polling (agent-side) |
| GPIO | Relay control & sensor input (agent-side) |
| WebSocket | Real-time browser updates |

### Security
- JWT authentication with refresh tokens
- MQTT username/password authentication
- AES-256 encrypted sensitive fields
- RBAC-ready permission system
- CORS, rate limiting, Helmet headers

### Production Infrastructure
- Docker Compose deployment (postgres, redis, mosquitto, backend, frontend)
- Health checks on all services
- Resource limits for Pi environments
- Structured logging, log rotation
- One-command setup with auto-generated secrets

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Web Management Portal                           │
│              Next.js 15 + React + Tailwind CSS                      │
│           (Docker container, port 3000)                             │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  HTTP/WS (via Next.js rewrites)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     NestJS Backend API                              │
│   REST (3001) + Socket.IO /terminal (browser) + /agent (agent)     │
│   Prisma ORM → PostgreSQL   •   Redis pub/sub (scale-out relay)     │
└──┬─────────┬─────────┬──────────────────────┬──────────────────────┘
   │         │         │                      │
   ▼         ▼         ▼                      ▼
┌─────────┐ ┌───────┐ ┌──────────────────────────┐
│PostgreSQL│ │ Redis │ │   Mosquitto MQTT Broker   │
│(audit/   │ │(cache/│ │  (1883 MQTT + 9001 WS)   │
│ config)  │ │ relay)│ └──────────┬───────────────┘
└─────────┘ └───────┘            │ mqtt://gateway/+
                                 │
        ┌────────────────────────┼────────────────────────┐
        │   OUTBOUND TLS WebSocket (agent dials backend)   │
        ▼                        ▼                        ▼
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ Pi Gateway #1│        │ Pi Gateway #2│        │ Pi Gateway #N│
  │ Agent (node) │        │ Agent (node) │        │ Agent (node) │
  │ PTY + files  │        │ PTY + files  │        │ PTY + files  │
  └──────────────┘        └──────────────┘        └──────────────┘
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **NestJS** + **Fastify** | HTTP framework |
| **TypeScript** | Type safety |
| **Prisma** | PostgreSQL ORM |
| **PostgreSQL 16** | Primary database |
| **Redis 7** | Caching, session store |
| **External MQTT broker** | Bring your own (mqtt/mqtts/ws) — configured via env |
| **Cloudflare R2** | Firmware & file storage (S3-compatible) |
| **Cloudflare Workers** | Edge API gateway (JWT, rate limit, CORS, headers) |
| **Cloudflare Pages** | Frontend hosting + CDN |
| **Socket.IO** | Real-time WebSocket |
| **ssh2** | SSH terminal proxy |
| **mqtt.js** | MQTT client library |

### Frontend
| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework (App Router) |
| **TypeScript** | Type safety |
| **shadcn/ui** | UI components |
| **Tailwind CSS** | Styling |
| **xterm.js** | Web terminal emulator |
| **Socket.IO Client** | Real-time updates |
| **Recharts** | Charts & metrics |

---

## Quick Start — Production Server

One-command setup on a Linux VM (Ubuntu/Debian):

```bash
git clone https://github.com/mango-iot/gateway-platform.git
cd mango-iot-gateway-platform
sudo bash setup-server.sh
```

This automatically:
1. Installs Docker + Docker Compose
2. Generates all secrets (JWT, DB password, MQTT password, encryption key)
3. Creates Mosquitto config with authentication
4. Generates MQTT password file (pre-boot)
5. Builds & starts all containers (postgres, redis, mosquitto, backend, frontend)
6. Runs database migrations
7. Creates admin user
8. Saves credentials to `/root/.iot-server-credentials`

### What gets deployed

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | 3000 | Web management UI |
| **Backend API** | 3001 | REST + WebSocket + SSH terminal |
| **API Docs** | 3001/docs | Swagger docs |
| **MQTT** | 1883 | Authenticated broker (gateway agents) |
| **MQTT WS** | 9001 | MQTT over WebSocket |
| **PostgreSQL** | 5432 | Database |
| **Redis** | 6379 | Cache |

### Admin credentials

Saved to `/root/.iot-server-credentials` after setup. Includes:
- Admin login (email/password)
- MQTT credentials (for gateway agents)
- Database credentials
- Setup commands for gateway agents

---

## Quick Start — Development

```bash
git clone https://github.com/mango-iot/gateway-platform.git
cd mango-iot-gateway-platform
./start.sh
```

Opens at http://localhost:3000

---

## End-to-End: Deploy Platform + Connect Pi Gateway (Single Command Each)

### 1. Deploy Platform (on your server/VM)
```bash
git clone https://github.com/mango-iot/gateway-platform.git
cd mango-iot-gateway-platform
sudo bash setup-server.sh
```

### 2. Get Credentials & Create Provisioning Token
After platform setup, login at `http://YOUR_SERVER_IP:3000` (admin@iot.com / admin123) and:
1. Go to **Provisioning** page
2. Click **Create Token** → copy the token
3. Note your MQTT credentials from `/root/.iot-server-credentials`

### 3. Connect Pi Gateway (on the Raspberry Pi)
```bash
# Copy client to Pi (from your machine)
scp -r gateway-client pi@YOUR_PI_IP:~/
ssh pi@YOUR_PI_IP
cd gateway-client

# One-command install with all params
sudo bash setup.sh \
  --server mqtt://YOUR_SERVER_IP:1883 \
  --mqtt-user iot \
  --mqtt-pass YOUR_MQTT_PASSWORD \
  --token YOUR_PROVISION_TOKEN \
  --device-id factory-gw-01 \
  --name "Factory Gateway #1"
```

### 4. Enable Remote Terminal (Gateway Agent)
The browser terminal does **not** use SSH. Instead, run the **Gateway Agent**
on (or beside) each gateway. It opens an outbound TLS WebSocket to the backend
— no inbound ports required.

**a) Issue an agent secret** (Admin only) from the API or UI:
```bash
curl -X POST "$API_URL/gateways/<GATEWAY_ID>/agent-secret" \
  -H "Authorization: Bearer $TOKEN"
# => { "gatewayId": "...", "secret": "<ONE-TIME SECRET>", "backendUrl": "wss://..." }
```

**b) Run the agent** (see [`gateway-agent/`](./gateway-agent) for the full
program + Dockerfile):
```bash
cd gateway-agent
cp .env.example .env   # fill GATEWAY_ID, GATEWAY_SECRET, BACKEND_WS_URL, SIGNING_PEPPER
npm install && npm run build && npm start
# or with Docker:
docker run -d --restart unless-stopped --env-file .env mango-gateway-agent
```

Once the agent shows **Agent online** in the gateway UI, open the **Terminal**
tab to get a multi-tab, resizable shell with file transfer.

## Client Project

The gateway agent that runs on each Raspberry Pi is a **separate project**:

👉 **[mango-iot-gateway-client](https://github.com/mango-iot/gateway-client)**

```bash
# On each Raspberry Pi:
git clone https://github.com/mango-iot/gateway-client.git
cd mango-iot-gateway-client
sudo bash setup.sh \
  --server mqtt://YOUR_SERVER_IP:1883 \
  --mqtt-user iot \
  --mqtt-pass YOUR_MQTT_PASS \
  --token YOUR_PROVISION_TOKEN \
  --device-id factory-gw-01
```

The client handles MQTT telemetry, Modbus, GPIO and OTA. The **remote terminal**
is provided by the separate `gateway-agent/` program described above.

See the client README for features, configuration, and troubleshooting.

---

## API Overview

All endpoints prefixed with `/api/v1/`.

### Authentication
```
POST   /api/v1/auth/register              # Create account
POST   /api/v1/auth/login                 # Sign in
POST   /api/v1/auth/refresh               # Refresh token
GET    /api/v1/auth/profile               # Current user
POST   /api/v1/auth/change-password        # Update password
```

### Gateways
```
GET    /api/v1/gateways                   # List (paginated)
GET    /api/v1/gateways/:id               # Detail
PATCH  /api/v1/gateways/:id               # Update
DELETE  /api/v1/gateways/:id               # Delete
POST   /api/v1/gateways/:id/commands       # Execute command
GET    /api/v1/gateways/:id/commands       # Command history
GET    /api/v1/gateways/:id/firmware       # Firmware history
POST   /api/v1/gateways/:id/agent-secret   # Issue/rotate gateway agent secret (Admin)
GET    /api/v1/gateways/:id/agent-status   # Agent connection status
```

### Remote Terminal (reverse-connection)
```
GET    /api/v1/terminal/sessions           # List active sessions (recovery / multi-tab)
GET    /api/v1/terminal/sessions/:id        # Session details

# WebSocket namespaces (Socket.IO):
#   /terminal  browser  -> backend   (JWT auth; events: open/input/resize/end,
#                                    file:init/file:data/file:end; recv: connected/
#                                    output/ready/status/closed/error/file:*)
#   /agent     gateway  -> backend   (secret auth; HMAC-signed envelope; heartbeat)
#
# Every agent message carries { tenantId, gatewayId, sessionId, userId,
# timestamp, sequenceNumber } and an HMAC signature. The backend signs all
# messages it sends to agents; agents verify before acting.
```

### Firmware
```
GET    /api/v1/firmware                   # List releases
POST   /api/v1/firmware                   # Create release
GET    /api/v1/firmware/:id               # Detail
POST   /api/v1/firmware/:id/deploy         # Deploy to gateways
```

### Provisioning
```
POST   /api/v1/provisioning/tokens         # Create token
GET    /api/v1/provisioning/tokens         # List tokens
DELETE /api/v1/provisioning/tokens/:id     # Revoke
POST   /api/v1/provisioning/gateway        # Gateway registration
```

### Monitoring
```
GET    /api/v1/health                     # Service health
```

---

## MQTT Topic Map

| Direction | Topic | Payload |
|-----------|-------|---------|
| Agent → Cloud | `gateway/{device_id}/telemetry` | CPU, RAM, disk, temp, Modbus data |
| Agent → Cloud | `gateway/{device_id}/status` | Online/offline status |
| Agent → Cloud | `gateway/{device_id}/log` | Log entries |
| Agent → Cloud | `gateway/{device_id}/command/response` | Command results |
| Cloud → Agent | `gateway/{device_id}/command/set` | Commands (reboot, shell, etc.) |

---

## Project Structure

```
mango-iot-gateway-platform/
├── backend/
│   ├── src/
│   │   ├── auth/            # JWT authentication
│   │   ├── gateways/        # Gateway CRUD & commands
│   │   ├── firmware/        # OTA firmware management
│   │   ├── mqtt/            # External MQTT broker client & handlers
│   │   ├── storage/         # Cloudflare R2 (S3-compatible) storage service
│   │   ├── terminal/        # Reverse-connection terminal: /terminal (browser) + /agent (agent) relay, HMAC-signed protocol, session audit
│   │   ├── websocket/       # Real-time event push
│   │   ├── provisioning/    # Token-based onboarding
│   │   ├── monitoring/      # Health & metrics
│   │   ├── config/          # Configuration + env validation (fail-fast)
│   │   └── common/          # Guards, decorators, DTOs
│   ├── prisma/              # Schema & migrations
│   ├── .env.example         # Backend environment template
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── (app)/gateways/  # Gateway list & detail (6 tabs)
│   │   ├── (app)/provisioning/ # Token management
│   │   └── auth/            # Login & registration
│   ├── wrangler.toml        # Cloudflare Pages config
│   ├── .env.example         # Frontend environment template
│   └── Dockerfile
├── cloudflare/
│   └── worker/              # Edge API gateway (JWT, rate limit, CORS, proxy)
│       ├── src/index.ts
│       └── wrangler.toml
├── docker-compose.server.yml  # Production stack (no bundled broker)
├── docker-compose.yml         # Dev stack (no bundled broker)
├── docker-compose.pi.yml      # Pi-optimized server stack
├── .env.example               # Root (Docker Compose) environment template
├── dev_start.sh               # Development launcher
└── terraform/ k8s/ grafana/ prometheus/  # Optional infra
```

---

## Remote Terminal — Architecture & Security

This section details the enterprise-grade, reverse-connection remote access
system (AWS SSM Session Manager / Azure Arc style). See
[`gateway-agent/`](./gateway-agent) for the reference agent.

### Connection model
```
Browser ──HTTPS/WS──▶ Backend (/terminal, JWT) ──▶ Relay (Redis pub/sub)
                                                        │
                                   Outbound TLS WS ◀───┘ (agent dials backend)
                                                        │
                                                   Gateway Agent (/agent)
                                                        │ spawns PTY, transfers files
```

- **The backend never opens a connection to a gateway and never runs SSH.**
  The Gateway Agent owns the PTY, file transfer and keep-alive. This works
  behind NAT/CGNAT/firewalls/cellular with no inbound ports.
- The Agent authenticates with **Gateway ID + Gateway Secret** (backend stores
  only a SHA-256 hash). The browser authenticates with **JWT**.
- A signed, replay-protected envelope carries `tenantId, gatewayId, sessionId,
  userId, timestamp, sequenceNumber` on every message. Backend→agent messages
  are HMAC-signed with a per-gateway key derived from
  `HMAC(TERMINAL_SIGNING_PEPPER, SHA256(secret))`; the agent verifies before
  acting. Sequence numbers are monotonic per direction (replay protection), and
  all transport runs over TLS.

### RBAC & multi-tenancy
- **Super Admin / Company Admin / Operator** may open terminals; **Viewer** may not.
- Access also requires `GatewayAccess` level `CONTROL`/`ADMIN` (or ownership).
- All sessions are tenant-scoped; cross-tenant access is rejected.

### Keep-alive & scalability
- 30s heartbeat (`HEARTBEAT`/`HEARTBEAT_ACK`); agents reconnect with
  exponential backoff; the backend evicts agents that miss ~90s of heartbeats.
- Stateless relay via **Redis pub/sub** fans browser↔agent traffic across
  backend instances, so the system scales to 100k+ gateways. Without Redis it
  runs in single-instance mode.

### Session management & audit
- Every session is a `TerminalSession` row (user, gateway, duration, bytes in/
  out, command count, client IP/UA, status). Idle sessions auto-expire.
- Multiple concurrent terminal tabs and multiple users are supported. Resuming
  the same `sessionId` re-attaches to the agent's existing PTY.
- All terminal activity is auditable from PostgreSQL.

### Troubleshooting
| Symptom | Cause / Fix |
|---------|-------------|
| "Gateway agent is offline" | Agent not running or can't reach `BACKEND_WS_URL`. Check agent logs and TLS. |
| "Invalid gateway credentials" | `GATEWAY_SECRET` mismatch or not issued. Re-issue via `/agent-secret`. |
| "Message signature invalid" | `SIGNING_PEPPER` on agent ≠ backend. Must be identical. |
| No output / frozen | PTY spawned with wrong shell, or firewall dropping idle WS. Verify `SHELL`, heartbeat. |
| Terminal tab shows "Agent ?" | Backend unreachable for `/agent-status` (RBAC or network). |

---

## Security

- **MQTT Authentication** — All gateway connections require username/password
- **JWT Tokens** — API access with 15-min access tokens + 7-day refresh
- **AES-256 Encryption** — Sensitive fields encrypted at rest
- **Helmet Headers** — HTTP security headers enabled
- **CORS** — Restricted to configured origins
- **Rate Limiting** — Built-in throttle protection
- **Password File** — Mosquitto credentials stored in Docker volume, not hardcoded

---

## Local Development

Prerequisites: Node.js 20+, PostgreSQL 16, Redis 7, and access to an external MQTT broker.

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, MQTT_HOST, ...
npm install
npx prisma generate
npx prisma migrate deploy      # or: npm run prisma:migrate (dev)
npm run start:dev              # http://localhost:3001 (Swagger at /api/docs)

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
npm install
npm run dev                    # http://localhost:3000
```

The backend **validates required environment variables on startup and fails fast**
if any are missing (`DATABASE_URL`, `JWT_SECRET` ≥ 32 chars, `MQTT_HOST`, and R2
credentials when `R2_BUCKET` is set).

---

## Docker Setup

Postgres, Redis, backend and frontend run via Docker Compose. **No MQTT broker or
object storage is deployed** — the platform uses your external MQTT broker and
Cloudflare R2.

```bash
cp .env.example .env           # fill in secrets + MQTT_HOST + R2_* values
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

| Service | Port | Notes |
|---------|------|-------|
| Frontend | 3000 | Next.js UI |
| Backend | 3001 | REST + WebSocket + SSH terminal |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache/queues |

Optional monitoring (Prometheus, Grafana, Loki, NATS) is also defined in
`docker-compose.yml`.

---

## Environment Variables

All configuration comes from environment variables — **no secrets are hardcoded**.
Copy the example files and fill them in:

- `backend/.env.example` — full backend configuration
- `frontend/.env.example` — frontend public variables
- `.env.example` (root) — Docker Compose variables
- `cloudflare/worker/.dev.vars.example` — Worker local dev variables

Key variables:

| Group | Variables |
|-------|-----------|
| Application | `NODE_ENV`, `PORT`, `API_URL`, `LOG_LEVEL` |
| Database | `DATABASE_URL` *(required)* |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| JWT | `JWT_SECRET` *(required, ≥32 chars)*, `JWT_EXPIRES`, `JWT_REFRESH_EXPIRES` |
| MQTT | `MQTT_HOST` *(required)*, `MQTT_PORT`, `MQTT_PROTOCOL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID`, `MQTT_TLS_ENABLED`, `MQTT_CA_FILE`, `MQTT_CERT_FILE`, `MQTT_KEY_FILE` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |
| R2 | `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` |
| Workers/Pages | `WORKER_URL`, `PAGES_URL` |
| Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| OTA | `OTA_SIGNED_URL_EXPIRY` |
| Security | `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `COOKIE_SECURE`, `ENCRYPTION_KEY` |

---

## External MQTT Broker Configuration

**You bring your own MQTT broker.** Mosquitto/EMQX/HiveMQ are never installed or
deployed by this project. The backend connects to the broker using environment
variables and supports `mqtt`, `mqtts` and WebSocket (`ws`/`wss`).

```env
MQTT_HOST=broker.example.com
MQTT_PORT=8883
MQTT_PROTOCOL=mqtts          # mqtt | mqtts | ws | wss
MQTT_USERNAME=iot
MQTT_PASSWORD=your-password
MQTT_CLIENT_ID=iot-platform-backend
MQTT_TLS_ENABLED=true
MQTT_CA_FILE=/certs/ca.pem     # optional
MQTT_CERT_FILE=/certs/client.pem   # optional (mutual TLS)
MQTT_KEY_FILE=/certs/client.key    # optional (mutual TLS)
```

When TLS is enabled (or protocol is `mqtts`/`wss`), the referenced CA/cert/key
files are loaded at connect time. Set `MQTT_TLS_REJECT_UNAUTHORIZED=false` only for
self-signed certs in non-production environments.

---

## Cloudflare R2 Configuration

Firmware and files are stored in Cloudflare R2 (S3-compatible). Firmware is
**never stored on local disk**; downloads are served via short-lived pre-signed
URLs and can be fronted by the Cloudflare CDN.

1. Create an R2 bucket in the Cloudflare dashboard (e.g. `iot-firmware`).
2. Create an R2 API token (Access Key ID + Secret Access Key).
3. Configure the backend:

```env
R2_BUCKET=iot-firmware
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://firmware.your-domain.com   # optional (public bucket / CDN)
OTA_SIGNED_URL_EXPIRY=3600                        # signed URL lifetime (seconds)
```

Firmware upload → `POST /api/v1/firmware/:id/upload` (stored in R2).
Signed download → `GET /api/v1/firmware/:id/download` (302 redirect to R2) or
`GET /api/v1/firmware/:id/download-url` (returns the signed URL).

---

## Cloudflare Workers Deployment (Edge API Gateway)

The Worker in `cloudflare/worker/` sits in front of the NestJS backend and only
handles edge concerns: JWT validation, rate limiting, security headers, CORS,
request logging, and proxying. **The backend is never migrated into Workers.**

```bash
cd cloudflare/worker
npm install
cp .dev.vars.example .dev.vars       # local dev vars
npm run dev                          # local: wrangler dev

# Configure production values in wrangler.toml ([vars]) then:
npx wrangler secret put JWT_SECRET   # must match backend JWT_SECRET
npm run deploy
```

Optional: create a KV namespace for distributed edge rate limiting and bind it as
`RATE_LIMIT_KV` in `wrangler.toml`.

---

## Cloudflare Pages Deployment (Frontend)

The Next.js frontend deploys to Cloudflare Pages via `@cloudflare/next-on-pages`.

```bash
cd frontend
npm install
npm run pages:build                  # DEPLOY_TARGET=cloudflare next-on-pages
npm run pages:deploy                 # wrangler pages deploy .vercel/output/static
```

Set the Pages project environment variables (`NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_WS_URL`) to point at the Cloudflare Worker API gateway. The standalone
Docker build is unaffected (it only uses `output: 'standalone'` when
`DEPLOY_TARGET` is not `cloudflare`).

---

## Production Deployment

Recommended topology:

```
Browser ──► Cloudflare Pages (frontend, CDN)
        └─► Cloudflare Worker (edge API gateway: JWT, rate limit, WAF, headers)
              └─► NestJS backend (Docker/VM) ──► PostgreSQL, Redis
                                            └─► External MQTT broker (yours)
                                            └─► Cloudflare R2 (firmware)
```

1. Deploy PostgreSQL + Redis (managed or Docker) and the NestJS backend.
2. Point the Worker's `BACKEND_URL` at the backend origin; deploy the Worker.
3. Deploy the frontend to Pages, pointing `NEXT_PUBLIC_API_URL` at the Worker.
4. Configure R2 + external MQTT broker via env vars.
5. Enable Cloudflare WAF, Cache rules and Analytics on the zone.
6. Run migrations: `npx prisma migrate deploy`.

---

## Security Best Practices

- **No hardcoded secrets** — everything comes from `.env`; startup fails fast if
  required variables are missing.
- **JWT** — short-lived access tokens + refresh tokens; validated both at the edge
  (Worker) and in the backend.
- **Helmet / secure headers** — CSP, HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Rate limiting** — backend (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`) and edge
  (Worker KV).
- **CORS** — restricted to `CORS_ORIGINS`.
- **Secure cookies** — `httpOnly`, `secure` (`COOKIE_SECURE`), `sameSite`.
- **Request validation** — global `ValidationPipe` with whitelist + transform.
- **AES-256 encryption** for sensitive fields at rest (`ENCRYPTION_KEY`).
- **TLS everywhere** — MQTT over `mqtts`/`wss`, HTTPS via Cloudflare.
- **WAF & Turnstile** — enable Cloudflare WAF on the zone; Turnstile keys supported
  for bot protection on auth flows.
- **Least privilege** — scope Cloudflare API tokens and R2 keys to only what's
  needed.

---

## License

MIT — see [LICENSE](LICENSE)
