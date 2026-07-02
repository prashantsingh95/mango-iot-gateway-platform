'use client';

import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wifi,
  WifiOff,
  Cpu,
  MemoryStick,
  HardDrive,
  Thermometer,
  Bell,
  Activity,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => monitoringApi.getDashboard().then((r) => r.data?.data || r.data),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Gateways',
      value: dashboard?.totalGateways || 0,
      icon: Wifi,
      color: 'text-blue-500',
    },
    {
      title: 'Online',
      value: dashboard?.onlineGateways || 0,
      icon: ArrowUp,
      color: 'text-emerald-500',
    },
    {
      title: 'Offline',
      value: dashboard?.offlineGateways || 0,
      icon: ArrowDown,
      color: 'text-red-500',
    },
    {
      title: 'Connected Devices',
      value: dashboard?.totalDevices || 0,
      icon: Activity,
      color: 'text-purple-500',
    },
    {
      title: 'Active Alerts',
      value: dashboard?.activeAlerts || 0,
      icon: Bell,
      color: 'text-amber-500',
    },
    {
      title: 'Avg CPU',
      value: `${dashboard?.avgCpuUsage || 0}%`,
      icon: Cpu,
      color: 'text-cyan-500',
    },
    {
      title: 'Avg Memory',
      value: `${dashboard?.avgMemoryUsage || 0}%`,
      icon: MemoryStick,
      color: 'text-violet-500',
    },
    {
      title: 'Pending Updates',
      value: dashboard?.pendingFirmwareUpdates || 0,
      icon: HardDrive,
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your IoT infrastructure</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gateway Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard?.gatewayStatusDistribution &&
                Object.entries(dashboard.gatewayStatusDistribution).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <Badge variant={status === 'ONLINE' ? 'success' : status === 'OFFLINE' ? 'destructive' : 'warning'}>
                      {status}
                    </Badge>
                    <span className="text-sm font-medium">{count as number}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboard?.recentAlerts?.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent alerts</p>
              )}
              {dashboard?.recentAlerts?.slice(0, 5).map((alert: any) => (
                <div key={alert.id} className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(alert.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      alert.severity === 'CRITICAL'
                        ? 'destructive'
                        : alert.severity === 'WARNING'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
