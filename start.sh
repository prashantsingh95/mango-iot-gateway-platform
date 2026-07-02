#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo -e "${YELLOW}Stopping infrastructure containers...${NC}"
  docker compose -f "$COMPOSE_FILE" down 2>/dev/null
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${CYAN}================================================"
echo "  Mango IoT - Setup & Start"
echo -e "================================================${NC}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed.${NC}"
  echo "Install from https://docker.com or run: brew install --cask docker"
  exit 1
fi

if ! docker info &> /dev/null; then
  echo -e "${YELLOW}Docker daemon not running. Please start Docker Desktop first.${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# Cleanup existing processes
echo ""
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "node dist/main" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
# Kill processes on ports 3000-3001
for port in 3000 3001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null) || true
  if [ -n "$pid" ]; then
    echo -e "  ${YELLOW}Port $port in use by PID $pid, stopping...${NC}"
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
done
echo -e "${GREEN}✓${NC} Ports 3000-3001 are free"

# Start infrastructure
echo ""
echo -e "${YELLOW}Starting infrastructure containers...${NC}"
docker compose -f "$COMPOSE_FILE" up -d postgres redis emqx nats minio prometheus grafana loki minio-setup 2>&1 | tail -3
echo -e "${GREEN}✓${NC} Infrastructure started"

echo -e "${YELLOW}Waiting for PostgreSQL..."
for i in {1..30}; do
  if docker exec iot-postgres pg_isready -U iotadmin &>/dev/null; then
    echo -e "${GREEN}✓${NC} PostgreSQL ready"
    break
  fi
  if [ $i -eq 30 ]; then echo -e "${RED}PostgreSQL failed to start${NC}"; exit 1; fi
  sleep 2
done

# Backend setup
echo ""
echo -e "${YELLOW}Setting up backend...${NC}"
cd "$SCRIPT_DIR/backend"
npm install --legacy-peer-deps 2>&1 | tail -1
npx prisma generate 2>&1 | tail -1
npx prisma migrate dev --name init --skip-seed 2>&1 | tail -1

# Seed
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const t = await prisma.tenant.upsert({ where: { slug: 'default' }, update: {}, create: { name: 'Default Org', slug: 'default' } });
  const pwd = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({ where: { email: 'admin@iot.com' }, update: {}, create: { email: 'admin@iot.com', passwordHash: pwd, name: 'Admin', role: 'ADMIN', tenantId: t.id } });
  console.log('Seeded: tenant + admin user');
  await prisma.\$disconnect();
})();
" 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Backend ready"

# Frontend setup
echo -e "${YELLOW}Setting up frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
npm install --legacy-peer-deps 2>&1 | tail -1
cat > "$SCRIPT_DIR/frontend/.env.local" << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
EOF
echo -e "${GREEN}✓${NC} Frontend ready"

# Start servers
echo ""
echo -e "${CYAN}================================================"
echo "  Starting development servers"
echo -e "================================================${NC}"
echo ""
echo -e "  ${GREEN}Frontend:${NC}     http://localhost:3000"
echo -e "  ${GREEN}Backend API:${NC}  http://localhost:3001"
echo -e "  ${GREEN}Swagger Docs:${NC} http://localhost:3001/api/docs"
echo -e "  ${GREEN}Grafana:${NC}      http://localhost:3002 (admin/admin)"
echo -e "  ${GREEN}EMQX:${NC}         http://localhost:18083 (admin/public)"
echo ""
echo -e "  ${YELLOW}Login:${NC} admin@iot.com / admin123"
echo -e "  ${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

cd "$SCRIPT_DIR/backend"
echo -e "${YELLOW}Building backend...${NC}"
npx nest build 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Backend built"

node dist/main.js &
BACKEND_PID=$!

sleep 4

cd "$SCRIPT_DIR/frontend"
npx next dev --port 3000 &
FRONTEND_PID=$!

wait
