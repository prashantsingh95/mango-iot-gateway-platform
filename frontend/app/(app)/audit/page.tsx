'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';

const actionColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  LOGIN: 'default',
  REGISTER: 'secondary',
  CHANGE_PASSWORD: 'outline',
  GATEWAY_CREATE: 'default',
  GATEWAY_UPDATE: 'secondary',
  GATEWAY_DELETE: 'destructive',
  FIRMWARE_CREATE: 'default',
  FIRMWARE_DELETE: 'destructive',
  FIRMWARE_DEPLOY: 'secondary',
};

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () => api.get('/audit-logs', { params: { page, limit: 50, action: search ? search.toUpperCase() : undefined } })
      .then((r) => r.data),
  });

  const logs = data?.data || [];
  const totalPages = Math.ceil((data?.total || 0) / (data?.limit || 50));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Logs</h2>
          <p className="text-muted-foreground">Track all actions across the platform</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh audit logs">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by action (e.g. LOGIN, GATEWAY_CREATE)..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={actionColors[log.action] || 'outline'}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.entity}{log.entityId ? ` (${log.entityId.slice(0, 8)}...)` : ''}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.user?.name || log.user?.email || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(log.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
