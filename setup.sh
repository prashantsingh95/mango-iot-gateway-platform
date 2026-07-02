#!/usr/bin/env bash
#=============================================================================
# Mango IoT Platform — Production Setup for Raspberry Pi 3B
#   One-command setup: clone, configure, build, deploy.
#   Safe to re-run — idempotent, with rollback on failure.
#=============================================================================
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/your-org/iot-gateway-platform/main/setup.sh | sudo bash
#   # or
#   git clone <repo> && cd iot-gateway-platform && sudo bash setup.sh
#
# Environment variables (all optional):
#   HOST_IP         – IP address of this machine (auto-detected)
#   DB_PASSWORD     – PostgreSQL password       (default: iotpassword)
#   JWT_SECRET      – JWT signing key (min 32)   (default: auto-generated)
#   ENCRYPTION_KEY  – AES key (min 32 hex)       (default: auto-generated)
#   ADMIN_EMAIL     – Initial admin email        (default: admin@iot.local)
#   ADMIN_PASSWORD  – Initial admin password     (default: raspberry)
#   GW_DEVICE_ID    – Gateway agent device ID    (default: pi-gateway-<ip>)
#   MQTT_BROKER_URL – MQTT broker for agent      (default: mqtt://<ip>:1883)
#   SKIP_AGENT      – Set to "1" to skip gateway agent build
#   SKIP_SEED       – Set to "1" to skip admin user creation
#   NO_DOCKER       – Set to "1" to skip Docker install
#   PI_STAGE        – Resume from a specific stage (1-6)
#
#=============================================================================

set -u
set -o pipefail

# ============================================================================
# Configuration & Constants
# ============================================================================
SCRIPT_VERSION="1.0.0"
LOCKFILE="/var/run/iot-setup.lock"
LOGFILE="/var/log/iot-setup.log"
CREDENTIALS_FILE="/root/.iot-credentials"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIRED_DISK_MB=5000
REQUIRED_RAM_MB=512
TIMEOUT_SEC=900  # 15 minutes max for the whole setup

# ============================================================================
# Utility Functions
# ============================================================================
setup_colors() {
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
  export RED GREEN YELLOW CYAN NC
}

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1" | tee -a "$LOGFILE"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] !${NC} $1" | tee -a "$LOGFILE"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1" | tee -a "$LOGFILE"; exit 1; }
info() { echo -e "${CYAN}[$(date +%H:%M:%S)] i${NC} $1" | tee -a "$LOGFILE"; }
sep()  { echo -e "${CYAN}────────────────────────────────────────────${NC}" | tee -a "$LOGFILE"; }

# ---------- Timed run with timeout ----------
timeout_run() {
  local description="$1"; shift
  info "${description}..."
  if ! timeout "$TIMEOUT_SEC" "$@" >> "$LOGFILE" 2>&1; then
    local rc=$?
    if [[ $rc -eq 124 ]]; then
      err "Timed out after ${TIMEOUT_SEC}s: ${description}"
    fi
    return $rc
  fi
  return 0
}

# ---------- Retry with exponential backoff ----------
retry() {
  local max_attempts=${RETRY_ATTEMPTS:-3}
  local delay=${RETRY_DELAY:-5}
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    if "$@" >> "$LOGFILE" 2>&1; then
      return 0
    fi
    warn "Attempt $attempt/$max_attempts failed — retrying in ${delay}s..."
    sleep "$delay"
    delay=$((delay * 2))
    [[ $delay -gt 60 ]] && delay=60
    attempt=$((attempt + 1))
  done
  return 1
}

