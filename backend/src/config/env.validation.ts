import { Logger } from '@nestjs/common';

/**
 * Fail-fast environment validation.
 *
 * Runs during application bootstrap (via ConfigModule `validate`). If a required
 * variable is missing — or a conditionally-required one (e.g. R2 credentials when
 * firmware storage is enabled) — the process throws before the app starts.
 */

interface EnvRule {
  key: string;
  /** Whether the variable is always required. */
  required?: boolean;
  /** Validate the (present) value; return an error string when invalid. */
  validate?: (value: string) => string | null;
}

const REQUIRED_RULES: EnvRule[] = [
  { key: 'DATABASE_URL', required: true },
  {
    key: 'JWT_SECRET',
    required: true,
    validate: (v) => (v.length < 32 ? 'must be at least 32 characters' : null),
  },
  { key: 'MQTT_HOST', required: true },
  {
    key: 'TERMINAL_SIGNING_PEPPER',
    required: true,
    validate: (v) => (v.length < 16 ? 'must be at least 16 characters' : null),
  },
];

// Variables that must be present together when the "leader" var is set.
const CONDITIONAL_GROUPS: { when: string; requires: string[]; label: string }[] = [
  {
    when: 'R2_BUCKET',
    requires: ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
    label: 'Cloudflare R2 firmware storage',
  },
  {
    when: 'MQTT_TLS_ENABLED',
    requires: [],
    label: 'MQTT TLS',
  },
];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const logger = new Logger('EnvValidation');
  const errors: string[] = [];

  for (const rule of REQUIRED_RULES) {
    const value = config[rule.key] as string | undefined;
    if (rule.required && (value === undefined || value === '')) {
      errors.push(`Missing required environment variable: ${rule.key}`);
      continue;
    }
    if (value && rule.validate) {
      const problem = rule.validate(value);
      if (problem) errors.push(`Invalid ${rule.key}: ${problem}`);
    }
  }

  for (const group of CONDITIONAL_GROUPS) {
    const leader = config[group.when] as string | undefined;
    const enabled =
      leader !== undefined &&
      leader !== '' &&
      !['0', 'false', 'no', 'off'].includes(String(leader).toLowerCase());
    if (enabled) {
      for (const dep of group.requires) {
        const depVal = config[dep] as string | undefined;
        if (depVal === undefined || depVal === '') {
          errors.push(`${group.label} enabled but missing: ${dep}`);
        }
      }
    }
  }

  // TLS file requirement when MQTT_TLS_ENABLED and using mqtts/wss with a CA.
  const tlsEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(config['MQTT_TLS_ENABLED'] || '').toLowerCase(),
  );
  if (tlsEnabled && config['MQTT_CERT_FILE'] && !config['MQTT_KEY_FILE']) {
    errors.push('MQTT_CERT_FILE provided but MQTT_KEY_FILE is missing');
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:');
    for (const e of errors) logger.error(`  - ${e}`);
    throw new Error(
      `Environment validation failed with ${errors.length} error(s). See logs above.`,
    );
  }

  return config;
}
