'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Send, Terminal, Power, RotateCw, Cable, Gauge, Shell } from 'lucide-react';
import { GatewayCommand } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

const commandSchemas: Record<string, { fields: { key: string; label: string; type: string; placeholder?: string }[] }> = {
  reboot: { fields: [] },
  restart_agent: { fields: [] },
  run_shell: { fields: [{ key: 'command', label: 'Command', type: 'text', placeholder: 'e.g. /opt/gateway/scripts/example.sh' }] },
  set_relay: { fields: [{ key: 'relay', label: 'Relay #', type: 'number' }, { key: 'state', label: 'State', type: 'select' }] },
  read_register: { fields: [{ key: 'address', label: 'Register Address', type: 'number', placeholder: 'e.g. 0' }, { key: 'quantity', label: 'Quantity', type: 'number', placeholder: 'e.g. 1' }] },
};

const commandIcons: Record<string, React.ReactNode> = {
  reboot: <Power className="h-4 w-4" />,
  restart_agent: <RotateCw className="h-4 w-4" />,
  run_shell: <Shell className="h-4 w-4" />,
  set_relay: <Cable className="h-4 w-4" />,
  read_register: <Gauge className="h-4 w-4" />,
  update_firmware: <Terminal className="h-4 w-4" />,
};

export function CommandsTab({ gatewayId }: { gatewayId: string }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('reboot');
  const [payload, setPayload] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['gateway-commands', gatewayId],
    queryFn: () => gatewaysApi.getCommands(gatewayId).then((r) => r.data?.data || r.data),
    refetchInterval: 5000,
  });

  const commandList: GatewayCommand[] = Array.isArray(data) ? data : data?.data || [];

  const executeMutation = useMutation({
    mutationFn: () => gatewaysApi.executeCommand(gatewayId, { type, payload }),
    onSuccess: () => {
      toast.success(`Command "${type}" dispatched`);
      setPayload({});
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['gateway-commands', gatewayId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to dispatch command'),
  });

  const schema = commandSchemas[type] || { fields: [] };
  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'success'> = {
    PENDING: 'default',
    COMPLETED: 'success',
    FAILED: 'destructive',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Dispatch Command</CardTitle>
            <Button variant={showForm ? 'outline' : 'default'} size="sm" onClick={() => setShowForm(!showForm)}>
              <Send className="mr-2 h-4 w-4" />
              {showForm ? 'Cancel' : 'New Command'}
            </Button>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Command Type</Label>
                <Select value={type} onValueChange={(v) => { setType(v); setPayload({}); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(commandSchemas).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          {commandIcons[key]}
                          {key.replace(/_/, ' ')}
                          {val.fields.length === 0 && <span className="text-xs text-muted-foreground">(no payload)</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {schema.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  {field.type === 'select' ? (
                    <Select
                      value={String(payload[field.key] ?? '')}
                      onValueChange={(v) => setPayload((p) => ({ ...p, [field.key]: v === 'true' ? true : v === 'false' ? false : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">ON</SelectItem>
                        <SelectItem value="false">OFF</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={field.placeholder}
                      value={payload[field.key] ?? ''}
                      onChange={(e) =>
                        setPayload((p) => ({
                          ...p,
                          [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}

              <Button onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                Execute {type.replace(/_/, ' ')}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Command History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Executed</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commandList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No commands dispatched yet
                    </TableCell>
                  </TableRow>
                )}
                {commandList.map((cmd: GatewayCommand) => (
                  <TableRow key={cmd.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {commandIcons[cmd.type] || <Terminal className="h-4 w-4" />}
                        <span className="font-medium capitalize">{cmd.type.replace(/_/, ' ')}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[cmd.status] || 'secondary'}>{cmd.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {cmd.payload ? JSON.stringify(cmd.payload) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {cmd.result ? JSON.stringify(cmd.result) : cmd.error || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cmd.executedAt ? formatRelativeTime(cmd.executedAt) : formatRelativeTime(cmd.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cmd.completedAt ? formatRelativeTime(cmd.completedAt) : '-'}
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