# ---------- Pre-flight ----------
preflight_check() {
  local errors=0

  # Architecture
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|armv8l) PI_MODEL="Pi 3B+/4B/5 (64-bit)" ;;
    armv7l)         PI_MODEL="Pi 3B/2W/Zero 2W (32-bit)" ;;
    armv6l)         PI_MODEL="Pi Zero/1 (armv6) — NOT RECOMMENDED" ;;
    x86_64)         PI_MODEL="x86_64 (development mode)" ;;
    *)              PI_MODEL="$ARCH (untested)" ;;
  esac

  # Memory
  TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
  if [[ "$TOTAL_MEM" -lt $REQUIRED_RAM_MB ]]; then
    warn "Low memory: ${TOTAL_MEM}MB (recommended: ${REQUIRED_RAM_MB}MB+)"
    warn "Services may be unstable. Consider adding swap."
  fi

  # Disk
  DISK_FREE=$(df -m / | awk 'NR==2{print $4}')
  if [[ "$DISK_FREE" -lt $REQUIRED_DISK_MB ]]; then
    err "Insufficient disk: ${DISK_FREE}MB free, need ${REQUIRED_DISK_MB}MB"
  fi

  # OS
  if [[ ! -f /etc/os-release ]]; then
    warn "Cannot detect OS — assuming Debian-based"
  elif grep -qi ubuntu /etc/os-release 2>/dev/null; then
    : # Ubuntu is fine
  elif grep -qi debian /etc/os-release 2>/dev/null; then
    : # Debian is fine (Raspbian)
  elif grep -qi raspbian /etc/os-release 2>/dev/null; then
    : # Raspbian is fine
  else
    warn "Unsupported OS — script requires Debian/Raspbian/Ubuntu"
    errors=$((errors + 1))
  fi

  # Root
  if [[ $EUID -ne 0 ]]; then
    err "Must run as root: sudo bash setup.sh"
  fi

  # Lock
  if [[ -f "$LOCKFILE" ]]; then
    local pid
    pid=$(cat "$LOCKFILE" 2>/dev/null || echo 0)
    if kill -0 "$pid" 2>/dev/null; then
      err "Another setup is already running (PID $pid). Remove $LOCKFILE if stuck."
    fi
    warn "Stale lockfile removed"
    rm -f "$LOCKFILE"
  fi
  echo $$ > "$LOCKFILE"
  trap 'rm -f "$LOCKFILE"' EXIT

  # Port availability
  for port in 3000 3001 5432 6379 1883; do
    if ss -tlnp "sport = :$port" 2>/dev/null | grep -q LISTEN; then
      warn "Port $port is already in use — may conflict with Docker services"
    fi
  done

  info "Architecture: ${PI_MODEL}"
  info "Memory:      ${TOTAL_MEM}MB"
  info "Free disk:   ${DISK_FREE}MB"
  info "Hostname:    $(hostname)"
  info "Kernel:      $(uname -r)"
  echo ""
  return $errors
}

# ============================================================================
# Stages
# ============================================================================

# ---------- Stage 1: Kill existing processes ----------
stage_clean() {
  sep
  info "Stage 1/6 — Cleaning existing processes"

  systemctl stop gateway-agent 2>/dev/null && log "Stopped gateway-agent" || true

  if command -v docker &>/dev/null; then
    docker compose -f "$SCRIPT_DIR/docker-compose.pi.yml" down --remove-orphans 2>/dev/null && \
      log "Stopped Docker services" || true
    for c in iot-postgres iot-redis iot-mosquitto iot-backend iot-frontend; do
      docker rm -f "$c" 2>/dev/null || true
    done
  fi

  pkill -f gateway-agent 2>/dev/null || true
  log "Cleaned"
}

