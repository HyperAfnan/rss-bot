# Configuration Module

The configuration subsystem in [`src/config.ts`](file:///home/afnan/Projects/rss-bot/src/config.ts) is responsible for loading, coercing, validating, and caching environment variables required by the RSS Discord Bot. It leverages **Zod** (`zod`) for strict runtime type enforcement and fail-fast startup behavior.

---

## 📄 Source File Overview

- **Source Code**: [`src/config.ts`](file:///home/afnan/Projects/rss-bot/src/config.ts)
- **Unit Tests**: [`tests/config.test.ts`](file:///home/afnan/Projects/rss-bot/tests/config.test.ts)
- **Dependencies**: `zod`

---

## 🔍 Schema Definition & Options Catalog

The schema is defined via `configSchema` ([`src/config.ts#L3-L16`](file:///home/afnan/Projects/rss-bot/src/config.ts#L3-L16)):

```typescript
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
```

### Parameter Reference

| Variable | Type / Rules | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `"development"` \| `"production"` \| `"test"` | `"development"` | Controls logging verbosity, SSL enforcement, and development optimizations. |
| `DATABASE_URL` | `string` (min length 1) | **Required** | PostgreSQL connection string. Supports direct URI format: `postgresql://user:password@host:port/dbname`. |
| `DISCORD_TOKEN` | `string` (min length 1) | **Required** | Bot authorization token from the Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | `string` (min length 1) | **Required** | Application ID for registering Discord application slash commands. |
| `DISCORD_GUILD_ID` | `string` (optional) | `undefined` | If specified, slash commands register instantly to this single server (useful in dev). If omitted, commands register globally. |
| `PORT` | `number` (coerced int $\ge 0$) | `3000` | Port for the HTTP health server (`Bun.serve`). Render injects this via environment variable. |
| `HOST` | `string` | `"0.0.0.0"` | Network interface to bind HTTP server to. `"0.0.0.0"` allows external ingress. |
| `POLL_INTERVAL_DEFAULT_SECONDS`| `number` (coerced int $\ge 60$) | `600` (10m) | Fallback poll interval used when a user adds a feed without specifying `--interval`. |
| `POLL_INTERVAL_MIN_SECONDS` | `number` (coerced int $\ge 30$) | `60` (1m) | Absolute minimum allowed polling interval to avoid abusing remote feed origins. |
| `CONCURRENT_POLL_LIMIT` | `number` (coerced int $> 0$) | `5` | Maximum number of feeds that can be fetched in parallel during a single polling tick. |
| `FETCH_TIMEOUT_MS` | `number` (coerced int $> 0$) | `10000` (10s) | Maximum time allowed for an HTTP request to an origin feed before aborting. |
| `MAX_FEED_SIZE_MB` | `number` (coerced number $> 0$) | `15` (15MB) | Maximum allowed feed payload size. Stream aborts and rejects if exceeded. |
| `USER_AGENT` | `string` | `"RSS-Discord-Bot/1.0..."` | Custom `User-Agent` header transmitted with all feed HTTP requests. |

---

## ⚙️ Function Breakdown

### `loadConfig(env = process.env): Config`
[`src/config.ts#L20-L29`](file:///home/afnan/Projects/rss-bot/src/config.ts#L20-L29)

- **Signature**: `(env?: Record<string, string | undefined>) => Config`
- **Behavior**: Executes `configSchema.safeParse(env)`.
- **Validation Handling**: If parsing fails, aggregates every individual issue path and message into a readable multiline list:
  ```text
  Environment configuration error:
   - DATABASE_URL: DATABASE_URL is required
   - DISCORD_TOKEN: DISCORD_TOKEN is required
   - DISCORD_CLIENT_ID: DISCORD_CLIENT_ID is required
  ```
- **Error Behavior**: Throws an `Error` containing the formatted message, allowing callers (such as `src/index.ts`) to print diagnostic output and cleanly exit.

### `getConfig(): Config`
[`src/config.ts#L34-L39`](file:///home/afnan/Projects/rss-bot/src/config.ts#L34-L39)

- **Signature**: `() => Config`
- **Behavior**: Implements a lazy-loaded singleton pattern. On first invocation, reads and parses `process.env` via `loadConfig()`. Subsequent invocations return the cached `_config` object with zero parsing overhead.

---

## 🧪 Coercion & Validation Mechanics

1. **Type Coercion via `z.coerce`**:
   Environment variables are received from the OS as strings (`"3000"`, `"600"`). The schema utilizes `z.coerce.number()` to automatically cast string values to JavaScript numbers prior to validating integer and boundary constraints.
2. **Boundary Enforcement**:
   - `POLL_INTERVAL_MIN_SECONDS` enforces `.min(30)` so users cannot configure aggressive 5-second polling loops that would trigger IP bans.
   - `CONCURRENT_POLL_LIMIT` enforces `.positive()`, ensuring concurrency cannot be set to 0 or negative numbers.
