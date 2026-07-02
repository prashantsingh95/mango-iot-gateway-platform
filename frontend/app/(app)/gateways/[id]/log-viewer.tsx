'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

export function LogViewer({ gatewayId }: { gatewayId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['gateway-logs', gatewayId],
    queryFn: () =>
      gatewaysApi.getLogs(gatewayId).then((r) => r.data?.data || r.data),
    refetchInterval: 5000,
  });

  const logList: LogEntry[] = Array.isArray(logs) ? logs : logs?.data || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logList.length]);

  const levelColors: Record<string, string> = {
    ERROR: 'text-red-500',
    WARN: 'text-amber-500',
    INFO: 'text-emerald-500',
    DEBUG: 'text-muted-foreground',
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (logList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No logs available
      </p>
    );
  }

  return (
    <div className="space-y-1 font-mono text-xs max-h-[400px] overflow-y-auto">
      {logList.map((log) => (
        <div key={log.id} className="flex gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={`shrink-0 font-semibold ${levelColors[log.level] || 'text-foreground'}`}>
            {log.level}
          </span>
          <span className="break-all">{log.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
