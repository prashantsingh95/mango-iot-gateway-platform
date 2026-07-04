'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Terminal as TerminalIcon, RefreshCw, Power, Trash2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';
import { LogViewer } from './log-viewer';
import { CommandsTab } from './commands-tab';
import { FirmwareTab } from './firmware-tab';
import { TerminalTab } from './terminal-tab';
import { UptimeTab } from '@/components/gateways/uptime-tab';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const statusVariantMap: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  ONLINE: 'success',
  OFFLINE: 'destructive',
  PROVISIONING: 'warning',
  ACTIVE: 'info',
  ERROR: 'destructive',
  UPDATING: 'warning',
};

export default function GatewayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data: gateway, isLoading } = useQuery({
    queryKey: ['gateway', id],
    queryFn: () => gatewaysApi.get(id).then((r) => r.data?.data || r.data),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => gatewaysApi.delete(id),
    onSuccess: () => {
      toast.success('Gateway deleted');
      router.push('/gateways');
    },
    onError: () => toast.error('Failed to delete gateway'),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', serialNumber: '', model: '', manufacturer: '',
    hardwareVersion: '', osVersion: '', macAddress: '', firmwareVersion: '',
  });

  useEffect(() => {
    if (gateway) {
      setEditForm({
        name: gateway.name || '',
        serialNumber: gateway.serialNumber || '',
        model: gateway.model || '',
        manufacturer: gateway.manufacturer || '',
        hardwareVersion: gateway.hardwareVersion || '',
        osVersion: gateway.osVersion || '',
        macAddress: gateway.macAddress || '',
        firmwareVersion: gateway.firmwareVersion || '',
      });
    }
  }, [gateway]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => gatewaysApi.update(id, data),
    onSuccess: () => {
      toast.success('Gateway updated');
      queryClient.invalidateQueries({ queryKey: ['gateway', id] });
      setEditOpen(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!gateway) {
    return <div>Gateway not found</div>;
  }

  const metrics = [
    { label: 'CPU', value: gateway.cpuUsage, icon: '💻' },
    { label: 'Memory', value: gateway.memoryUsage, icon: '🧠' },
    { label: 'Disk', value: gateway.diskUsage, icon: '💾' },
    { label: 'Signal', value: gateway.signalStrength, icon: '📡' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/gateways">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{gateway.name}</h2>
            <Badge variant={statusVariantMap[gateway.status] || 'secondary'}>
              {gateway.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{gateway.deviceId}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['gateway', id] })} aria-label="Refresh gateway data">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Device Profile</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Serial Number</Label>
                  <Input value={editForm.serialNumber} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Model</Label>
                  <Input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Manufacturer</Label>
                  <Input value={editForm.manufacturer} onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Firmware Version</Label>
                  <Input value={editForm.firmwareVersion} onChange={(e) => setEditForm({ ...editForm, firmwareVersion: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Hardware Version</Label>
                  <Input value={editForm.hardwareVersion} onChange={(e) => setEditForm({ ...editForm, hardwareVersion: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>OS Version</Label>
                  <Input value={editForm.osVersion} onChange={(e) => setEditForm({ ...editForm, osVersion: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>MAC Address</Label>
                  <Input value={editForm.macAddress} onChange={(e) => setEditForm({ ...editForm, macAddress: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => { if (confirm('Delete this gateway?')) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {m.icon} {m.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {m.value != null ? `${m.value}%` : 'N/A'}
              </div>
              {m.value != null && <Progress value={m.value} className="mt-2" />}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="uptime">Uptime</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="devices">Connected Devices</TabsTrigger>
          <TabsTrigger value="firmware">Firmware</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ['Serial Number', gateway.serialNumber],
                  ['Model', gateway.model],
                  ['Manufacturer', gateway.manufacturer],
                  ['Firmware', gateway.firmwareVersion],
                  ['Hardware', gateway.hardwareVersion],
                  ['OS', gateway.osVersion],
                  ['IP Address', gateway.ipAddress],
                  ['MAC Address', gateway.macAddress],
                  ['Uptime', gateway.uptime ? `${Math.floor(gateway.uptime / 3600)}h` : 'N/A'],
                  ['Last Heartbeat', gateway.lastHeartbeat ? formatRelativeTime(gateway.lastHeartbeat) : 'Never'],
                  ['Temperature', gateway.temperature != null ? `${gateway.temperature}°C` : 'N/A'],
                  ['Voltage', gateway.voltage != null ? `${gateway.voltage}V` : 'N/A'],
                  ['Owner', gateway.owner?.name || '-'],
                  ['Group', gateway.group?.name || '-'],
                  ['Site', gateway.site?.name || '-'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-sm text-muted-foreground">{label as string}</dt>
                    <dd className="text-sm font-medium">{value as string || '-'}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="uptime" className="space-y-4">
          <UptimeTab gatewayId={id} />
        </TabsContent>
        <TabsContent value="terminal" className="space-y-4">
          <TerminalTab gatewayId={id} />
        </TabsContent>
        <TabsContent value="commands" className="space-y-4">
          <CommandsTab gatewayId={id} />
        </TabsContent>
        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle>Connected Devices ({gateway.connectedDevices?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {gateway.connectedDevices?.length === 0 && (
                <p className="text-sm text-muted-foreground">No devices connected</p>
              )}
              {gateway.connectedDevices?.map((device: any) => (
                <div key={device.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{device.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{device.deviceId}</p>
                  </div>
                  <Badge variant={device.status === 'ONLINE' ? 'success' : 'secondary'}>
                    {device.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="firmware" className="space-y-4">
          <FirmwareTab gatewayId={id} />
        </TabsContent>
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <LogViewer gatewayId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
