#!/usr/bin/env bash
#=============================================================================
# Mango IoT Platform — Server Setup
#   Installs the IoT platform backend, frontend, database, and MQTT broker
#   on a Linux server. Gateway agents connect to this server.
#
# Usage:
#   sudo bash setup-server.sh
#
# Environment variables (all optional):
#   HOST_IP         – Public IP of this server       (auto-detected)
#   DB_PASSWORD     – PostgreSQL password            (default: auto-generated)
#   JWT_SECRET      – JWT signing key (min 32)        (default: auto-generated)
#   ENCRYPTION_KEY  – AES key (min 32 hex)            (default: auto-generated)
#   ADMIN_EMAIL     – Initial admin email             (default: admin@iot.local)
#   ADMIN_PASSWORD  – Initial admin password          (default: auto-generated)
#   MQTT_USER       – MQTT username                   (default: iot)
#   MQTT_PASSWORD   – MQTT password                   (default: auto-generated)
#   DOMAIN          – Optional domain for TLS setup   (default: none)
#   SKIP_SEED       – Set to "1" to skip admin creation
#   NO_DOCKER       – Set to "1" to skip Docker install
#   STAGE           – Resume from a specific stage (1-5)
#=============================================================================

set -u
set -o pipefail

SCRIPT_VERSION="1.0.0"
LOCKFILE="/var/run/iot-server-setup.lock"
LOGFILE="/var/log/iot-server-setup.log"
CREDENTIALS_FILE="/root/.iot-server-credentials"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================================================
# Utils
# ============================================================================
setup_colors() {
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
  export RED GREEN YELLOW CYAN NC
}

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1" | tee -a "$LOGFILE"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] !${NC} $1" | tee -a "$LOGFILE"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1" | tee -a "$LOGFILE"; exit 1; }
info() { echo -e "${CYAN}[$(date +%H:%M:%S)] i${NC} $1" | tee -a "$LOGFILE"; }
sep()  { echo -e "${CYAN}────────────────────────────────────────────────${NC}" | tee -a "$LOGFILE"; }

retry() {
  local max=${RETRY_ATTEMPTS:-3} delay=${RETRY_DELAY:-5} n=1
  while [[ $n -le $max ]]; do
    if "$@" >> "$LOGFILE" 2>&1; then return 0; fi
    warn "Attempt $n/$max failed — retry in ${delay}s"
    sleep $delay; delay=$((delay * 2)); [[ $delay -gt 60 ]] && delay=60
    n=$((n + 1))
  done
  return 1
}

# ============================================================================
# Pre-flight
# ============================================================================
preflight() {
  [[ $EUID -eq 0 ]] || err "Must run as root: sudo bash setup-server.sh"

  TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
  DISK_FREE=$(df -m / | awk 'NR==2{print $4}')
  ARCH=$(uname -m)

  info "Arch: $ARCH | RAM: ${TOTAL_MEM}MB | Disk: ${DISK_FREE}MB free"

  [[ $DISK_FREE -lt 5000 ]] && err "Need 5GB+ free disk"
  [[ $TOTAL_MEM -lt 512 ]] && warn "Low RAM (<512MB) — services may be slow"

  [[ -f "$LOCKFILE" ]] && kill -0 "$(cat "$LOCKFILE")" 2>/dev/null && \
    err "Setup already running (PID $(cat "$LOCKFILE"))"
  echo $$ > "$LOCKFILE"
  trap 'rm -f "$LOCKFILE"' EXIT

  for port in 3000 3001 5432 6379 1883 9001; do
    ss -tlnp "sport = :$port" 2>/dev/null | grep -q LISTEN && \
      warn "Port $port already in use — may conflict"
  done
}

# ============================================================================
# Stage 1 — Install Docker
# ============================================================================
stage_docker() {
  sep; info "Stage 1/5 — Docker + system dependencies"

  export DEBIAN_FRONTEND=noninteractive
  retry apt-get update -qq || err "apt update failed"
  apt-get install -y -qq curl wget git ca-certificates gnupg lsb-release haveged ntp logrotate jq

  if [[ -z "${NO_DOCKER:-}" ]]; then
    if ! command -v docker &>/dev/null; then
      info "Installing Docker..."
      curl -fsSL https://get.docker.com | bash >> "$LOGFILE" 2>&1 || err "Docker install failed"
      systemctl enable docker; systemctl start docker
      log "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
    else
      log "Docker: $(docker --version | awk '{print $3}' | tr -d ',')"
    fi

    if ! docker compose version &>/dev/null; then
      info "Installing Docker Compose..."
      local arch_suffix; case "$(uname -m)" in aarch64) arch_suffix="aarch64" ;; armv7l) arch_suffix="armv7" ;; x86_64) arch_suffix="x86_64" ;; *) arch_suffix="$(uname -m)" ;; esac
      mkdir -p /usr/local/lib/docker/cli-plugins
      retry curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-${arch_suffix}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose || err "Compose download failed"
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      log "Docker Compose installed"
    else
      log "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'present')"
    fi
  fi
}

