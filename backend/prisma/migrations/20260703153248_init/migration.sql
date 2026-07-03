-- CreateEnum
CREATE TYPE "GatewayAccessLevel" AS ENUM ('VIEW', 'CONTROL', 'ADMIN');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ConnectedDevice" DROP CONSTRAINT "ConnectedDevice_gatewayId_fkey";

-- DropForeignKey
ALTER TABLE "FirmwareHistory" DROP CONSTRAINT "FirmwareHistory_firmwareId_fkey";

-- DropForeignKey
ALTER TABLE "FirmwareHistory" DROP CONSTRAINT "FirmwareHistory_gatewayId_fkey";

-- DropForeignKey
ALTER TABLE "GatewayCommand" DROP CONSTRAINT "GatewayCommand_gatewayId_fkey";

-- DropForeignKey
ALTER TABLE "GatewayLog" DROP CONSTRAINT "GatewayLog_gatewayId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- AlterTable
ALTER TABLE "Gateway" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "GatewayAccess" (
    "id" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "GatewayAccessLevel" NOT NULL DEFAULT 'VIEW',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayUptimeSlot" (
    "id" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "isUp" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayUptimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatewayAccess_userId_idx" ON "GatewayAccess"("userId");

-- CreateIndex
CREATE INDEX "GatewayAccess_gatewayId_idx" ON "GatewayAccess"("gatewayId");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayAccess_gatewayId_userId_key" ON "GatewayAccess"("gatewayId", "userId");

-- CreateIndex
CREATE INDEX "GatewayUptimeSlot_gatewayId_idx" ON "GatewayUptimeSlot"("gatewayId");

-- CreateIndex
CREATE INDEX "GatewayUptimeSlot_tenantId_idx" ON "GatewayUptimeSlot"("tenantId");

-- CreateIndex
CREATE INDEX "GatewayUptimeSlot_slotStart_idx" ON "GatewayUptimeSlot"("slotStart");

-- CreateIndex
CREATE INDEX "GatewayUptimeSlot_gatewayId_slotStart_idx" ON "GatewayUptimeSlot"("gatewayId", "slotStart");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayUptimeSlot_gatewayId_slotStart_key" ON "GatewayUptimeSlot"("gatewayId", "slotStart");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmwareHistory" ADD CONSTRAINT "FirmwareHistory_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmwareHistory" ADD CONSTRAINT "FirmwareHistory_firmwareId_fkey" FOREIGN KEY ("firmwareId") REFERENCES "FirmwareRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedDevice" ADD CONSTRAINT "ConnectedDevice_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayAccess" ADD CONSTRAINT "GatewayAccess_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayAccess" ADD CONSTRAINT "GatewayAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayCommand" ADD CONSTRAINT "GatewayCommand_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayLog" ADD CONSTRAINT "GatewayLog_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayUptimeSlot" ADD CONSTRAINT "GatewayUptimeSlot_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
