#!/usr/bin/env node
/**
 * Mango IoT Gateway Agent
 *
 * Runs ON the gateway (or any host on the gateway's LAN). It makes a single
 * persistent OUTBOUND TLS WebSocket connection to the Mango backend. The
 * backend never connects to the gateway — this is what makes the system work
 * behind NAT / CGNAT / firewalls / cellular with no inbound ports.
 *
 * Responsibilities:
 *   - Authenticate with the gateway id + secret.
 *   - Keep the connection alive (30s heartbeat, exponential-backoff reconnect).
 *   - Spawn PTYs and proxy terminal I/O to the browser via the backend.
 *   - Upload / download files (SCP-like) over the same channel.
 *
 * Env (required):  GATEWAY_ID, GATEWAY_SECRET, BACKEND_WS_URL, SIGNING_PEPPER
 * Env (optional):  HEARTBEAT_MS, RECONNECT_BASE_MS, SHELL, LOG_LEVEL
 */
import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as os from 'os';
import {
  TerminalMessage,
  TerminalMessageType,
  PROTOCOL_VERSION,
  hashAgentSecret,
  deriveSigningKey,
  signMessage,
  verifyMessage,
} from './protocol';

const GATEWAY_ID = requireEnv('GATEWAY_ID');
const GATEWAY_SECRET = requireEnv('GATEWAY_SECRET');
const BACKEND_WS_URL = requireEnv('BACKEND_WS_URL');
const SIGNING_PEPPER = requireEnv('SIGNING_PEPPER');

const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || '30000', 10);
const RECONNECT_BASE_MS = parseInt(process.env.RECONNECT_BASE_MS || '1000', 10);
const SHELL = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const secretHash = hashAgentSecret(GATEWAY_SECRET);
const signingKey = deriveSigningKey(secretHash, SIGNING_PEPPER);

let seq = 0;
const sessions = new Map<string, PtySession>();
const uploads = new Map<string, UploadState>();

let ptyModule: any = null;
try {
  ptyModule = require('node-pty');
} catch (err: any) {
  log('warn', `node-pty unavailable: terminal sessions will be disabled (${err.message})`);
}

let socket: Socket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let connected = false;
let lastBackendSeq = 0;

interface PtySession {
  pty: any;
  shell: string;
}

interface UploadState {
  fd: number;
  path: string;
  received: number;
  size?: number;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[agent] Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function log(level: string, msg: string) {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;
  const ts = new Date().toISOString();
  console.log(`${ts} [${level.toUpperCase()}] ${msg}`);
}

function build(type: TerminalMessageType, payload: any, sessionId = ''): TerminalMessage {
  const msg: TerminalMessage = {
    version: PROTOCOL_VERSION,
    type,
    tenantId: '',
    gatewayId: GATEWAY_ID,
    sessionId,
    timestamp: Date.now(),
    sequenceNumber: ++seq,
    payload,
  };
  msg.signature = signMessage(msg, signingKey);
  return msg;
}

function send(type: TerminalMessageType, payload: any, sessionId = '') {
  if (!connected || !socket) return;
  socket.emit('message', build(type, payload, sessionId));
}

function connect() {
  log('info', `Connecting to ${BACKEND_WS_URL} as gateway ${GATEWAY_ID}`);
  socket = io(`${BACKEND_WS_URL}/agent`, {
    auth: { gatewayId: GATEWAY_ID, secret: GATEWAY_SECRET },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_BASE_MS,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
  });

  socket.on('connect', () => {
    connected = true;
    log('info', 'Connected to backend');
    send(TerminalMessageType.AGENT_HELLO, {
      agentVersion: require('../package.json').version,
      capabilities: ptyModule ? ['terminal', 'file-transfer'] : ['file-transfer'],
      os: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
    });
    startHeartbeat();
  });

  socket.on('ready', () => log('info', 'Backend accepted agent connection'));

  socket.on('disconnect', (reason: string) => {
    connected = false;
    stopHeartbeat();
    teardownAll();
    log('warn', `Disconnected (${reason}); will reconnect`);
  });

  socket.on('connect_error', (err: any) => {
    log('warn', `Connection error: ${err.message}`);
  });

  socket.on('error', (data: any) => {
    log('error', `Backend error: ${data?.message || JSON.stringify(data)}`);
  });

  socket.on('message', (raw: TerminalMessage) => onBackendMessage(raw));
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    send(TerminalMessageType.HEARTBEAT, { ts: Date.now() });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function onBackendMessage(msg: TerminalMessage) {
  if (!verifyMessage(msg, signingKey)) {
    log('warn', `Dropping unsigned/forged message (type ${msg.type})`);
    return;
  }
  if (msg.sequenceNumber <= lastBackendSeq) {
    log('warn', `Dropping replayed backend message (seq ${msg.sequenceNumber})`);
    return;
  }
  lastBackendSeq = msg.sequenceNumber;

  switch (msg.type) {
    case TerminalMessageType.HEARTBEAT_ACK: {
      const echo = msg.payload?.echo;
      if (typeof echo === 'number') {
        const latency = Date.now() - echo;
        log('debug', `Heartbeat RTT ${latency}ms`);
      }
      break;
    }
    case TerminalMessageType.SESSION_START:
      handleSessionStart(msg);
      break;
    case TerminalMessageType.SESSION_DATA:
      handleSessionData(msg);
      break;
    case TerminalMessageType.SESSION_RESIZE:
      handleSessionResize(msg);
      break;
    case TerminalMessageType.SESSION_END:
      handleSessionEnd(msg);
      break;
    case TerminalMessageType.FILE_TRANSFER_INIT:
      handleFileInit(msg);
      break;
    case TerminalMessageType.FILE_TRANSFER_DATA:
      handleFileData(msg);
      break;
    case TerminalMessageType.FILE_TRANSFER_END:
      handleFileEnd(msg);
      break;
    default:
      log('debug', `Ignoring message type ${msg.type}`);
  }
}

function handleSessionStart(msg: TerminalMessage) {
  const { sessionId } = msg;
  const payload = msg.payload || {};
  const existing = sessions.get(sessionId);
  if (existing) {
    log('debug', `Re-attaching existing session ${sessionId}`);
    send(TerminalMessageType.SESSION_READY, { resumed: true }, sessionId);
    return;
  }
  if (!ptyModule) {
    send(TerminalMessageType.ERROR, { message: 'node-pty not available on this agent' }, sessionId);
    return;
  }
  try {
    const shell = payload.shell || SHELL;
    const cols = payload.cols || 80;
    const rows = payload.rows || 24;
    const pty = ptyModule.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || undefined,
      env: { ...process.env, ...(payload.env || {}) },
    });
    sessions.set(sessionId, { pty, shell });
    pty.onData((data: string) => {
      send(
        TerminalMessageType.SESSION_OUTPUT,
        { data: Buffer.from(data, 'utf8').toString('base64') },
        sessionId,
      );
    });
    pty.onExit(() => {
      send(TerminalMessageType.SESSION_END, { reason: 'process exited' }, sessionId);
      sessions.delete(sessionId);
    });
    send(TerminalMessageType.SESSION_READY, { shell }, sessionId);
    log('info', `Spawned PTY (${shell}) for session ${sessionId}`);
  } catch (err: any) {
    send(TerminalMessageType.ERROR, { message: err.message }, sessionId);
  }
}