# ============================================================================
# Stage 2 — Configure
# ============================================================================
stage_config() {
  sep; info "Stage 2/5 — Configuration"

  DEFAULT_IP=$(hostname -I | awk '{print $1}') || DEFAULT_IP="127.0.0.1"
  HOST_IP="${HOST_IP:-$DEFAULT_IP}"
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@iot.local}"

  # Auto-generate secrets
  DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 18 | tr '+/' '-_')}"
  JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
  ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 12 | tr '+/' '-_')}"
  MQTT_USER="${MQTT_USER:-iot}"
  MQTT_PASSWORD="${MQTT_PASSWORD:-$(openssl rand -base64 12 | tr '+/' '-_')}"

  if ! echo "$ADMIN_EMAIL" | grep -qE '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
    err "Invalid email: $ADMIN_EMAIL"
  fi

  log "Server IP: $HOST_IP"
}

# ============================================================================
# Stage 3 — Generate configs
# ============================================================================
stage_generate() {
  sep; info "Stage 3/5 — Generating config files"

  # Mosquitto config directory
  mkdir -p "$SCRIPT_DIR/mosquitto/conf"

  cat > "$SCRIPT_DIR/mosquitto/conf/mosquitto.conf" << MOSQEOF
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd

listener 9001
protocol websockets
allow_anonymous false
password_file /mosquitto/config/passwd

persistence true
persistence_location /mosquitto/data/
log_dest stdout
connection_messages true
MOSQEOF

  # Pre-create Mosquitto password file on the host before containers start
  # Uses Docker to run mosquitto_passwd with the config directory mounted
  info "Creating MQTT credentials..."
  if retry docker run --rm \
    -v "$SCRIPT_DIR/mosquitto/conf:/mosquitto/config" \
    eclipse-mosquitto:2-openssl \
    mosquitto_passwd -c -b /mosquitto/config/passwd "${MQTT_USER}" "${MQTT_PASSWORD}" 2>&1; then
    log "MQTT credentials file created"
  else
    # Fallback: create using openssl (mosquitto_passwd file format)
    warn "Docker mosquitto_passwd failed — using fallback"
    local SALT
    SALT=$(openssl rand -base64 12)
    local HASH
    HASH=$(openssl passwd -6 -salt "$SALT" "$MQTT_PASSWORD" 2>/dev/null || echo "")
    if [[ -n "$HASH" ]]; then
      echo "${MQTT_USER}:${HASH}" > "$SCRIPT_DIR/mosquitto/conf/passwd"
      log "MQTT credentials file created (fallback)"
    else
      err "Failed to create MQTT password file"
    fi
  fi

  # Migrate old single-file config if it exists
  [[ -f "$SCRIPT_DIR/mosquitto.conf" ]] && mv "$SCRIPT_DIR/mosquitto.conf" "$SCRIPT_DIR/mosquitto.conf.bak"

  # Backend .env
  [[ -f "$SCRIPT_DIR/backend/.env" ]] && cp "$SCRIPT_DIR/backend/.env" "$SCRIPT_DIR/backend/.env.bak"
  cat > "$SCRIPT_DIR/backend/.env" << ENVEOF
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL=postgresql://iotadmin:${DB_PASSWORD}@postgres:5432/iot_platform?schema=public
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_USERNAME=${MQTT_USER}
MQTT_PASSWORD=${MQTT_PASSWORD}
CORS_ORIGINS=http://localhost:3000,http://${HOST_IP}:3000
ENVEOF

  # Docker Compose env
  cat > "$SCRIPT_DIR/.env.server" << SERVERENV
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
HOST_IP=${HOST_IP}
MQTT_USER=${MQTT_USER}
MQTT_PASSWORD=${MQTT_PASSWORD}
SERVERENV

  log "Configs generated"
}

