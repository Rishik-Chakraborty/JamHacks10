"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
/**
 * Validated environment config. Import `env` everywhere instead of reading
 * `process.env` directly. Fails fast at boot if required vars are missing.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const schema = zod_1.z.object({
    MONGODB_URI: zod_1.z.string().min(1, 'MONGODB_URI is required'),
    OPENAI_API_KEY: zod_1.z.string().default(''),
    OPENAI_VISION_MODEL: zod_1.z.string().default('gpt-5'),
    OPENAI_COMMENTARY_MODEL: zod_1.z.string().default('gpt-4o'),
    SOLANA_RPC_URL: zod_1.z.string().default('https://api.devnet.solana.com'),
    PROGRAM_ID: zod_1.z.string().default(''),
    AUTHORITY_SECRET_KEY: zod_1.z.string().default(''),
    PORT: zod_1.z.coerce.number().default(5000),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:3000'),
    VULTR_VISION_URL: zod_1.z.string().default(''),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    /** Feature flag: only do on-chain work once a program id is configured. */
    solanaEnabled: parsed.data.PROGRAM_ID.length > 0 && parsed.data.AUTHORITY_SECRET_KEY.length > 0,
    /** Feature flag: AI oracle available. */
    aiEnabled: parsed.data.OPENAI_API_KEY.length > 0,
};
