'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
  Plus,
  X,
  RefreshCw,
  Upload,
  Download,
} from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

type TabStatus = 'connecting' | 'connected' | 'offline' | 'closed' | 'error';

interface Tab {
  id: string;
  sessionId: string;
  title: string;
  status: TabStatus;
  error?: string;
}

const XTERM_THEMES = {
  dark: {
    background: '#1a1b1e',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    selectionBackground: '#3b3b40',
    black: '#1a1b1e',
    red: '#e5484d',
    green: '#30a46c',
    yellow: '#f5a623',
    blue: '#5b8dee',
    magenta: '#d46bb8',
    cyan: '#49b5b5',
    white: '#e4e4e7',
    brightBlack: '#3b3b40',
    brightRed: '#e5484d',
    brightGreen: '#30a46c',
    brightYellow: '#f5a623',
    brightBlue: '#5b8dee',
    brightMagenta: '#d46bb8',
    brightCyan: '#49b5b5',
    brightWhite: '#e4e4e7',
  },
  light: {
    background: '#ffffff',
    foreground: '#18181b',
    cursor: '#18181b',
    selectionBackground: '#c8c8cd',
    black: '#18181b',
    red: '#e5484d',
    green: '#30a46c',
    yellow: '#f5a623',
    blue: '#5b8dee',
    magenta: '#d46bb8',
    cyan: '#49b5b5',
    white: '#ffffff',
    brightBlack: '#a1a1aa',
    brightRed: '#e5484d',
    brightGreen: '#30a46c',
    brightYellow: '#f5a623',
    brightBlue: '#5b8dee',
    brightMagenta: '#d46bb8',
    brightCyan: '#49b5b5',
    brightWhite: '#ffffff',
  },
};

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// -- one terminal session (its own socket + xterm) --------------------------

