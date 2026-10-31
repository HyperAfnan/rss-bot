# Database Layer & Repositories

The database subsystem manages PostgreSQL connections, automated schema migration, and isolated data access patterns through repository modules. It utilizes **postgres.js** (`postgres`), a high-performance, non-ORM PostgreSQL client for Node.js and Bun.

---

## 📄 File Manifest

| File | Purpose |
| :--- | :--- |
| [`src/db/client.ts`](file:///home/afnan/Projects/rss-bot/src/db/client.ts) | Connection pool singleton, SSL negotiation, connection health, and shutdown hooks. |
| [`src/db/schema.sql`](file:///home/afnan/Projects/rss-bot/src/db/schema.sql) | DDL definition for all tables, relational constraints, and B-tree indexes. |
| [`src/db/repositories/guilds.ts`](file:///home/afnan/Projects/rss-bot/src/db/repositories/guilds.ts) | Data operations for Discord server metadata. |
| [`src/db/repositories/subscriptions.ts`](file:///home/afnan/Projects/rss-bot/src/db/repositories/subscriptions.ts) | Core subscription entity CRUD and scheduler queries. |
| [`src/db/repositories/feed-items.ts`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-items.ts) | Item tracking, deduplication checks, and baseline batch recording. |
| [`src/db/repositories/feed-state.ts`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-state.ts) | Caching headers (ETag / Last-Modified), backoff counters, and scheduling timestamps. |

---

## 🔌 Connection Client Architecture (`src/db/client.ts`)

### `getDb(): postgres.Sql`
[`src/db/client.ts#L8-L29`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L8-L29)

Initializes and caches the PostgreSQL connection pool singleton:

```typescript
sqlInstance = postgres(config.DATABASE_URL, {
  max: 10,             // Maximum 10 concurrent pool connections
  idle_timeout: 20,    // Closes idle sockets after 20 seconds
  connect_timeout: 10, // 10s connection establishment timeout
  ssl: sslOption,      // Dynamic SSL detection
  onnotice: () => {},  // Suppresses non-error server notice messages
});
```

#### Dynamic SSL Negotiation:
Hosted databases (such as **Supabase** or **Render PostgreSQL**) require TLS/SSL connections. The client inspects the connection URL:
```typescript
const isRemote = config.DATABASE_URL.includes("supabase.co") ||
                 config.DATABASE_URL.includes("render.com") ||
                 config.DATABASE_URL.includes("pooler.supabase.com");

const sslOption = isProduction || isRemote ? { rejectUnauthorized: false } : undefined;
```
If remote, SSL is enabled with `rejectUnauthorized: false` to support cloud-hosted connection poolers and managed cert bundles without manual CA file mounts.

### `checkDatabaseConnection(): Promise<boolean>`
[`src/db/client.ts#L31-L40`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L31-L40)
Executes `SELECT 1` against the database pool. Returns `true` on success, or logs the error and returns `false` on failure. Used by `/health` to report service liveness.

### `initDatabase(): Promise<void>`
[`src/db/client.ts#L42-L52`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L42-L52)
Reads the schema file [`src/db/schema.sql`](file:///home/afnan/Projects/rss-bot/src/db/schema.sql) from disk using Node's `readFileSync` and executes the raw SQL using `sql.unsafe()`. This guarantees that fresh deployments create all necessary tables and indexes automatically without external migration tooling.

### `closeDatabase(): Promise<void>`
[`src/db/client.ts#L54-L61`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L54-L61)
Invokes `sqlInstance.end({ timeout: 5 })`. Drains the connection pool, waiting up to 5 seconds for in-flight queries to finish before closing TCP sockets cleanly.

---

## 📦 Repository API Reference

### 1. Guilds Repository (`src/db/repositories/guilds.ts`)

#### `upsertGuild(id: string, name: string): Promise<Guild>`
- **Logic**: Performs an `INSERT ... ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING *`.
- **Purpose**: Ensures that the guild exists prior to inserting subscriptions, and updates server names when Discord servers are renamed.

#### `getGuild(id: string): Promise<Guild | null>`
- **Logic**: Simple `SELECT id, name, created_at FROM guilds WHERE id = ${id}`.

---

### 2. Subscriptions Repository (`src/db/repositories/subscriptions.ts`)

#### Interfaces:
```typescript
export interface Subscription {
  id: number;
  guild_id: string;
  channel_id: string;
  feed_url: string;
  thread_id: string | null;
  poll_interval_seconds: number;
  enabled: boolean;
  last_checked_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

export interface DueSubscription extends Subscription {
  etag: string | null;
  last_modified: string | null;
  last_success_at: Date | null;
  next_check_at: Date;
  consecutive_failures: number;
}
```

#### `createSubscription(params): Promise<Subscription>`
Inserts a new subscription with default `enabled = true`. Returns the created row.

#### `getSubscriptionById(id: number): Promise<Subscription | null>`
Fetches a single subscription by primary key.

#### `findSubscriptionByChannelAndUrl(channelId: string, feedUrl: string): Promise<Subscription | null>`
Used before subscription creation to check if the channel is already subscribed to that feed.

#### `listSubscriptionsByGuild(guildId: string): Promise<Subscription[]>`
Returns all subscriptions belonging to a specific guild ordered by `created_at DESC`.

#### `deleteSubscription(id: number, guildId: string): Promise<boolean>`
Deletes a subscription matching both `id` and `guild_id`. Returns `true` if a row was deleted, `false` otherwise. Scoped by `guild_id` to prevent cross-guild deletion.

#### `setSubscriptionEnabled(id: number, guildId: string, enabled: boolean): Promise<boolean>`
Toggles polling for a feed without deleting its history or baseline items.

#### `updateSubscriptionStatus(id: number, lastCheckedAt: Date, lastError: string | null): Promise<void>`
Updates timestamps and records any fetch error messages.

#### `updateSubscriptionThread(id: number, threadId: string | null): Promise<void>`
Updates the associated thread ID (e.g. after recreating a deleted thread).

#### `getDueSubscriptions(limit = 10): Promise<DueSubscription[]>`
[`src/db/repositories/subscriptions.ts#L144-L170`](file:///home/afnan/Projects/rss-bot/src/db/repositories/subscriptions.ts#L144-L170)
The heart of the scheduler. Performs an `INNER JOIN` between `subscriptions` and `feed_state`:
```sql
SELECT s.*, fs.etag, fs.last_modified, fs.last_success_at, fs.next_check_at, fs.consecutive_failures
FROM subscriptions s
INNER JOIN feed_state fs ON s.id = fs.subscription_id
WHERE s.enabled = true
  AND fs.next_check_at <= NOW()
ORDER BY fs.next_check_at ASC
LIMIT ${limit};
```

---

### 3. Feed Items Repository (`src/db/repositories/feed-items.ts`)

#### `hasItem(subscriptionId: number, itemKey: string): Promise<boolean>`
[`src/db/repositories/feed-items.ts#L14-L23`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-items.ts#L14-L23)
Executes a high-speed `SELECT EXISTS (...)` query using index `(subscription_id, item_key)`. Returns `true` if the item was already processed.

#### `recordDiscoveredItem(params): Promise<boolean>`
[`src/db/repositories/feed-items.ts#L29-L60`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-items.ts#L29-L60)
Inserts an item with `posted_at = NULL`. If the item already exists, `ON CONFLICT DO NOTHING` silences duplicates and returns `false`.

#### `recordBaselineItems(subscriptionId: number, items: Array<...>): Promise<number>`
[`src/db/repositories/feed-items.ts#L67-L94`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-items.ts#L67-L94)
Executes a bulk multi-row insert for all items present when a feed is first added. Marks `posted_at = NOW()` directly in SQL so historical items are permanently marked as already sent.

#### `markItemPosted(subscriptionId: number, itemKey: string): Promise<void>`
[`src/db/repositories/feed-items.ts#L96-L106`](file:///home/afnan/Projects/rss-bot/src/db/repositories/feed-items.ts#L96-L106)
Updates `posted_at = NOW()` after Discord confirms delivery.

#### `getUnpostedItems(subscriptionId: number, limit = 20): Promise<FeedItem[]>`
Retrieves items discovered but not yet successfully posted to Discord (`posted_at IS NULL`).

---

### 4. Feed State Repository (`src/db/repositories/feed-state.ts`)

#### `upsertFeedState(params): Promise<void>`
Initializes or refreshes feed state. Uses `COALESCE(EXCLUDED.x, feed_state.x)` to preserve existing ETags if new values are not supplied.

#### `updateFeedStateSuccess(subscriptionId, etag, lastModified, nextCheckAt): Promise<void>`
Records successful fetch: stores new `etag` and `last_modified`, sets `last_success_at = NOW()`, schedules `next_check_at`, and resets `consecutive_failures = 0`.

#### `updateFeedStateFailure(subscriptionId, nextCheckAt): Promise<void>`
Records fetch error: updates `next_check_at` with exponential backoff and increments `consecutive_failures = consecutive_failures + 1`.

#### `setNextCheckAt(subscriptionId, nextCheckAt): Promise<void>`
Forces an immediate schedule change (e.g. when `/rss check` is triggered by a user).
