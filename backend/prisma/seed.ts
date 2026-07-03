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
      s3Path: 'firmware/v2.1.0/firmware-v2.1.0.bin',
    },
  });

  const gwCount = await prisma.gateway.count();
  console.log(`Seeded: 1 tenant, 1 admin, ${gwCount} gateways, 1 firmware`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