function TerminalPane({
  gatewayId,
  sessionId,
  height,
  theme,
  onStatusChange,
}: {
  gatewayId: string;
  sessionId: string;
  height: number;
  theme: string | undefined;
  onStatusChange: (status: TabStatus, error?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const initedRef = useRef(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [status, setStatus] = useState<TabStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadBufRef = useRef<{ name: string; chunks: Uint8Array[] } | null>(null);

  const setStat = useCallback(
    (s: TabStatus, e?: string) => {
      setStatus(s);
      setError(e ?? null);
      onStatusChange(s, e);
    },
    [onStatusChange],
  );

  const connect = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setStat('error', 'Not authenticated');
      return;
    }
    if (socketRef.current) socketRef.current.disconnect();

    const socket: Socket = io(`${WS_URL}/terminal`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    // browser <-> backend RTT indicator
    const engine: any = (socket.io as any).engine;
    let pingStart = 0;
    engine?.on('ping', () => (pingStart = Date.now()));
    engine?.on('pong', () => setLatency(Date.now() - pingStart));

    socket.on('connect', () => {
      setStat('connecting');
      socket.emit('open', {
        gatewayId,
        sessionId,
        rows: termRef.current?.rows || 24,
        cols: termRef.current?.cols || 80,
      });
      setTimeout(() => termRef.current?.focus(), 50);
    });

    socket.on('connected', () => setStat('connected'));

    socket.on('output', (data: { data: string }) => {
      const term = termRef.current;
      if (!term || !data?.data) return;
      try {
        term.write(atob(data.data));
      } catch {
        const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
        term.write(bytes);
      }
    });

    socket.on('ready', () => setStat('connected'));
    socket.on('status', (p: any) => setStat('connected'));

    socket.on('error', (data: { message: string }) => {
      setStat('error', data.message);
      termRef.current?.write(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
    });

    socket.on('closed', () => setStat('closed'));

    socket.on('disconnect', () => setStat('offline'));

    // file transfer
    socket.on('file:init', (p: any) => {
      if (p.direction === 'download') {
        downloadBufRef.current = { name: p.path.split('/').pop() || 'download', chunks: [] };
      }
    });
    socket.on('file:data', (p: any) => {
      if (!downloadBufRef.current) return;
      const bin = atob(p.data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      downloadBufRef.current.chunks.push(arr);
    });
    socket.on('file:end', () => {
      const dl = downloadBufRef.current;
      if (!dl) return;
      const blob = new Blob(dl.chunks as BlobPart[]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dl.name;
      a.click();
      URL.revokeObjectURL(url);
      downloadBufRef.current = null;
    });
    socket.on('file:status', (p: any) => {
      termRef.current?.write(`\r\n\x1b[36m[file] ${p.status} ${p.path || ''}\x1b[0m\r\n`);
    });

    const term = termRef.current;
    if (term) {
      term.onData((data: string) => {
        if (socket.connected) socket.emit('input', { data: btoa(data) });
      });
      term.onResize(({ rows, cols }) => {
        if (socket.connected) socket.emit('resize', { rows, cols });
      });
    }
  }, [gatewayId, sessionId, setStat]);

  // init xterm once
  useEffect(() => {
    if (initedRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    initedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: XTERM_THEMES[(theme as 'dark' | 'light') || 'dark'],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    fitRef.current = fit;
    term.open(el);
    termRef.current = term;
    setTimeout(() => {
      try {
        fit.fit();
      } catch {}
    }, 50);

    connect();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      socketRef.current?.disconnect();
      term.dispose();
      initedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apply theme + height changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = XTERM_THEMES[(theme as 'dark' | 'light') || 'dark'];
    }
  }, [theme]);

  useEffect(() => {
    try {
      fitRef.current?.fit();
    } catch {}
  }, [height]);

  const handleUpload = (file: File) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const remotePath = `/tmp/${file.name}`;
    socket.emit('file:init', { direction: 'upload', path: remotePath, size: file.size });
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      const CHUNK = 32 * 1024;
      for (let off = 0; off < bytes.length; off += CHUNK) {
        const slice = bytes.subarray(off, Math.min(off + CHUNK, bytes.length));
        socket.emit('file:data', { data: btoa(String.fromCharCode(...slice)) });
      }
      socket.emit('file:end', {});
      termRef.current?.write(`\r\n\x1b[36m[file] uploading ${file.name} -> ${remotePath}\x1b[0m\r\n`);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownload = () => {
    const path = window.prompt('Remote file path to download');
    if (!path) return;
    socketRef.current?.emit('file:init', { direction: 'download', path });
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex items-center gap-2 border-b px-2 py-1 bg-muted/40">
        <Badge variant={status === 'connected' ? 'success' : 'secondary'} className="gap-1">
          {status === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {status}
        </Badge>
        {latency !== null && <span className="text-xs text-muted-foreground">{latency} ms</span>}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => connect()} title="Reconnect">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Upload file">
          <Upload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDownload} title="Download file">
          <Download className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>
      <div ref={containerRef} className="flex-1 w-full overflow-hidden" />
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive border-t px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => connect()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

// -- tab manager -------------------------------------------------------------

export function TerminalTab({ gatewayId }: { gatewayId: string }) {
  const { theme } = useTheme();
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: newSessionId(), sessionId: newSessionId(), title: 'Session 1', status: 'connecting' },
  ]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id);
  const [height, setHeight] = useState(500);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await api.get(`/gateways/${gatewayId}/agent-status`);
        if (alive) setAgentOnline(!!data?.connected);
      } catch {
        if (alive) setAgentOnline(null);
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [gatewayId]);

  const addTab = () => {
    setTabs((prev) => {
      const next: Tab[] = [
        ...prev,
        {
          id: newSessionId(),
          sessionId: newSessionId(),
          title: `Session ${prev.length + 1}`,
          status: 'connecting',
        },
      ];
      setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId && next.length) setActiveId(next[next.length - 1].id);
      if (!next.length) {
        const fresh: Tab = {
          id: newSessionId(),
          sessionId: newSessionId(),
          title: 'Session 1',
          status: 'connecting',
        };
        setActiveId(fresh.id);
        return [fresh];
      }
      return next;
    });
  };

  const updateStatus = (id: string, status: TabStatus, error?: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, error } : t)));
  };

  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  const onResizeDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startY = e.clientY;
    const startH = height;
    const move = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      setHeight(Math.max(200, Math.min(900, startH + (ev.clientY - startY))));
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" />
            Remote Terminal
          </CardTitle>
          <div className="flex items-center gap-2">
            {agentOnline === true ? (
              <Badge variant="success" className="gap-1">
                <Wifi className="h-3 w-3" />
                Agent online
              </Badge>
            ) : agentOnline === false ? (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="h-3 w-3" />
                Agent offline
              </Badge>
            ) : (
              <Badge variant="secondary">Agent ?</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* tab bar */}
        <div className="flex items-center gap-1 border-b px-2 py-1 bg-muted/30">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`flex items-center gap-2 rounded px-3 py-1 text-sm cursor-pointer ${
                t.id === activeId ? 'bg-background shadow-sm' : 'hover:bg-background/60'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  t.status === 'connected'
                    ? 'bg-green-500'
                    : t.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                }`}
              />
              {t.title}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addTab} className="ml-1 text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* panes */}
        {tabs.map((t) => (
          <div key={t.id} style={{ display: t.id === activeId ? 'flex' : 'none' }} className="flex-col">
            <TerminalPane
              gatewayId={gatewayId}
              sessionId={t.sessionId}
              height={height}
              theme={theme}
              onStatusChange={(s, e) => updateStatus(t.id, s, e)}
            />
          </div>
        ))}

        {/* resize handle */}
        <div
          onMouseDown={onResizeDrag}
          className="h-1.5 cursor-row-resize bg-border hover:bg-primary/50 transition-colors"
          title="Drag to resize"
        />
      </CardContent>
    </Card>
  );
}
