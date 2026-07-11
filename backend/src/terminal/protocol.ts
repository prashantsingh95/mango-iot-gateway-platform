import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Reverse-connection remote terminal wire protocol.
 *
 * Every message exchanged between the Gateway Agent and the backend travels
 * inside a signed envelope. The browser never speaks this protocol directly;
 * the backend translates between the browser (JWT-authenticated Socket.IO on
 * the `/terminal` namespace) and the agent (TLS + secret-authenticated
 * Socket.IO on the `/agent` namespace).
 *
 * The backend NEVER initiates a connection to the gateway and NEVER runs SSH.
 * The gateway agent owns the PTY, file transfers and keep-alive.
 */

export const TERMINAL_PROTOCOL_VERSION = 1;

export enum TerminalMessageType {
  // agent <-> backend handshake / keep-alive
  AGENT_HELLO = 'AGENT_HELLO',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',

  // session lifecycle (browser -> agent via backend)
  SESSION_START = 'SESSION_START',
  SESSION_READY = 'SESSION_READY',
  SESSION_RESIZE = 'SESSION_RESIZE',
  SESSION_END = 'SESSION_END',

  // data plane
  SESSION_DATA = 'SESSION_DATA', // stdin browser -> agent
  SESSION_OUTPUT = 'SESSION_OUTPUT', // stdout/stderr agent -> browser

  // file transfer
  FILE_TRANSFER_INIT = 'FILE_TRANSFER_INIT',
  FILE_TRANSFER_DATA = 'FILE_TRANSFER_DATA',
  FILE_TRANSFER_END = 'FILE_TRANSFER_END',
  FILE_TRANSFER_STATUS = 'FILE_TRANSFER_STATUS',

  // status / errors
  SESSION_STATUS = 'SESSION_STATUS',
  ERROR = 'ERROR',
}

export type TerminalPayload = Record<string, any> | null;

export interface TerminalMessage {
  /** Protocol version */
  version: number;
  /** Message kind */
  type: TerminalMessageType;
  tenantId: string;
  gatewayId: string;
  sessionId: string;
  userId?: string;
  /** Epoch milliseconds */
  timestamp: number;
  /** Monotonic per-session sequence number (replay protection / ordering) */
  sequenceNumber: number;
  payload?: TerminalPayload;
  /** HMAC signature; see signMessage / verifyMessage */
  signature?: string;
}

export interface AgentHelloPayload {
  agentVersion: string;
  capabilities: string[];
  os?: string;
  arch?: string;
  hostname?: string;
}

export interface SessionStartPayload {
  shell?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface SessionResizePayload {
  cols: number;
  rows: number;
}

export interface FileTransferInitPayload {
  direction: 'upload' | 'download';
  path: string;
  size?: number;
  mode?: number;
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/** Hash a plaintext gateway agent secret. Only the hash is persisted. */
export function hashAgentSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Derive a shared HMAC signing key from an agent secret (hash). Both the
 * backend (which stores only the hash) and the agent (which knows the
 * plaintext) can compute the same key, enabling message authentication
 * without the backend retaining the secret.
 */
export function deriveSigningKey(secretHash: string, pepper: string): Buffer {
  return createHmac('sha256', pepper).update(secretHash).digest();
}

/**
 * Deterministic, language-agnostic canonical form used for HMAC signing.
 *
 * Keys are sorted recursively so that the same logical message produces byte-
 * identical output regardless of field insertion order (and across languages
 * such as TypeScript and Go, whose default JSON encoders disagree on key
 * ordering). `undefined` values are omitted (matching `JSON.stringify`).
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
  );
}

function canonical(message: TerminalMessage): string {
  const { signature: _signature, ...rest } = message;
  return stableStringify(rest);
}

export function signMessage(message: TerminalMessage, key: Buffer): string {
  return createHmac('sha256', key).update(canonical(message)).digest('hex');
}

export function attachSignature(message: TerminalMessage, key: Buffer): TerminalMessage {
  message.signature = signMessage(message, key);
  return message;
}

export function verifyMessage(message: TerminalMessage, key: Buffer): boolean {
  if (!message.signature) return false;
  const expected = signMessage(message, key);
  const a = Buffer.from(expected);
  const b = Buffer.from(message.signature);
  if (a.length !== b.length) return false;
  return createHmac('sha256', key).update(canonical(message)).digest().equals(a) && a.equals(b);
}

/** Generate a cryptographically random gateway agent secret (64 hex chars). */
export function generateAgentSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
