'use client';

import { useQuery } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatIST } from '@/lib/utils';

interface UptimeSlot {
  t: string;
  v: number;
}

interface UptimeData {
  gatewayId: string;
  slots: UptimeSlot[];
  summary: {
    totalSlots: number;
    upSlots: number;
    downSlots: number;
    uptimePercent: number;
  };
}

export function UptimeTab({ gatewayId }: { gatewayId: string }) {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const { data, isLoading } = useQuery<{ data: UptimeData }>({
    queryKey: ['gateway-uptime', gatewayId, from, to],
    queryFn: () => gatewaysApi.getUptime(gatewayId, { from, to }),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Uptime (24h)</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const uptime = data?.data;
  if (!uptime || uptime.slots.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Uptime (24h)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No uptime data yet. Data appears after the first 15-minute slot completes.</p>
        </CardContent>
      </Card>
    );
  }

  const slotWidth = Math.max(4, Math.min(12, 600 / uptime.slots.length));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Uptime (24h) — {uptime.summary.uptimePercent}% online</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TooltipProvider>
            <div className="flex flex-wrap gap-0.5" style={{ minHeight: 32 }}>
              {uptime.slots.map((slot, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={`rounded-sm cursor-pointer transition-colors ${
                        slot.v === 1 ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'
                      }`}
                      style={{ width: slotWidth, height: 24 }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                      <p className="text-xs">
                        {formatIST(slot.t)} — {slot.v === 1 ? 'Online' : 'Offline'}
                      </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>

          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span>Online: <strong>{uptime.summary.upSlots}</strong> slots</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-red-500" />
              <span>Offline: <strong>{uptime.summary.downSlots}</strong> slots</span>
            </div>
            <div className="text-muted-foreground">
              Uptime: <strong>{uptime.summary.uptimePercent}%</strong>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