function handleSessionData(msg: TerminalMessage) {
  const session = sessions.get(msg.sessionId);
  if (session && msg.payload?.data) {
    const buf = Buffer.from(msg.payload.data, 'base64');
    session.pty.write(buf.toString('binary'));
  }
}

function handleSessionResize(msg: TerminalMessage) {
  const session = sessions.get(msg.sessionId);
  if (session && msg.payload?.cols && msg.payload?.rows) {
    try {
      session.pty.resize(msg.payload.cols, msg.payload.rows);
    } catch {}
  }
}

function handleSessionEnd(msg: TerminalMessage) {
  const session = sessions.get(msg.sessionId);
  if (session) {
    try {
      session.pty.kill();
    } catch {}
    sessions.delete(msg.sessionId);
    log('info', `Closed session ${msg.sessionId}`);
  }
}

// -- file transfer -----------------------------------------------------------

function handleFileInit(msg: TerminalMessage) {
  const payload = msg.payload || {};
  const direction: string = payload.direction || 'upload';
  const filePath: string = payload.path;
  if (direction === 'upload') {
    try {
      const fd = fs.openSync(filePath, 'w');
      uploads.set(msg.sessionId, { fd, path: filePath, received: 0, size: payload.size });
      send(TerminalMessageType.FILE_TRANSFER_STATUS, { status: 'ready', path: filePath }, msg.sessionId);
    } catch (err: any) {
      send(TerminalMessageType.ERROR, { message: `open failed: ${err.message}` }, msg.sessionId);
    }
  } else {
    // download: stream file back to the browser
    try {
      if (!fs.existsSync(filePath)) {
        send(TerminalMessageType.ERROR, { message: `file not found: ${filePath}` }, msg.sessionId);
        return;
      }
      const stat = fs.statSync(filePath);
      send(TerminalMessageType.FILE_TRANSFER_INIT, { direction: 'download', path: filePath, size: stat.size, mode: stat.mode }, msg.sessionId);
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: string | Buffer) => {
        send(TerminalMessageType.FILE_TRANSFER_DATA, { data: chunk.toString('base64') }, msg.sessionId);
      });
      stream.on('end', () => {
        send(TerminalMessageType.FILE_TRANSFER_END, { status: 'done' }, msg.sessionId);
      });
      stream.on('error', (err: any) => {
        send(TerminalMessageType.ERROR, { message: err.message }, msg.sessionId);
      });
    } catch (err: any) {
      send(TerminalMessageType.ERROR, { message: err.message }, msg.sessionId);
    }
  }
}

function handleFileData(msg: TerminalMessage) {
  const state = uploads.get(msg.sessionId);
  if (!state || !msg.payload?.data) return;
  const buf = Buffer.from(msg.payload.data, 'base64');
  fs.writeSync(state.fd, buf);
  state.received += buf.length;
}

function handleFileEnd(msg: TerminalMessage) {
  const state = uploads.get(msg.sessionId);
  if (state) {
    fs.closeSync(state.fd);
    uploads.delete(msg.sessionId);
    send(TerminalMessageType.FILE_TRANSFER_STATUS, { status: 'done', path: state.path, received: state.received }, msg.sessionId);
    log('info', `Upload complete: ${state.path} (${state.received} bytes)`);
  }
}

function teardownAll() {
  for (const [, s] of sessions) {
    try {
      s.pty.kill();
    } catch {}
  }
  sessions.clear();
  for (const [, u] of uploads) {
    try {
      fs.closeSync(u.fd);
    } catch {}
  }
  uploads.clear();
}

process.on('SIGINT', () => {
  log('info', 'Shutting down');
  teardownAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('info', 'Shutting down');
  teardownAll();
  process.exit(0);
});

connect();
