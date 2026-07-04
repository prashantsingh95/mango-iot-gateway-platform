-- CreateTable
CREATE TABLE "GatewayMetric" (
    "id" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "diskUsage" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "signalStrength" DOUBLE PRECISION,
    "voltage" DOUBLE PRECISION,
    "batteryLevel" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatewayMetric_gatewayId_timestamp_idx" ON "GatewayMetric"("gatewayId", "timestamp");

-- CreateIndex
CREATE INDEX "GatewayMetric_tenantId_timestamp_idx" ON "GatewayMetric"("tenantId", "timestamp");

-- AddForeignKey
ALTER TABLE "GatewayMetric" ADD CONSTRAINT "GatewayMetric_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