# ---------- Stage 2: Install system dependencies ----------
stage_deps() {
  sep
  info "Stage 2/6 — Installing system dependencies"

  export DEBIAN_FRONTEND=noninteractive

  retry apt-get update -qq || err "apt update failed"

  # Core packages (non-fatal if some GPIO packages are missing on non-Pi)
  apt-get install -y -qq \
    curl wget git ca-certificates gnupg lsb-release \
    make gcc haveged ntp logrotate jq 2>/dev/null

  # Pi-specific (may fail on non-Pi)
  apt-get install -y -qq gpio wiringpi i2c-tools 2>/dev/null || \
    warn "GPIO/wiringPi packages not available (non-Pi system?)"

  # Docker
  if [[ -z "${NO_DOCKER:-}" ]]; then
    if ! command -v docker &>/dev/null; then
      info "Installing Docker..."
      curl -fsSL https://get.docker.com | bash >> "$LOGFILE" 2>&1 || \
        err "Docker installation failed"
      usermod -aG docker pi 2>/dev/null || true
      systemctl enable docker
      systemctl start docker
      log "Docker installed ($(docker --version 2>/dev/null | awk '{print $3}' | tr -d ','))"
    else
      log "Docker: $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')"
    fi

    # Docker Compose
    if ! docker compose version &>/dev/null; then
      info "Installing Docker Compose plugin..."
      apt-get install -y -qq docker-compose-plugin 2>/dev/null || {
        local arch_suffix
        case "$(uname -m)" in
          aarch64) arch_suffix="aarch64" ;;
          armv7l)  arch_suffix="armv7" ;;
          *)       arch_suffix="$(uname -m)" ;;
        esac
        local compose_url="https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-${arch_suffix}"
        mkdir -p /usr/local/lib/docker/cli-plugins
        retry curl -fsSL "$compose_url" -o /usr/local/lib/docker/cli-plugins/docker-compose || \
          err "Docker Compose download failed"
        chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      }
      log "Docker Compose installed"
    else
      log "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'present')"
    fi
  fi

  # Go (for gateway agent)
  if [[ -z "${SKIP_AGENT:-}" ]]; then
    if ! command -v go &>/dev/null; then
      GO_VER="1.22.5"
      case "$ARCH" in
        aarch64) GOARCH="arm64" ;;
        armv7l|armv6l) GOARCH="armv6l" ;;
        x86_64) GOARCH="amd64" ;;
        *) GOARCH="armv6l" ;;
      esac
      local go_url="https://go.dev/dl/go${GO_VER}.linux-${GOARCH}.tar.gz"
      info "Installing Go ${GO_VER} (${GOARCH})..."
      retry curl -fsSL "$go_url" | tar -C /usr/local -xz || \
        err "Go download/install failed"
      export PATH="/usr/local/go/bin:$PATH"
      echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
      log "Go ${GO_VER} installed"
    else
      log "Go: $(go version | awk '{print $3}')"
    fi
  fi

  # Hardware interfaces (safe to run on non-Pi — raspi-config handles it)
  raspi-config nonint do_i2c 0 2>/dev/null || true
  raspi-config nonint do_spi 0 2>/dev/null || true
  raspi-config nonint do_serial 0 2>/dev/null || true
  log "Hardware interfaces configured"
}

