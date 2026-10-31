import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().optional(),
  PORT: z.coerce.number().int().nonnegative().default(3000),
  HOST: z.string().default("0.0.0.0"),
  POLL_INTERVAL_DEFAULT_SECONDS: z.coerce.number().int().min(60).default(600),
  POLL_INTERVAL_MIN_SECONDS: z.coerce.number().int().min(30).default(60),
  CONCURRENT_POLL_LIMIT: z.coerce.number().int().positive().default(5),
  FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MAX_FEED_SIZE_MB: z.coerce.number().positive().default(15),
  USER_AGENT: z.string().default("RSS-Discord-Bot/1.0 (+https://github.com/)"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment configuration error:\n${errorDetails}`);
  }
  return result.data;
}

// Lazy-loaded singleton or accessed via loadConfig()
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
