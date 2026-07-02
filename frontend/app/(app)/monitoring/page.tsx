'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Bell, CheckCircle2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';

export default function MonitoringPage() {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => monitoringApi.getAlerts().then((r) => r.data?.data || r.data),
    refetchInterval: 10000,
  });

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', 'monitoring'],
    queryFn: () => monitoringApi.getDashboard().then((r) => r.data?.data || r.data),
    refetchInterval: 15000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert acknowledged');
    },
    onError: () => toast.error('Failed to acknowledge alert'),
  });

  const alertList = Array.isArray(alerts) ? alerts : alerts?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Monitoring</h2>
          <p className="text-muted-foreground">Real-time gateway health and alerts</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh monitoring data">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{dashboard?.activeAlerts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg CPU</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.avgCpuUsage || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.avgMemoryUsage || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard?.totalGateways
                ? `${Math.round((dashboard.onlineGateways / dashboard.totalGateways) * 100)}%`
                : '0%'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">
            <Bell className="mr-2 h-4 w-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="gateways">Gateway Health</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alert History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {alertList.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No alerts</p>
                  )}
                  {alertList.map((alert: any) => (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{alert.title}</span>
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
                          <Badge
                            variant={
                              alert.status === 'OPEN'
                                ? 'destructive'
                                : alert.status === 'ACKNOWLEDGED'
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {alert.status}
                          </Badge>
                        </div>
                        {alert.description && (
                          <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(alert.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {alert.status === 'OPEN' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeMutation.mutate(alert.id)}
                            disabled={acknowledgeMutation.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateways">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Health Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Total Gateways</p>
                  <p className="text-2xl font-bold">{dashboard?.totalGateways || 0}</p>
                </div>
                <div className="rounded-lg border p-4 border-emerald-500/50">
                  <p className="text-sm font-medium text-emerald-500">Online</p>
                  <p className="text-2xl font-bold">{dashboard?.onlineGateways || 0}</p>
                </div>
                <div className="rounded-lg border p-4 border-red-500/50">
                  <p className="text-sm font-medium text-red-500">Offline</p>
                  <p className="text-2xl font-bold">{dashboard?.offlineGateways || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
