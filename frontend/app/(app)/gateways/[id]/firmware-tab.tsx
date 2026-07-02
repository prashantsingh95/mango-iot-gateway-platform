'use client';

import { useQuery } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Package } from 'lucide-react';
import { FirmwareHistoryEntry } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

const statusVariant: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'default',
  DOWNLOADING: 'secondary',
  INSTALLING: 'warning',
  COMPLETED: 'success',
  FAILED: 'destructive',
  ROLLED_BACK: 'secondary',
};

export function FirmwareTab({ gatewayId }: { gatewayId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gateway-firmware', gatewayId],
    queryFn: () => gatewaysApi.getFirmwareHistory(gatewayId).then((r) => r.data?.data || r.data),
    refetchInterval: 10000,
  });

  const history: FirmwareHistoryEntry[] = Array.isArray(data) ? data : data?.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firmware Update History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firmware</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Deployed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No firmware updates deployed yet
                  </TableCell>
                </TableRow>
              )}
              {history.map((entry: FirmwareHistoryEntry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{entry.firmware.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">v{entry.firmware.version}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[entry.status] || 'secondary'}>{entry.status}</Badge>
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    {entry.progress != null ? (
                      <div className="flex items-center gap-2">
                        <Progress value={entry.progress} className="w-20" />
                        <span className="text-xs text-muted-foreground">{entry.progress}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(entry.deployedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
