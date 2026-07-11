/**
 * Wire protocol shared with the backend (mirrors backend/src/terminal/protocol.ts).
 *
 * Every message the agent sends is signed with an HMAC key derived from the
 * gateway secret hash and the shared signing pepper. The backend verifies the
 * signature, so a man-in-the-middle cannot forge agent messages even over TLS.
 */
import { createHash, createHmac } from 'crypto';

export enum TerminalMessageType {
  AGENT_HELLO = 'AGENT_HELLO',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  SESSION_START = 'SESSION_START',
  SESSION_READY = 'SESSION_READY',
  SESSION_RESIZE = 'SESSION_RESIZE',
  SESSION_END = 'SESSION_END',
  SESSION_DATA = 'SESSION_DATA',
  SESSION_OUTPUT = 'SESSION_OUTPUT',
  SESSION_STATUS = 'SESSION_STATUS',
  FILE_TRANSFER_INIT = 'FILE_TRANSFER_INIT',
  FILE_TRANSFER_DATA = 'FILE_TRANSFER_DATA',
  FILE_TRANSFER_END = 'FILE_TRANSFER_END',
  FILE_TRANSFER_STATUS = 'FILE_TRANSFER_STATUS',
  ERROR = 'ERROR',
}

export interface TerminalMessage {
  version: number;
  type: TerminalMessageType;
  tenantId: string;
  gatewayId: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
  sequenceNumber: number;
  payload?: any;
  signature?: string;
}

export const PROTOCOL_VERSION = 1;

export function hashAgentSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function deriveSigningKey(secretHash: string, pepper: string): Buffer {
  return createHmac('sha256', pepper).update(secretHash).digest();
}

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
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function canonical(message: TerminalMessage): string {
  const { signature: _sig, ...rest } = message;
  return stableStringify(rest);
}

export function signMessage(message: TerminalMessage, key: Buffer): string {
  return createHmac('sha256', key).update(canonical(message)).digest('hex');
}

export function verifyMessage(message: TerminalMessage, key: Buffer): boolean {
  if (!message.signature) return false;
  const expected = createHmac('sha256', key).update(canonical(message)).digest();
  const got = Buffer.from(message.signature, 'hex');
  return expected.length === got.length && expected.equals(got);
}
