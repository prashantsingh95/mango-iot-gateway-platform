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
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo -e "${GREEN}Stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${CYAN}================================================"
echo "  IoT Gateway Platform - Auto Setup"
echo -e "================================================${NC}"
echo ""

# ─── 1. Check / Install Docker ─────────────────────────────
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker not found. Installing via Homebrew...${NC}"
  if command -v brew &> /dev/null; then
    brew install --cask docker
    echo -e "${YELLOW}Docker installed. Please open Docker.app manually,"
    echo -e "then re-run this script.${NC}"
    exit 1
  else
    echo -e "${RED}Please install Docker Desktop from https://docker.com${NC}"
    exit 1
  fi
fi

if ! docker info &> /dev/null; then
  echo -e "${YELLOW}Docker daemon not running. Starting Docker...${NC}"
  open -a Docker 2>/dev/null || true
  echo -e "${YELLOW}Waiting for Docker to start..."
  for i in {1..30}; do
    sleep 2
    if docker info &> /dev/null; then
      echo -e "${GREEN}✓${NC} Docker is running"
      break
    fi
    if [ $i -eq 30 ]; then
      echo -e "${RED}Timed out waiting for Docker. Please start Docker manually.${NC}"
      exit 1
    fi
  done
fi

echo -e "${GREEN}✓${NC} Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ─── 2. Start Infrastructure ────────────────────────────────
echo ""
echo -e "${YELLOW}Starting infrastructure containers...${NC}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" up -d postgres redis emqx nats minio minio-setup 2>&1 | tail -5
echo -e "${GREEN}✓${NC} Infrastructure containers started"

echo -e "${YELLOW}Waiting for services to be healthy..."
for i in {1..30}; do
  PG_OK=$(docker exec iot-postgres pg_isready -U iotadmin 2>/dev/null && echo "ok" || echo "")
  if [ -n "$PG_OK" ]; then
    echo -e "${GREEN}✓${NC} PostgreSQL is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}PostgreSQL failed to start${NC}"
    exit 1
  fi
  sleep 2
done

# ─── 3. Install Backend Dependencies ────────────────────────
echo ""
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd "$SCRIPT_DIR/backend"
npm install --legacy-peer-deps 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Backend dependencies"

# ─── 4. Generate Prisma & Run Migrations ────────────────────
echo -e "${YELLOW}Setting up database...${NC}"
npx prisma generate 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Prisma client generated"

npx prisma migrate dev --name init --skip-seed 2>&1 | tail -3
echo -e "${GREEN}✓${NC} Database migrations applied"

# ─── 5. Seed Database ──────────────────────────────────────
echo -e "${YELLOW}Seeding database...${NC}"
cat > prisma/seed.ts << 'SEEDEOF'
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Default Organization', slug: 'default' },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@iot.com' },
    update: {},
    create: {
      email: 'admin@iot.com',
      passwordHash,
      name: 'Admin User',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });

  // Create demo gateways
  const gateways = [
    { deviceId: 'GW-001', name: 'Smart Street Light A1', serialNumber: 'SN-10001', model: 'SLG-200', manufacturer: 'IoTech', status: 'ONLINE', cpuUsage: 23, memoryUsage: 45, diskUsage: 32, temperature: 42.5, signalStrength: -65, voltage: 24.1, tags: ['street-lighting', 'zone-a'], tenantId: tenant.id },
    { deviceId: 'GW-002', name: 'Water Meter Hub B2', serialNumber: 'SN-10002', model: 'WMG-100', manufacturer: 'AquaSys', status: 'ONLINE', cpuUsage: 15, memoryUsage: 30, diskUsage: 28, temperature: 38.2, signalStrength: -72, voltage: 12.3, tags: ['water-metering', 'zone-b'], tenantId: tenant.id },
    { deviceId: 'GW-003', name: 'Energy Monitor C3', serialNumber: 'SN-10003', model: 'EMG-300', manufacturer: 'PowerTrack', status: 'ONLINE', cpuUsage: 45, memoryUsage: 62, diskUsage: 55, temperature: 51.8, signalStrength: -58, voltage: 48.0, tags: ['energy', 'zone-c'], tenantId: tenant.id },
    { deviceId: 'GW-004', name: 'EV Charger Station D4', serialNumber: 'SN-10004', model: 'EVG-400', manufacturer: 'ChargeNet', status: 'ONLINE', cpuUsage: 32, memoryUsage: 40, diskUsage: 35, temperature: 45.0, signalStrength: -70, voltage: 230.0, tags: ['ev-charging', 'zone-a'], tenantId: tenant.id },
    { deviceId: 'GW-005', name: 'Temp Sensor Array E5', serialNumber: 'SN-10005', model: 'TSG-500', manufacturer: 'SensorPro', status: 'OFFLINE', cpuUsage: 0, memoryUsage: 10, diskUsage: 15, temperature: 0, signalStrength: -95, voltage: 0, tags: ['environmental', 'zone-b'], tenantId: tenant.id, statusReason: 'Power outage' },
  ];

  for (const gw of gateways) {
    const existing = await prisma.gateway.findUnique({ where: { deviceId: gw.deviceId } });
    if (!existing) {
      await prisma.gateway.create({ data: gw as any });
    }
  }

  // Create firmware release
  await prisma.firmwareRelease.upsert({
    where: { id: 'demo-fw-1' },
    update: {},
    create: {
      id: 'demo-fw-1',
      name: 'Stable Release v2.1',
      version: '2.1.0',
      filename: 'firmware-v2.1.0.bin',
      fileSize: 16777216,
      checksum: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      status: 'PUBLISHED',
      changelog: 'Bug fixes and performance improvements',
      tenantId: tenant.id,
      createdBy: 'seed',
      publishedAt: new Date(),
    },
  });

  const gwCount = await prisma.gateway.count();
  console.log(`Seeded: 1 tenant, 1 admin, ${gwCount} gateways, 1 firmware`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
SEEDEOF

npx ts-node prisma/seed.ts 2>&1 | tail -3
echo -e "${GREEN}✓${NC} Database seeded"

# ─── 6. Install Frontend Dependencies ──────────────────────
echo ""
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
cd "$SCRIPT_DIR/frontend"
npm install --legacy-peer-deps 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Frontend dependencies"

# Create .env.local
cat > "$SCRIPT_DIR/frontend/.env.local" << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_APP_NAME=IoT Gateway Platform
EOF
echo -e "${GREEN}✓${NC} Frontend .env.local created"

# ─── 7. Start Dev Servers ──────────────────────────────────
echo ""
echo -e "${CYAN}================================================"
echo "  Starting development servers..."
echo -e "================================================${NC}"
echo ""
echo -e "  ${GREEN}Backend API:${NC}  http://localhost:3001"
echo -e "  ${GREEN}Frontend:${NC}     http://localhost:3000"
echo -e "  ${GREEN}Swagger Docs:${NC} http://localhost:3001/api/docs"
echo -e "  ${GREEN}EMQX Admin:${NC}   http://localhost:18083 (admin/public)"
echo -e "  ${GREEN}MinIO Console:${NC} http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo -e "  ${YELLOW}Login:${NC} admin@iot.com / admin123"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

cd "$SCRIPT_DIR/backend"
npx nest start --watch &
BACKEND_PID=$!

sleep 4

cd "$SCRIPT_DIR/frontend"
npx next dev --port 3000 &
FRONTEND_PID=$!

wait
