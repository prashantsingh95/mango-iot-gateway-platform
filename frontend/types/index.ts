export interface Gateway {
  id: string;
  deviceId: string;
  name: string;
  serialNumber: string;
  macAddress?: string;
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  osVersion?: string;
  status: 'ONLINE' | 'OFFLINE' | 'PROVISIONING' | 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'UPDATING';
  statusReason?: string;
  ipAddress?: string;
  publicIp?: string;
  lastHeartbeat?: string;
  uptime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  temperature?: number;
  signalStrength?: number;
  voltage?: number;
  batteryLevel?: number;
  locationLat?: number;
  locationLng?: number;
  tags: string[];
  isProvisioned: boolean;
  tenantId: string;
  siteId?: string;
  groupId?: string;
  configProfileId?: string;
  connectedDevices?: ConnectedDevice[];
  createdAt: string;
  updatedAt: string;
}

export interface ConnectedDevice {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  protocol: string;
  status: string;
  lastSeenAt?: string;
  gatewayId: string;
}

export interface FirmwareRelease {
  id: string;
  name: string;
  version: string;
  description?: string;
  filename: string;
  fileSize: number;
  checksum: string;
  status: 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'DEPLOYED' | 'ROLLED_BACK' | 'ARCHIVED';
  targetModel?: string;
  changelog?: string;
  isCritical: boolean;
  createdAt: string;
  publishedAt?: string;
}

export interface Alert {
  id: string;
  title: string;
  description?: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'DEBUG';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  source?: string;
  sourceId?: string;
  assignedTo?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  avatar?: string;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  gateways?: Gateway[];
  children?: Site[];
}

export interface GatewayGroup {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  gateways?: Gateway[];
  children?: GatewayGroup[];
}

export interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  version: number;
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface GatewayCommand {
  id: string;
  gatewayId: string;
  type: string;
  payload?: Record<string, any>;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  result?: Record<string, any>;
  error?: string;
  executedBy: string;
  executedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface FirmwareHistoryEntry {
  id: string;
  gatewayId: string;
  firmwareId: string;
  status: string;
  progress?: number;
  message?: string;
  deployedAt: string;
  firmware: {
    id: string;
    name: string;
    version: string;
  };
}

export interface DashboardMetrics {
  totalGateways: number;
  onlineGateways: number;
  offlineGateways: number;
  totalDevices: number;
  activeAlerts: number;
  pendingFirmwareUpdates: number;
  gatewayStatusDistribution: Record<string, number>;
  avgCpuUsage: number;
  avgMemoryUsage: number;
  recentAlerts: Alert[];
}
