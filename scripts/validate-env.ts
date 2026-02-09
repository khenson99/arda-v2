/**
 * Arda V2 — Environment Variable Validator
 *
 * Validates that all required environment variables are set and correctly formatted.
 * Run with: npx tsx scripts/validate-env.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file manually (without modifying process.env via dotenv)
function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

// ─── Variable Definitions ─────────────────────────────────────────────

interface EnvVarDef {
  name: string;
  required: boolean;
  default?: string;
  description: string;
  validate?: (value: string) => string | null; // Returns error message or null
}

function isUrl(value: string): string | null {
  try {
    new URL(value);
    return null;
  } catch {
    return `Invalid URL: "${value}"`;
  }
}

function isEmail(value: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `Invalid email: "${value}"`;
  }
  return null;
}

function minLength(min: number) {
  return (value: string): string | null => {
    if (value.length < min) {
      return `Must be at least ${min} characters (got ${value.length})`;
    }
    return null;
  };
}

function isPositiveInt(value: string): string | null {
  const num = parseInt(value, 10);
  if (isNaN(num) || num <= 0) {
    return `Must be a positive integer: "${value}"`;
  }
  return null;
}

function isEnum(...values: string[]) {
  return (value: string): string | null => {
    if (!values.includes(value)) {
      return `Must be one of: ${values.join(', ')} (got "${value}")`;
    }
    return null;
  };
}

const ENV_VARS: EnvVarDef[] = [
  // Database
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection URL', validate: isUrl },

  // Redis
  { name: 'REDIS_URL', required: false, default: 'redis://localhost:6379', description: 'Redis connection URL', validate: isUrl },

  // Elasticsearch
  { name: 'ELASTICSEARCH_URL', required: false, default: 'http://localhost:9200', description: 'Elasticsearch connection URL', validate: isUrl },

  // JWT
  { name: 'JWT_SECRET', required: true, description: 'JWT signing secret (min 32 chars)', validate: minLength(32) },
  { name: 'JWT_REFRESH_SECRET', required: true, description: 'JWT refresh token secret (min 32 chars)', validate: minLength(32) },
  { name: 'JWT_EXPIRY', required: false, default: '15m', description: 'Access token lifetime' },
  { name: 'JWT_REFRESH_EXPIRY', required: false, default: '7d', description: 'Refresh token lifetime' },

  // Google OAuth
  { name: 'GOOGLE_CLIENT_ID', required: false, description: 'Google OAuth client ID' },
  { name: 'GOOGLE_CLIENT_SECRET', required: false, description: 'Google OAuth client secret' },
  { name: 'GOOGLE_CALLBACK_URL', required: false, description: 'Google OAuth callback URL', validate: isUrl },

  // Stripe
  { name: 'STRIPE_SECRET_KEY', required: false, description: 'Stripe API secret key' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Stripe webhook signing secret' },
  { name: 'STRIPE_PUBLISHABLE_KEY', required: false, description: 'Stripe publishable key' },

  // Email
  { name: 'SMTP_HOST', required: false, default: 'localhost', description: 'SMTP server hostname' },
  { name: 'SMTP_PORT', required: false, default: '1025', description: 'SMTP server port', validate: isPositiveInt },
  { name: 'SMTP_USER', required: false, default: '', description: 'SMTP username' },
  { name: 'SMTP_PASS', required: false, default: '', description: 'SMTP password' },
  { name: 'EMAIL_FROM', required: false, default: 'noreply@arda.cards', description: 'Default sender address', validate: isEmail },

  // Application
  { name: 'NODE_ENV', required: false, default: 'development', description: 'Environment', validate: isEnum('development', 'production', 'test') },
  { name: 'APP_URL', required: false, default: 'http://localhost:5173', description: 'Frontend URL', validate: isUrl },
  { name: 'SERVICE_HOST', required: false, default: 'localhost', description: 'Host for inter-service communication' },
  { name: 'API_GATEWAY_PORT', required: false, default: '3000', description: 'API gateway port', validate: isPositiveInt },
  { name: 'AUTH_SERVICE_PORT', required: false, default: '3001', description: 'Auth service port', validate: isPositiveInt },
  { name: 'CATALOG_SERVICE_PORT', required: false, default: '3002', description: 'Catalog service port', validate: isPositiveInt },
  { name: 'KANBAN_SERVICE_PORT', required: false, default: '3003', description: 'Kanban service port', validate: isPositiveInt },
  { name: 'ORDERS_SERVICE_PORT', required: false, default: '3004', description: 'Orders service port', validate: isPositiveInt },
  { name: 'NOTIFICATIONS_SERVICE_PORT', required: false, default: '3005', description: 'Notifications service port', validate: isPositiveInt },
  { name: 'PORT', required: false, description: 'Railway dynamic port override', validate: isPositiveInt },

  // Service URL overrides
  { name: 'AUTH_SERVICE_URL', required: false, description: 'Direct auth service URL', validate: isUrl },
  { name: 'CATALOG_SERVICE_URL', required: false, description: 'Direct catalog service URL', validate: isUrl },
  { name: 'KANBAN_SERVICE_URL', required: false, description: 'Direct kanban service URL', validate: isUrl },
  { name: 'ORDERS_SERVICE_URL', required: false, description: 'Direct orders service URL', validate: isUrl },
  { name: 'NOTIFICATIONS_SERVICE_URL', required: false, description: 'Direct notifications service URL', validate: isUrl },

  // Orders Queue Risk Scheduler
  { name: 'ORDERS_QUEUE_RISK_SCAN_ENABLED', required: false, default: 'true', description: 'Enable risk scanning', validate: isEnum('true', 'false') },
  { name: 'ORDERS_QUEUE_RISK_SCAN_INTERVAL_MINUTES', required: false, default: '15', description: 'Scan interval in minutes', validate: isPositiveInt },
  { name: 'ORDERS_QUEUE_RISK_LOOKBACK_DAYS', required: false, default: '30', description: 'Days to look back (7-90)', validate: isPositiveInt },
  { name: 'ORDERS_QUEUE_RISK_MIN_LEVEL', required: false, default: 'medium', description: 'Minimum risk level', validate: isEnum('medium', 'high') },
  { name: 'ORDERS_QUEUE_RISK_SCAN_LIMIT', required: false, default: '100', description: 'Max records per scan', validate: isPositiveInt },

  // AWS
  { name: 'AWS_REGION', required: false, default: 'us-east-1', description: 'AWS region' },
  { name: 'AWS_S3_BUCKET', required: false, default: 'arda-v2-dev', description: 'S3 bucket name' },
  { name: 'AWS_ACCESS_KEY_ID', required: false, description: 'AWS access key ID' },
  { name: 'AWS_SECRET_ACCESS_KEY', required: false, description: 'AWS secret access key' },
];

// ─── Validation ──────────────────────────────────────────────────────

const rootDir = resolve(__dirname, '..');
const envPath = resolve(rootDir, '.env');
const envVars = loadEnvFile(envPath);

// Merge with process.env (process.env takes precedence)
const effectiveEnv: Record<string, string | undefined> = { ...envVars };
for (const key of Object.keys(process.env)) {
  if (process.env[key] !== undefined) {
    effectiveEnv[key] = process.env[key];
  }
}

let hasErrors = false;
let hasWarnings = false;
const errors: string[] = [];
const warnings: string[] = [];

console.log('');
console.log('Arda V2 — Environment Variable Validation');
console.log('==========================================');
console.log('');

for (const def of ENV_VARS) {
  const value = effectiveEnv[def.name];
  const hasValue = value !== undefined && value !== '';

  if (def.required && !hasValue) {
    errors.push(`MISSING: ${def.name} — ${def.description}`);
    hasErrors = true;
    continue;
  }

  if (!hasValue) {
    // Optional and not set — fine
    continue;
  }

  // Validate format if a validator is provided
  if (def.validate && hasValue) {
    const validationError = def.validate(value!);
    if (validationError) {
      errors.push(`INVALID: ${def.name} — ${validationError}`);
      hasErrors = true;
    }
  }
}

// Check for dev defaults in production
if (effectiveEnv['NODE_ENV'] === 'production') {
  const devDefaults: Record<string, string> = {
    JWT_SECRET: 'change-me-in-production-use-a-64-char-random-string',
    JWT_REFRESH_SECRET: 'change-me-too-different-from-above',
  };

  for (const [key, devValue] of Object.entries(devDefaults)) {
    if (effectiveEnv[key] === devValue) {
      warnings.push(`WARNING: ${key} is still set to the dev default value in production!`);
      hasWarnings = true;
    }
  }

  if (effectiveEnv['DATABASE_URL']?.includes('arda_dev_password')) {
    warnings.push('WARNING: DATABASE_URL contains dev password in production!');
    hasWarnings = true;
  }
}

// ─── Output Results ──────────────────────────────────────────────────

if (errors.length > 0) {
  console.log('ERRORS:');
  for (const err of errors) {
    console.log(`  [x] ${err}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('WARNINGS:');
  for (const w of warnings) {
    console.log(`  [!] ${w}`);
  }
  console.log('');
}

if (!hasErrors && !hasWarnings) {
  console.log('All environment variables are valid.');
  console.log('');
}

const requiredCount = ENV_VARS.filter((v) => v.required).length;
const optionalCount = ENV_VARS.filter((v) => !v.required).length;
const setCount = ENV_VARS.filter((v) => {
  const val = effectiveEnv[v.name];
  return val !== undefined && val !== '';
}).length;

console.log(`Summary: ${setCount}/${ENV_VARS.length} variables set (${requiredCount} required, ${optionalCount} optional)`);
console.log('');

if (hasErrors) {
  process.exit(1);
}
