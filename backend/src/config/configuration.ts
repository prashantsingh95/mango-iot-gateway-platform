const parseBool = (v: string | undefined, fallback = false): boolean => {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || '3001'}`,
  logLevel: process.env.LOG_LEVEL || 'info',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    // Support both JWT_EXPIRES (new) and JWT_EXPIRATION (legacy)
    expiration: process.env.JWT_EXPIRES || process.env.JWT_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRES || process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  mqtt: {
    // External MQTT broker — all settings come from env. No broker is bundled.
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT || '1883', 10),
    protocol: (process.env.MQTT_PROTOCOL || 'mqtt') as 'mqtt' | 'mqtts' | 'ws' | 'wss',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID,
    // Legacy full-URL override (optional, takes precedence when provided)
    brokerUrl: process.env.MQTT_BROKER_URL,
    tls: {
      enabled: parseBool(process.env.MQTT_TLS_ENABLED),
      caFile: process.env.MQTT_CA_FILE,
      certFile: process.env.MQTT_CERT_FILE,
      keyFile: process.env.MQTT_KEY_FILE,
      rejectUnauthorized: parseBool(process.env.MQTT_TLS_REJECT_UNAUTHORIZED, true),
    },
  },

  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    workerUrl: process.env.WORKER_URL,
    pagesUrl: process.env.PAGES_URL,
  },

  r2: {
    bucket: process.env.R2_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    publicUrl: process.env.R2_PUBLIC_URL,
    region: process.env.R2_REGION || 'auto',
  },

  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY,
    secretKey: process.env.TURNSTILE_SECRET_KEY,
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    // Support SMTP_PASSWORD (new) and SMTP_PASS (legacy)
    pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()),
  },

  ota: {
    signedUrlExpiry: parseInt(process.env.OTA_SIGNED_URL_EXPIRY || '3600', 10),
  },

  cookies: {
    secure: parseBool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    domain: process.env.COOKIE_DOMAIN,
  },

  metrics: {
    enabled: parseBool(process.env.METRICS_ENABLED),
  },

  terminal: {
    // HMAC pepper used to derive per-gateway message signing keys (required).
    signingPepper: process.env.TERMINAL_SIGNING_PEPPER,
    // Public WS URL advertised to gateway agents (defaults derived at runtime).
    backendWsUrl: process.env.BACKEND_WS_URL,
    // Keep-alive / liveness tuning.
    heartbeatIntervalMs: parseInt(process.env.TERMINAL_HEARTBEAT_MS || '30000', 10),
    heartbeatTimeoutMs: parseInt(process.env.TERMINAL_HEARTBEAT_TIMEOUT_MS || '90000', 10),
    idleTimeoutMin: parseInt(process.env.TERMINAL_IDLE_TIMEOUT_MIN || '240', 10),
  },
});
