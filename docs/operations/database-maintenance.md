# Database Maintenance & Operations

This guide provides operational best practices for maintaining PostgreSQL with the RSS Discord Bot, focusing on hosted providers like **Supabase** and **Neon**, connection pooling, SSL negotiation, and data retention policies.

---

## ☁️ Provider Configurations & Connection Strings

### 1. Supabase

Supabase provides two distinct connection methods in **Project Settings > Database**:

| Connection Mode | Port | Recommended for Bot? | Details |
| :--- | :---: | :---: | :--- |
| **Transaction Pooler (PgBouncer)** | `6543` | **Yes (Recommended)** | Handles rapid connection cycles and server restarts gracefully. Supports IPv4. |
| **Session Pooler (PgBouncer)** | `5432` | Optional | Persistent sessions. |
| **Direct Connection** | `5432` | Dev Only | Direct PostgreSQL daemon connection. Requires IPv6 compatibility on host. |

#### Connection String Format:
```text
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

> [!IMPORTANT]
> Always use the **Transaction Pooler (port 6543)** when deploying to Render. Render's free container environment operates over IPv4; direct Supabase host connections (`db.xxx.supabase.co`) often default to IPv6 and can experience transient DNS resolution failures.

---

### 2. Neon / Render Managed PostgreSQL

For Neon or Render Postgres, utilize the pooled connection URI provided in the respective dashboard:
```text
postgres://[user]:[password]@[host]-pooler.neon.tech/[database]?sslmode=require
```

---

## 🔒 SSL / TLS Configuration

The bot automatically detects hosted database endpoints in [`src/db/client.ts#L13-L19`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L13-L19):

```typescript
const isRemote = config.DATABASE_URL.includes("supabase.co") ||
                 config.DATABASE_URL.includes("render.com") ||
                 config.DATABASE_URL.includes("pooler.supabase.com");

const sslOption = isProduction || isRemote ? { rejectUnauthorized: false } : undefined;
```

- When running against remote providers or in `NODE_ENV=production`, SSL is activated automatically.
- `rejectUnauthorized: false` ensures connections to pooled cloud instances succeed without requiring manual root CA certificate bundling.

---

## 🧹 Routine Data Retention & Maintenance

As the bot tracks feeds over months, the `feed_items` table accumulates rows. While PostgreSQL B-tree indexes maintain $O(\log N)$ performance, periodic cleanup prevents unnecessary disk consumption.

### Retention Strategy
We only need to retain enough historical items to ensure that when a feed updates, its older entries are recognized as duplicates. Retaining items for **90 days** is ideal for almost all feeds.

### Pruning Query
Run the following SQL script directly in the Supabase SQL Editor or via `psql` once every quarter:

```sql
-- 1. Delete posted items older than 90 days
DELETE FROM feed_items
WHERE discovered_at < NOW() - INTERVAL '90 days'
  AND posted_at IS NOT NULL;

-- 2. Reclaim disk space and recompute index statistics
VACUUM ANALYZE feed_items;
```

> [!WARNING]
> Do **not** truncate the `feed_items` table entirely. If all rows are deleted, the next poll will treat existing feed articles as newly discovered and republish them to Discord.

---

## 🔍 Database Health Checks

To inspect database size and row counts:

```sql
-- Table row counts and disk usage
SELECT
  relname AS table_name,
  n_live_tup AS approximate_row_count,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```