# ============================================================================
# Stage 4 — Start Docker services
# ============================================================================
stage_docker_up() {
  sep; info "Stage 4/5 — Starting Docker services"

  info "Pulling base images..."
  retry docker pull postgres:16-alpine || warn "Postgres pull failed"
  retry docker pull redis:7-alpine || warn "Redis pull failed"
  retry docker pull eclipse-mosquitto:2-openssl || warn "Mosquitto pull failed"

  info "Building and starting services..."
  if ! docker compose -f "$SCRIPT_DIR/docker-compose.server.yml" \
       --env-file "$SCRIPT_DIR/.env.server" up -d --build >> "$LOGFILE" 2>&1; then
    err "Docker Compose failed — check logs: docker compose -f docker-compose.server.yml logs"
  fi

  # Wait for Mosquitto
  info "Waiting for Mosquitto..."
  for i in $(seq 1 15); do
    docker exec iot-mosquitto mosquitto_sub -t "\$SYS/broker/uptime" -C 1 >/dev/null 2>&1 && { log "Mosquitto ready"; break; }
    [[ $((i % 5)) -eq 0 ]] && warn "Waiting for Mosquitto... (${i}s)"
    sleep 2
  done

  # Wait for backend
  info "Waiting for backend..."
  for i in $(seq 1 60); do
    curl -sf "http://localhost:3001/api/v1/health" >/dev/null 2>&1 && { log "Backend ready"; break; }
    [[ $((i % 10)) -eq 0 ]] && warn "Waiting... (${i}s)"
    sleep 2
  done

  # Migrations
  docker ps --format '{{.Names}}' | grep -q iot-backend && {
    info "Running migrations..."
    docker exec iot-backend sh -c "npx prisma migrate deploy" >> "$LOGFILE" 2>&1 && \
      log "Migrations complete" || warn "Migrations failed — run manually"
  }

  # Seed admin
  if [[ -z "${SKIP_SEED:-}" ]]; then
    info "Creating admin user..."
    local resp
    resp=$(curl -s -X POST "http://localhost:3001/api/v1/auth/register" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"name\":\"Admin\"}")
    if echo "$resp" | grep -q '"id"'; then
      log "Admin: ${ADMIN_EMAIL}"
    else
      warn "Admin creation skipped (may already exist)"
    fi
  fi
}

# ============================================================================
# Stage 5 — Print summary
# ============================================================================
stage_summary() {
  sep; info "Stage 5/5 — Setup complete"
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║      Mango IoT Platform — Server Installed     ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend:${NC}      http://${HOST_IP}:3000"
  echo -e "  ${CYAN}Backend API:${NC}   http://${HOST_IP}:3001/api/v1"
  echo -e "  ${CYAN}API Docs:${NC}      http://${HOST_IP}:3001/api/docs"
  echo ""
  echo -e "  ${CYAN}MQTT Broker:${NC}   mqtt://${HOST_IP}:1883"
  echo -e "  ${CYAN}MQTT WS:${NC}       ws://${HOST_IP}:9001"
  echo -e "  ${CYAN}MQTT User:${NC}     ${MQTT_USER}"
  echo -e "  ${CYAN}MQTT Pass:${NC}     ${MQTT_PASSWORD}"
  echo ""
  echo -e "  ${YELLOW}Admin Login:${NC}"
  echo -e "    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
  echo ""
  echo -e "  ${YELLOW}Gateway agent:${NC}"
  echo -e "    Project:  https://github.com/mango-iot/gateway-client"
  echo -e "    MQTT:     mqtt://${HOST_IP}:1883"
  echo -e "    Username: ${MQTT_USER}"
  echo -e "    Password: ${MQTT_PASSWORD}"
  echo ""

  cat > "$CREDENTIALS_FILE" << CRED
╔══════════════════════════════════════╗
║   Mango IoT Platform — Server       ║
╚══════════════════════════════════════╝

Generated: $(date)

Frontend:     http://${HOST_IP}:3000
Backend API:  http://${HOST_IP}:3001/api/v1
API Docs:     http://${HOST_IP}:3001/api/docs

MQTT Broker:
  URL:      mqtt://${HOST_IP}:1883
  WS URL:   ws://${HOST_IP}:9001
  Username: ${MQTT_USER}
  Password: ${MQTT_PASSWORD}

Database:
  Host:     localhost:5432
  User:     iotadmin
  Password: ${DB_PASSWORD}
  Database: iot_platform

Admin:
  Email:    ${ADMIN_EMAIL}
  Password: ${ADMIN_PASSWORD}

--- Client setup command (run on each Pi) ---
# git clone https://github.com/mango-iot/gateway-client.git
# cd mango-iot-gateway-client
sudo bash setup.sh \\
  --server mqtt://${HOST_IP}:1883 \\
  --mqtt-user ${MQTT_USER} \\
  --mqtt-pass ${MQTT_PASSWORD} \\
  --token YOUR_PROVISION_TOKEN

--- KEEP THIS FILE SECURE ---
CRED
  chmod 600 "$CREDENTIALS_FILE"
  log "Credentials: $CREDENTIALS_FILE"
  info "Setup complete — open http://${HOST_IP}:3000"
}

# ============================================================================
# Main
# ============================================================================
main() {
  setup_colors
  mkdir -p "$(dirname "$LOGFILE")"

  local stage="${STAGE:-1}"
  [[ "$stage" =~ ^[1-5]$ ]] || err "STAGE must be 1-5"

  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   Mango IoT Platform — Server Setup   ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
  echo ""
  info "Log: $LOGFILE | Stage: $stage"

  preflight
  [[ $stage -le 1 ]] && stage_docker
  [[ $stage -le 2 ]] && stage_config
  [[ $stage -le 3 ]] && stage_generate
  [[ $stage -le 4 ]] && stage_docker_up
  [[ $stage -le 5 ]] && stage_summary
}

main "$@"
