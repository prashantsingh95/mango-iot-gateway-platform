'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, FolderTree } from 'lucide-react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';

const statusVariantMap: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  ONLINE: 'success',
  OFFLINE: 'destructive',
  PROVISIONING: 'warning',
  ACTIVE: 'info',
  ERROR: 'destructive',
  UPDATING: 'warning',
};

export default function GatewaysPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gateways', search],
    queryFn: () => gatewaysApi.list({ search, limit: 50 }).then((r) => r.data?.data || r.data),
  });

  const gateways = Array.isArray(data) ? data : data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gateways</h2>
          <p className="text-muted-foreground">Manage your IoT gateways</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh gateway list">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" asChild>
            <Link href="/gateways/groups">
              <FolderTree className="mr-2 h-4 w-4" />
              Groups
            </Link>
          </Button>
          <Button asChild>
            <Link href="/gateways/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Gateway
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search gateways..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Device ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Firmware</TableHead>
                  <TableHead>Last Heartbeat</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No gateways found
                    </TableCell>
                  </TableRow>
                )}
                {gateways.map((gateway: any) => (
                  <TableRow key={gateway.id} className="cursor-pointer" onClick={() => window.location.href = `/gateways/${gateway.id}`}>
                    <TableCell className="font-medium">{gateway.name}</TableCell>
                    <TableCell className="font-mono text-xs">{gateway.deviceId}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariantMap[gateway.status] || 'secondary'}>
                        {gateway.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{gateway.firmwareVersion || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {gateway.lastHeartbeat ? formatRelativeTime(gateway.lastHeartbeat) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {gateway.locationLat && gateway.locationLng
                        ? `${gateway.locationLat.toFixed(2)}, ${gateway.locationLng.toFixed(2)}`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
