-- Reverse-connection remote terminal: gateway agent fields + terminal session audit

-- CreateEnum
CREATE TYPE "TerminalSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED', 'ERROR');

-- AlterTable Gateway
ALTER TABLE "Gateway" ADD COLUMN "agentSecretHash" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "agentConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Gateway" ADD COLUMN "agentConnectedAt" TIMESTAMP(3);
ALTER TABLE "Gateway" ADD COLUMN "agentLastSeen" TIMESTAMP(3);
ALTER TABLE "Gateway" ADD COLUMN "agentVersion" TEXT;

-- CreateTable TerminalSession
CREATE TABLE "TerminalSession" (
    "id" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TerminalSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "shell" TEXT,
    "bytesIn" INTEGER NOT NULL DEFAULT 0,
    "bytesOut" INTEGER NOT NULL DEFAULT 0,
    "commandCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TerminalSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TerminalSession" ADD CONSTRAINT "TerminalSession_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TerminalSession_gatewayId_idx" ON "TerminalSession" ("gatewayId");
CREATE INDEX "TerminalSession_tenantId_idx" ON "TerminalSession" ("tenantId");
CREATE INDEX "TerminalSession_userId_idx" ON "TerminalSession" ("userId");
CREATE INDEX "TerminalSession_status_idx" ON "TerminalSession" ("status");
CREATE INDEX "TerminalSession_startedAt_idx" ON "TerminalSession" ("startedAt");
