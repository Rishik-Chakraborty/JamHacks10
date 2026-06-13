/**
 * Validated environment config. Import `env` everywhere instead of reading
 * `process.env` directly. Fails fast at boot if required vars are missing.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_VISION_MODEL: z.string().default('gpt-5'),
  OPENAI_COMMENTARY_MODEL: z.string().default('gpt-4o'),
  SOLANA_RPC_URL: z.string().default('https://api.devnet.solana.com'),
  PROGRAM_ID: z.string().default(''),
  AUTHORITY_SECRET_KEY: z.string().default(''),
  PORT: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  VULTR_VISION_URL: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  /** Feature flag: only do on-chain work once a program id is configured. */
  solanaEnabled: parsed.data.PROGRAM_ID.length > 0 && parsed.data.AUTHORITY_SECRET_KEY.length > 0,
  /** Feature flag: AI oracle available. */
  aiEnabled: parsed.data.OPENAI_API_KEY.length > 0,
};

export type Env = typeof env;