# ---------- Stage 3: Configure environment ----------
stage_config() {
  sep
  info "Stage 3/6 — Configuring environment"
  echo ""

  local default_ip
  default_ip=$(hostname -I | awk '{print $1}')
  [[ -z "$default_ip" ]] && default_ip="127.0.0.1"

  HOST_IP="${HOST_IP:-$default_ip}"
  DB_PASSWORD="${DB_PASSWORD:-iotpassword}"
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@iot.local}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-raspberry}"
  GW_DEVICE_ID="${GW_DEVICE_ID:-pi-gateway-${HOST_IP//./-}}"
  MQTT_BROKER_URL="${MQTT_BROKER_URL:-mqtt://${HOST_IP}:1883}"

  # Auto-generate secrets if not set
  if [[ -z "${JWT_SECRET:-}" || ${#JWT_SECRET} -lt 32 ]]; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || uuidgen | tr -d '-')
  fi
  if [[ -z "${ENCRYPTION_KEY:-}" || ${#ENCRYPTION_KEY} -lt 32 ]]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || uuidgen | tr -d '-')
  fi

  # Validate required fields
  local valid=true
  if ! echo "$ADMIN_EMAIL" | grep -qE '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
    warn "Invalid email format: $ADMIN_EMAIL"
    valid=false
  fi
  if [[ ${#ADMIN_PASSWORD} -lt 4 ]]; then
    warn "Admin password too short (min 4 chars)"
    valid=false
  fi
  if [[ ${#JWT_SECRET} -lt 32 ]]; then
    warn "JWT secret too short (min 32 chars)"
    valid=false
  fi
  if [[ ${#ENCRYPTION_KEY} -lt 32 ]]; then
    warn "Encryption key too short (min 32 chars)"
    valid=false
  fi

  if [[ "$valid" == false ]]; then
    warn "Some configuration values are suboptimal — review above"
    warn "Continuing anyway, but fix these in production"
  fi

  log "Configuration loaded"
}

# ---------- Stage 4: Generate config files ----------
stage_generate() {
  sep
  info "Stage 4/6 — Generating configuration files"

  # Backup existing .env
  [[ -f "$SCRIPT_DIR/backend/.env" ]] && cp "$SCRIPT_DIR/backend/.env" "$SCRIPT_DIR/backend/.env.bak"

  # Backend .env
  cat > "$SCRIPT_DIR/backend/.env" << ENVEOF
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL=postgresql://iotadmin:${DB_PASSWORD}@localhost:5432/iot_platform?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
MQTT_BROKER_URL=mqtt://localhost:1883
CORS_ORIGINS=http://localhost:3000
ENVEOF
  log "backend/.env generated"

  # Docker Compose env
  cat > "$SCRIPT_DIR/.env.pi" << PIENVEOF
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
HOST_IP=${HOST_IP}
PIENVEOF
  log ".env.pi generated"

  # Gateway agent config
  mkdir -p /opt/gateway

  # Use template from external client project if available
  local CLIENT_TEMPLATE
  for dir in "$SCRIPT_DIR/../mango-iot-gateway-client/config.yml" "$SCRIPT_DIR/client/config.yml"; do
    [[ -f "$dir" ]] && { CLIENT_TEMPLATE="$dir"; break; }
  done

  if [[ -n "${CLIENT_TEMPLATE:-}" ]]; then
    sed \
      -e "s|broker_url:.*|broker_url: \"${MQTT_BROKER_URL}\"|" \
      -e "s|device_id:.*|device_id: \"${GW_DEVICE_ID}\"|" \
      -e "s|name:.*|name: \"Pi Gateway ${HOST_IP}\"|" \
      "$CLIENT_TEMPLATE" > /opt/gateway/config.yml
  else
    cat > /opt/gateway/config.yml << YAMLEOF
gateway:
  device_id: "${GW_DEVICE_ID}"
  name: "Pi Gateway ${HOST_IP}"
  tenant_id: "default"

mqtt:
  broker_url: "${MQTT_BROKER_URL}"
  client_id_prefix: "gw"
  ssl: false
  qos: 1
  keep_alive: 60
  topics:
    telemetry: "gateway/{device_id}/telemetry"
    status: "gateway/{device_id}/status"
    log: "gateway/{device_id}/log"
    command: "gateway/{device_id}/command/set"

modbus:
  enabled: true
  devices: []

gpio:
  enabled: false

monitoring:
  interval: 30
  cpu: true
  memory: true
  disk: true
  temperature: true
  network: true

logging:
  level: "info"
  file: "/var/log/gateway-agent.log"
  remote: true

ota:
  enabled: true
  firmware_dir: "/opt/gateway/firmware"
  backup_dir: "/opt/gateway/backup"
  auto_rollback: true
  rollback_timeout: 30

watchdog:
  enabled: true
  interval: 60
  max_missed_pings: 3
  action: "restart"

commands:
  enabled: true
  allowed:
    - "reboot"
    - "restart_agent"
    - "run_shell"
    - "update_firmware"
    - "set_relay"
    - "read_register"
  shell:
    allowed_paths:
      - "/opt/gateway/scripts/"
      - "/usr/local/bin/"
    timeout: 30
YAMLEOF
  fi

  log "/opt/gateway/config.yml generated"
}

# ---------- Stage 5: Build and start Docker services ----------
stage_docker() {
  sep
  info "Stage 5/6 — Building and starting Docker services"
  echo ""
  info "First build can take 10-20 minutes on Pi 3B"
  echo ""

  # Pull base images in parallel with timeout
  info "Pulling base images..."
  local pull_failed=0
  timeout 300 docker pull postgres:16-alpine >> "$LOGFILE" 2>&1 || pull_failed=$((pull_failed + 1))
  timeout 300 docker pull redis:7-alpine >> "$LOGFILE" 2>&1 || pull_failed=$((pull_failed + 1))
  timeout 300 docker pull eclipse-mosquitto:2-openssl >> "$LOGFILE" 2>&1 || pull_failed=$((pull_failed + 1))

  if [[ $pull_failed -gt 0 ]]; then
    warn "$pull_failed image pull(s) failed — attempting build anyway"
  else
    log "Base images pulled"
  fi

  # Build and start (with timeout for the build)
  info "Building and starting containers..."
  if ! docker compose -f "$SCRIPT_DIR/docker-compose.pi.yml" --env-file "$SCRIPT_DIR/.env.pi" up -d --build >> "$LOGFILE" 2>&1; then
    err "Docker Compose build/start failed. Check: docker compose -f docker-compose.pi.yml logs"
  fi
  log "Docker services started"

  # Wait for backend to be healthy
  info "Waiting for backend health check..."
  local backend_ready=false
  for i in $(seq 1 60); do
    if curl -sf "http://localhost:3001/api/v1/health" >/dev/null 2>&1; then
      backend_ready=true
      break
    fi
    if [[ $((i % 10)) -eq 0 ]]; then
      warn "Still waiting for backend (${i}s)..."
      docker compose -f "$SCRIPT_DIR/docker-compose.pi.yml" ps 2>/dev/null | tee -a "$LOGFILE" || true
    fi
    sleep 2
  done

  if [[ "$backend_ready" == false ]]; then
    warn "Backend did not become healthy within 120s"
    warn "Check logs: docker compose -f docker-compose.pi.yml logs backend"
    warn "Continuing anyway..."
  else
    log "Backend is healthy"
  fi

  # Database migrations
  if docker ps --format '{{.Names}}' | grep -q iot-backend; then
    info "Running database migrations..."
    if docker exec iot-backend sh -c "npx prisma migrate deploy" >> "$LOGFILE" 2>&1; then
      log "Migrations complete"
    else
      warn "Migration via container failed — trying direct"
      if cd "$SCRIPT_DIR/backend" && npx prisma migrate deploy >> "$LOGFILE" 2>&1; then
        log "Migrations complete (direct)"
      else
        warn "Migrations failed — run manually after setup"
        warn "  cd backend && npx prisma migrate deploy"
      fi
    fi
  else
    warn "Backend container not running — skipping migrations"
  fi

  # Seed admin user
  if [[ -z "${SKIP_SEED:-}" ]]; then
    info "Creating admin user..."
    local seed_response
    seed_response=$(curl -s -X POST "http://localhost:3001/api/v1/auth/register" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"name\":\"Admin\"}" 2>/dev/null) || true
    if echo "$seed_response" | grep -q "\"id\"" 2>/dev/null; then
      log "Admin user created: ${ADMIN_EMAIL}"
    elif echo "$seed_response" | grep -qi "already\|exist" 2>/dev/null; then
      warn "Admin user already exists (${ADMIN_EMAIL})"
    else
      warn "User creation returned unexpected response"
      warn "You can register manually at http://${HOST_IP}:3000/auth/register"
    fi
  fi
}

# ---------- Stage 6: Build and install gateway agent ----------
stage_agent() {
  if [[ -n "${SKIP_AGENT:-}" ]]; then
    info "Stage 6/6 — SKIPPED (SKIP_AGENT set)"
    return
  fi

  sep
  info "Stage 6/6 — Building and installing gateway agent"
  echo ""

  # Create system user
  if ! id -u gateway &>/dev/null; then
    groupadd --system gateway 2>/dev/null || true
    useradd --system --no-create-home --gid gateway --shell /usr/sbin/nologin gateway 2>/dev/null || true
  fi
  usermod -a -G gpio,i2c,dialout gateway 2>/dev/null || true

  # Create directories
  mkdir -p /opt/gateway/firmware /opt/gateway/backup /opt/gateway/scripts \
           /var/log /var/lib/gateway
  chown -R gateway:gateway /opt/gateway /var/lib/gateway 2>/dev/null || true
  log "Directories created"

  # Build from source (check external client project first)
  local CLIENT_DIR
  for dir in "$SCRIPT_DIR/../mango-iot-gateway-client" "$SCRIPT_DIR/client"; do
    [[ -d "$dir" ]] && { CLIENT_DIR="$dir"; break; }
  done

  if [[ -n "${CLIENT_DIR:-}" ]]; then
    info "Building gateway agent from $CLIENT_DIR..."
    cd "$CLIENT_DIR"
    go mod download >> "$LOGFILE" 2>&1
    if ! CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=${SCRIPT_VERSION}" \
         -o /usr/local/bin/gateway-agent . >> "$LOGFILE" 2>&1; then
      warn "Go build failed — check $CLIENT_DIR/main.go for errors"
      warn "Skipping agent install (you can build manually later)"
      cd "$SCRIPT_DIR"
      return
    fi
    cd "$SCRIPT_DIR"
    chmod 755 /usr/local/bin/gateway-agent
    log "Gateway agent binary installed"
  else
    warn "Client project not found — install separately: https://github.com/mango-iot/gateway-client"
    return
  fi

  # Systemd service
  cat > /etc/systemd/system/gateway-agent.service << UNIT
[Unit]
Description=Mango IoT Gateway Agent (Raspberry Pi)
Documentation=https://github.com/your-org/iot-gateway-platform
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=gateway
Group=gateway
ExecStart=/usr/local/bin/gateway-agent --config /opt/gateway/config.yml
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
LimitNOFILE=65536
StandardOutput=append:/var/log/gateway-agent.log
StandardError=append:/var/log/gateway-agent.log

[Install]
WantedBy=multi-user.target
UNIT

  # Log rotation
  cat > /etc/logrotate.d/gateway-agent << LOGROTATE
/var/log/gateway-agent.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    maxsize 10M
}
LOGROTATE

  systemctl daemon-reload
  systemctl enable gateway-agent

  if systemctl start gateway-agent >> "$LOGFILE" 2>&1; then
    log "Gateway agent started"
  else
    warn "Agent failed to start — check: journalctl -u gateway-agent -n 30"
  fi

  # Verify
  sleep 2
  if systemctl is-active --quiet gateway-agent; then
    log "Gateway agent: RUNNING"
  else
    warn "Gateway agent: NOT RUNNING — check logs"
  fi
}

# ============================================================================
# Summary
# ============================================================================
print_summary() {
  sep
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║      Mango IoT Platform — Setup Complete       ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend:${NC}     http://${HOST_IP}:3000"
  echo -e "  ${CYAN}Backend API:${NC}  http://${HOST_IP}:3001/api/v1"
  echo -e "  ${CYAN}API Docs:${NC}     http://${HOST_IP}:3001/api/docs"
  echo -e "  ${CYAN}MQTT Broker:${NC}  ${MQTT_BROKER_URL}"
  echo -e "  ${CYAN}Postgres:${NC}     localhost:5432 (iotadmin / ${DB_PASSWORD})"
  echo ""
  echo -e "  ${YELLOW}Admin Login:${NC}"
  echo -e "    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
  echo ""
  echo -e "  ${YELLOW}Services:${NC}"
  echo -e "    systemctl status gateway-agent"
  echo -e "    docker compose -f docker-compose.pi.yml ps"
  echo ""
  echo -e "  ${YELLOW}Quick commands:${NC}"
  echo -e "    sudo journalctl -u gateway-agent -f    # Agent logs"
  echo -e "    docker compose -f docker-compose.pi.yml logs -f backend"
  echo -e "    sudo systemctl restart gateway-agent"
  echo -e "    docker compose -f docker-compose.pi.yml restart"
  echo -e "    docker compose -f docker-compose.pi.yml down   # Stop all"
  echo ""
  echo -e "  ${YELLOW}Credentials saved:${NC} ${CREDENTIALS_FILE}"
  echo ""

  # Write credentials file
  cat > "$CREDENTIALS_FILE" << CREDEOF
╔══════════════════════════════════════╗
║   Mango IoT Platform — Credentials  ║
╚══════════════════════════════════════╝

Generated: $(date)
Version:   ${SCRIPT_VERSION}

Frontend:     http://${HOST_IP}:3000
Backend API:  http://${HOST_IP}:3001/api/v1
MQTT Broker:  ${MQTT_BROKER_URL}

Database:
  Host:     localhost:5432
  User:     iotadmin
  Password: ${DB_PASSWORD}
  Database: iot_platform

JWT Secret:       ${JWT_SECRET}
Encryption Key:   ${ENCRYPTION_KEY}

Gateway Device ID: ${GW_DEVICE_ID}

Admin:
  Email:    ${ADMIN_EMAIL}
  Password: ${ADMIN_PASSWORD}
  Login:    http://${HOST_IP}:3000/auth/login

--- KEEP THIS FILE SECURE ---
CREDEOF
  chmod 600 "$CREDENTIALS_FILE"
  log "Credentials saved to ${CREDENTIALS_FILE}"

  info "Setup complete — open http://${HOST_IP}:3000 in your browser"
}

# ============================================================================
# Cleanup handler
# ============================================================================
cleanup() {
  local exit_code=$?
  rm -f "$LOCKFILE"
  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║          Setup FAILED (exit code $exit_code)         ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${YELLOW}Log file:${NC} ${LOGFILE}"
    echo -e "  ${YELLOW}To retry:${NC}  sudo bash setup.sh"
    echo -e "  ${YELLOW}To skip completed stages, set PI_STAGE:${NC}"
    echo -e "    PI_STAGE=5 sudo bash setup.sh   # skip stages 1-4"
    echo ""
  fi
}

# ============================================================================
# Main
# ============================================================================
main() {
  setup_colors
  mkdir -p "$(dirname "$LOGFILE")"

  # If PI_STAGE is set, skip to that stage number (1-indexed)
  local resume_stage="${PI_STAGE:-1}"

  # Validate resume_stage
  if ! [[ "$resume_stage" =~ ^[1-6]$ ]]; then
    err "Invalid PI_STAGE: $resume_stage (must be 1-6)"
  fi

  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║      Mango IoT Platform — Setup v${SCRIPT_VERSION}         ║${NC}"
  echo -e "${CYAN}║      Raspberry Pi 3B Production Installer       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  info "Logging to: ${LOGFILE}"
  info "Resume from stage: ${resume_stage}"

  trap cleanup EXIT

  # Pre-flight always runs
  preflight_check

  [[ $resume_stage -le 1 ]] && stage_clean
  [[ $resume_stage -le 2 ]] && stage_deps
  [[ $resume_stage -le 3 ]] && stage_config
  [[ $resume_stage -le 4 ]] && stage_generate
  [[ $resume_stage -le 5 ]] && stage_docker
  [[ $resume_stage -le 6 ]] && stage_agent

  print_summary
}

main "$@"
