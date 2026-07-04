'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Terminal as TerminalIcon, Wifi, WifiOff } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function TerminalTab({ gatewayId }: { gatewayId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [sshUser, setSshUser] = useState('prashant');
  const [sshPass, setSshPass] = useState('Dev_Prashant65');
  const [sshPort, setSshPort] = useState('22');

  const connectTerminal = (username: string, password: string, port: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setShowLogin(false);
    setError(null);

    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }

    const term = xtermRef.current;
    if (term) {
      term.reset();
    }

    const socket: Socket = io(`${WS_URL}/terminal`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('open', {
        gatewayId,
        rows: xtermRef.current?.rows || 24,
        cols: xtermRef.current?.cols || 80,
        sshUsername: username,
        sshPassword: password,
        sshPort: parseInt(port, 10) || 22,
      });
      xtermRef.current?.focus();
    });

    socket.on('connected', () => {
      setConnected(true);
      setError(null);
    });

    socket.on('output', (data: { data: string }) => {
      xtermRef.current?.write(typeof data.data === 'string'
        ? atob(data.data)
        : new Uint8Array(atob(data.data).split('').map((c) => c.charCodeAt(0))));
    });

    socket.on('error', (data: { message: string }) => {
      setError(data.message);
      setConnected(false);
      xtermRef.current?.write(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
    });

    socket.on('closed', () => {
      setConnected(false);
      setShowLogin(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setShowLogin(true);
    });

    if (xtermRef.current) {
      xtermRef.current.onData((data: string) => {
        if (socket.connected) {
          socket.emit('input', { data: btoa(data) });
        }
      });

      xtermRef.current.onResize(({ rows, cols }) => {
        if (socket.connected) {
          socket.emit('resize', { rows, cols });
        }
      });
    }
  };

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    if (terminalRef.current) {
      term.open(terminalRef.current);
      setTimeout(() => fitAddon.fit(), 50);
    }

    xtermRef.current = term;

    const resizeHandler = () => {
      try { fitAddon.fit(); } catch {}
    };
    window.addEventListener('resize', resizeHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      socketRef.current?.disconnect();
      term.dispose();
    };
  }, []);

  const handleReconnect = () => {
    setShowLogin(true);
  };

  if (showLogin) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              SSH Terminal
            </CardTitle>
            <Badge variant="secondary" className="gap-1">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </Badge>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive mt-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">SSH Username</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="pi"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">SSH Password</label>
              <input
                type="password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sshPass}
                onChange={(e) => setSshPass(e.target.value)}
                placeholder="password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">SSH Port</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="22"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button onClick={() => connectTerminal(sshUser, sshPass, sshPort)}>
            <TerminalIcon className="mr-2 h-4 w-4" />
            Connect
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" />
            SSH Terminal
          </CardTitle>
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge variant="success" className="gap-1">
                <Wifi className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleReconnect} disabled={connected}>
              <Wifi className="mr-2 h-4 w-4" />
              Reconnect
            </Button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive mt-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={terminalRef}
          className="w-full"
          style={{ height: '500px' }}
        />
      </CardContent>
    </Card>
  );
}
