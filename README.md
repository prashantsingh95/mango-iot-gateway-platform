# Mango IoT Gateway Platform

**Developed by Prashant Kumar** — Director & Founder, Tech Burst Solutions LLP

**Business Contact:**
- Email: business@techburstsolutions.in, iot.techburst@gmail.com
- Phone/WhatsApp: +91 9310720730
- Web: www.techburstsolutions.in
- Office: New Delhi - 41, India

Enterprise IoT gateway management platform. Cloud server for managing fleets of Raspberry Pi gateways via authenticated MQTT with real-time WebSocket, OTA firmware, remote shell (SSH), and Modbus/GPIO data pipelines.

Sister project: **[mango-iot-gateway-client](https://github.com/mango-iot/gateway-client)** — the Go gateway agent that runs on each Pi and connects to this platform.

---

## Features

### Gateway Management
- **Device Inventory** — Paginated list, detail views, status tracking
- **Zero-Touch Provisioning** — Token-based registration, auto-onboarding
- **Remote Commands** — Reboot, agent restart, shell execution, relay control, register reads
- **OTA Firmware** — Deploy firmware images to selected gateways with history tracking
- **Real-Time Telemetry** — CPU, RAM, disk, temperature, network via MQTT → WebSocket push

### Secure Remote Console
- Browser-based terminal via SSH over WebSocket (xterm.js + ssh2)
- JWT-authenticated WebSocket connections
- Auto-fit, dark theme, reconnect

### Multi-Protocol Support
| Protocol | Role |
|----------|------|
| MQTT (Mosquitto) | Primary agent ↔ cloud messaging |
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
│              REST (3001) + Socket.IO + SSH Terminal                 │
│              Prisma ORM → PostgreSQL                                │
└────────┬────────────┬──────────────────────┬────────────────────────┘
         │            │                      │
         ▼            ▼                      ▼
┌────────────┐ ┌────────────┐ ┌──────────────────────────┐
│ PostgreSQL │ │   Redis    │ │   Mosquitto MQTT Broker   │
│ (database) │ │  (cache)   │ │  (1883 MQTT + 9001 WS)   │
└────────────┘ └────────────┘ └──────────┬───────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │ mqtt://gateway/+/  │                    │
                    ▼                    ▼                    ▼
          ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
          │  Pi Gateway #1  │  │  Pi Gateway #2  │  │  Pi Gateway #N  │
          │ Go Agent (client)│  │ Go Agent (client)│  │ Go Agent (client)│
          │ Modbus + GPIO   │  │ Modbus + GPIO   │  │ Modbus + GPIO   │
          └─────────────────┘  └─────────────────┘  └─────────────────┘
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
| **Mosquitto 2** | MQTT broker (authenticated) |
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

### 4. Enable Terminal Access (SSH)
In platform UI: **Settings** → add:
- `sshUsername`: your Pi username (e.g., `pi` or `prashant`)
- `sshPassword`: your Pi SSH password
- `sshPort`: 22

Now you can open **Terminal** tab in gateway detail view!

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
DELETE /api/v1/gateways/:id               # Delete
POST   /api/v1/gateways/:id/commands       # Execute command
GET    /api/v1/gateways/:id/commands       # Command history
GET    /api/v1/gateways/:id/firmware       # Firmware history
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
│   │   ├── mqtt/            # MQTT client & message handlers
│   │   ├── terminal/        # SSH over WebSocket gateway
│   │   ├── websocket/       # Real-time event push
│   │   ├── provisioning/    # Token-based onboarding
│   │   ├── monitoring/      # Health & metrics
│   │   └── common/          # Guards, decorators, DTOs
│   ├── prisma/              # Schema & migrations
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── (app)/gateways/  # Gateway list & detail (6 tabs)
│   │   ├── (app)/provisioning/ # Token management
│   │   └── auth/            # Login & registration
│   └── Dockerfile
├── docker-compose.server.yml  # Production stack
├── docker-compose.yml         # Dev stack
├── setup-server.sh            # One-command server installer
├── setup.sh                   # All-in-one (server + optional agent)
├── mosquitto.conf             # MQTT broker config template
├── docker-compose.pi.yml      # Pi-optimized server stack
├── dev_start.sh               # Development launcher
└── terraform/ k8s/ grafana/ prometheus/  # Optional infra
```

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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | auto | PostgreSQL password |
| `JWT_SECRET` | auto | JWT signing key (min 32 chars) |
| `ENCRYPTION_KEY` | auto | AES encryption key (32 hex) |
| `MQTT_USER` | iot | MQTP username |
| `MQTT_PASSWORD` | auto | MQTT password |
| `HOST_IP` | auto-detect | Server IP for browser access |
| `CORS_ORIGINS` | http://localhost:3000 | Allowed origins |

---

## License

MIT — see [LICENSE](LICENSE)
